/**
 * Original offline billing-ledger reference, Node 24 + node:sqlite only.
 * money_atoms = 10^-9 of the wallet currency. SQLite money is INTEGER, read as BigInt;
 * public JSON results use decimal integer strings. There is no external billing runtime.
 *
 * This is NOT a public API, payment verifier, proxy, production migration system,
 * distributed service, or upstream-cost guarantee. Callers must authenticate users,
 * verify payment/no-consumption evidence, obtain final usage, and calculate prices.
 * A reliable upstream maximum-cost bound is still required to prevent supplier debt;
 * keeping this local wallet nonnegative cannot prove an upstream did not overspend.
 * Unknown requests retain holds indefinitely until supported evidence resolves them.
 * No TTL release, negative wallet, secrets, main-site JWTs, or prompt storage exists here.
 */


const { createHash } = require('node:crypto');

const MAX_MONEY_ATOMS = '9223372036854775807';
const MAX = BigInt(MAX_MONEY_ATOMS);
const DIMENSIONS = ['input_uncached', 'input_cached', 'output'];
const ACTIVE_STATES = ['reserved', 'unknown', 'needs_review'];

class LedgerError extends Error {
  constructor(code, message) { super(message); this.name = 'LedgerError'; this.code = code; }
}
function fail(code, message) { throw new LedgerError(code, message); }
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/.test(value)) {
    fail('INVALID_IDENTIFIER', `${label} must be an opaque identifier of at most 200 characters.`);
  }
  return value;
}
function currency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail('INVALID_CURRENCY', 'An explicit three-letter uppercase currency is required.');
  return value;
}
function fingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_FINGERPRINT', 'request_fingerprint must be a lowercase SHA-256 hex digest.');
  return value;
}
function integer(value, label, { money = false, positive = false, allowNumber = false } = {}) {
  if (allowNumber && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value === 'bigint') value = value.toString();
  if (typeof value !== 'string' || !/^\d{1,128}$/.test(value)) fail('INVALID_INTEGER', `${label} must be a nonnegative decimal integer string of at most 128 digits.`);
  const n = BigInt(value);
  if (positive && n === 0n) fail('NONPOSITIVE_AMOUNT', `${label} must be positive.`);
  if (money && n > MAX) fail('MONEY_OVERFLOW', `${label} exceeds SQLite INTEGER range.`);
  return n;
}
function bounded(value) {
  if (value < 0n || value > MAX) fail('MONEY_OVERFLOW', 'Wallet amount is outside nonnegative SQLite INTEGER range.');
  return value;
}
function objectKeys(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) {
    fail('INVALID_CONTRACT_OBJECT', `${label} must contain exactly: ${expected.join(', ')}.`);
  }
}
function normalizedSnapshot(raw) {
  objectKeys(raw, ['id', 'currency', 'rates_per_million_money_atoms'], 'pricing_snapshot');
  objectKeys(raw.rates_per_million_money_atoms, DIMENSIONS, 'pricing rates');
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 128 ||
      raw.id.trim() !== raw.id || /[\u0000-\u001f\u007f]/.test(raw.id)) {
    fail('INVALID_SNAPSHOT_ID', 'Snapshot ID must be a nonempty stable identifier with no boundary whitespace or control characters.');
  }
  return {
    id: raw.id, currency: currency(raw.currency),
    rates_per_million_money_atoms: Object.fromEntries(DIMENSIONS.map((key) => [key,
      integer(raw.rates_per_million_money_atoms[key], `rate ${key}`).toString()])),
  };
}
function normalizedUsage(raw) {
  objectKeys(raw, DIMENSIONS, 'usage');
  return Object.fromEntries(DIMENSIONS.map((key) => [key, integer(raw[key], `usage ${key}`, { allowNumber: true }).toString()]));
}
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const jsonRow = (row) => row && Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value]));

class BillingLedger {
  #db;
  #faultHook;

  /** faultHook({operation, phase}) is test-only, for before_commit/after_commit crash fixtures. */
  constructor(database) { this.#db = database; }
  close() { /* Borrowed main-site connection; the host owns its lifecycle. */ }
  // Runtime composition uses this one connection so identity, admission metadata,
  // payment ownership and ledger writes commit together. Never expose SQL over HTTP.
  runtimeDatabase() { return this.#db; }
  atomic(action) {
    return this.#transaction('runtime', () => {
      const value = action();
      if (value && typeof value.then === 'function') throw new Error('Transactions must be synchronous');
      return value;
    });
  }
  #get(sql, ...values) { const statement = this.#db.prepare(sql); statement.safeIntegers(true); return statement.get(...values); }
  #all(sql, ...values) { const statement = this.#db.prepare(sql); statement.safeIntegers(true); return statement.all(...values); }
  #run(sql, ...values) { return this.#db.prepare(sql).run(...values); }
  #transaction(operation, action) {
    if (this.#db.inTransaction) return action();
    this.#db.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      const result = action();
      this.#faultHook?.({ operation, phase: 'before_commit' });
      this.#db.exec('COMMIT');
      committed = true;
      this.#faultHook?.({ operation, phase: 'after_commit' });
      return result;
    } catch (cause) {
      if (!committed) this.#db.exec('ROLLBACK');
      throw cause;
    }
  }
  #wallet(userId) {
    const row = this.#get('SELECT * FROM billing_wallets WHERE user_id = ?', userId);
    if (!row) fail('WALLET_NOT_FOUND', 'Create the zero-balance wallet first.');
    return row;
  }
  #request(requestId, requestFingerprint) {
    const row = this.#get('SELECT * FROM billing_requests WHERE request_id = ?', requestId);
    if (!row) fail('REQUEST_NOT_FOUND', 'The request has no durable reservation.');
    if (requestFingerprint !== undefined && row.request_fingerprint !== requestFingerprint) {
      fail('IDEMPOTENCY_CONFLICT', 'request_id was reused for a different request fingerprint.');
    }
    return row;
  }
  #saveWallet(row, balance, held, timestamp) {
    bounded(balance); bounded(held);
    if (held > balance) fail('WALLET_INVARIANT', 'Held money cannot exceed wallet balance.');
    this.#run('UPDATE billing_wallets SET balance_atoms = ?, held_atoms = ?, updated_at = ? WHERE user_id = ?', balance, held, timestamp, row.user_id);
  }
  #entry(row, operation, sourceKind, sourceId, operationFingerprint, balanceDelta, heldDelta, timestamp) {
    this.#run(`INSERT INTO billing_wallet_entries
      (user_id,currency,operation,source_kind,source_id,operation_fingerprint,balance_delta_atoms,held_delta_atoms,balance_after_atoms,held_after_atoms,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, row.user_id, row.currency, operation, sourceKind, sourceId, operationFingerprint,
    balanceDelta, heldDelta, row.balance_atoms + balanceDelta, row.held_atoms + heldDelta, timestamp);
  }
  #requestEvent(requestId, type, operationFingerprint, detail, timestamp) {
    this.#run('INSERT INTO billing_request_events (request_id,event_type,operation_fingerprint,detail_json,created_at) VALUES (?,?,?,?,?)',
      requestId, type, operationFingerprint, JSON.stringify(detail), timestamp);
  }
  #ensureSnapshot(snapshot, snapshotJSON, timestamp) {
    const existing = this.#get('SELECT snapshot_json FROM billing_pricing_snapshots WHERE snapshot_id = ?', snapshot.id);
    if (existing && existing.snapshot_json !== snapshotJSON) fail('PRICING_SNAPSHOT_CONFLICT', 'A pricing snapshot ID cannot be reused with different currency or rates.');
    if (!existing) this.#run('INSERT INTO billing_pricing_snapshots (snapshot_id,currency,snapshot_json,created_at) VALUES (?,?,?,?)', snapshot.id, snapshot.currency, snapshotJSON, timestamp);
  }
  #requestResult(requestId, extra = {}) {
    const request = this.getRequest(requestId);
    return { ...extra, request, wallet: this.getWallet(request.user_id) };
  }

  createWallet({ user_id, currency: walletCurrency }) {
    identifier(user_id, 'user_id'); currency(walletCurrency);
    return this.#transaction('create_wallet', () => {
      const existing = this.#get('SELECT * FROM billing_wallets WHERE user_id = ?', user_id);
      if (existing && existing.currency !== walletCurrency) fail('CURRENCY_MISMATCH', 'One user has one immutable wallet currency.');
      if (!existing) {
        const now = new Date().toISOString();
        this.#run('INSERT INTO billing_wallets (user_id,currency,created_at,updated_at) VALUES (?,?,?,?)', user_id, walletCurrency, now, now);
      }
      return { replayed: Boolean(existing), wallet: this.getWallet(user_id) };
    });
  }
  getWallet(userId) {
    identifier(userId, 'user_id');
    const row = this.#wallet(userId);
    return { user_id: row.user_id, currency: row.currency, balance_atoms: row.balance_atoms.toString(), held_atoms: row.held_atoms.toString(), available_atoms: (row.balance_atoms - row.held_atoms).toString() };
  }
  getRequest(requestId) {
    identifier(requestId, 'request_id');
    const row = this.#request(requestId);
    return { request_id: row.request_id, user_id: row.user_id, request_fingerprint: row.request_fingerprint,
      state: row.state, hold_atoms: row.hold_atoms.toString(), money_atoms: row.actual_atoms?.toString() ?? null,
      pricing_snapshot: JSON.parse(row.pricing_snapshot_json), usage: row.usage_json ? JSON.parse(row.usage_json) : null,
      no_consumption_proof_ref: row.no_consumption_proof_ref, created_at: row.created_at, updated_at: row.updated_at };
  }
  listEntries(userId) {
    identifier(userId, 'user_id');
    return this.#all('SELECT * FROM billing_wallet_entries WHERE user_id = ? ORDER BY entry_id', userId).map(jsonRow);
  }
  listUsageRecords(userId) {
    identifier(userId, 'user_id');
    return this.#all('SELECT * FROM billing_usage_records WHERE user_id = ? ORDER BY created_at, request_id', userId).map(jsonRow);
  }

  /** Already-verified event input simulation ONLY: verified:true is not a signature verifier. */
  creditVerifiedEvent({ verified, source_id, event_id, order_id, user_id, currency: paidCurrency, money_atoms }) {
    if (verified !== true) fail('UNVERIFIED_PAYMENT_EVENT', 'A verified payment event must be supplied by the trusted payment adapter.');
    for (const [label, value] of Object.entries({ source_id, event_id, order_id, user_id })) identifier(value, label);
    currency(paidCurrency);
    const amount = integer(money_atoms, 'money_atoms', { money: true, positive: true });
    const orderFP = hash({ source_id, order_id, user_id, currency: paidCurrency, money_atoms: amount.toString() });
    const eventFP = hash({ source_id, event_id, order_fingerprint: orderFP });
    return this.#transaction('credit', () => {
      const wallet = this.#wallet(user_id);
      if (wallet.currency !== paidCurrency) fail('CURRENCY_MISMATCH', 'Payment currency does not match the wallet.');
      const event = this.#get('SELECT * FROM billing_payment_events WHERE source_id = ? AND event_id = ?', source_id, event_id);
      if (event) {
        if (event.event_fingerprint !== eventFP) fail('IDEMPOTENCY_CONFLICT', 'Payment event ID has a different order or amount.');
        return { credited: false, replayed: true, deduplicated_by: 'event', wallet: this.getWallet(user_id) };
      }
      const order = this.#get('SELECT * FROM billing_payment_orders WHERE source_id = ? AND order_id = ?', source_id, order_id);
      if (order && order.order_fingerprint !== orderFP) fail('IDEMPOTENCY_CONFLICT', 'Payment order ID has a different owner, currency, or amount.');
      const now = new Date().toISOString();
      if (!order) {
        const nextBalance = bounded(wallet.balance_atoms + amount);
        this.#run('INSERT INTO billing_payment_orders (source_id,order_id,user_id,currency,money_atoms,order_fingerprint,created_at) VALUES (?,?,?,?,?,?,?)',
          source_id, order_id, user_id, paidCurrency, amount, orderFP, now);
        this.#saveWallet(wallet, nextBalance, wallet.held_atoms, now);
        this.#entry(wallet, 'credit', 'order', JSON.stringify([source_id, order_id]), orderFP, amount, 0n, now);
      }
      this.#run('INSERT INTO billing_payment_events (source_id,event_id,order_id,event_fingerprint,duplicate_order_credit,created_at) VALUES (?,?,?,?,?,?)',
        source_id, event_id, order_id, eventFP, order ? 1n : 0n, now);
      return { credited: !order, replayed: Boolean(order), deduplicated_by: order ? 'order' : null, wallet: this.getWallet(user_id) };
    });
  }

  reserve({ request_id, user_id, request_fingerprint, hold_atoms, pricing_snapshot }) {
    identifier(request_id, 'request_id'); identifier(user_id, 'user_id'); fingerprint(request_fingerprint);
    const hold = integer(hold_atoms, 'hold_atoms', { money: true });
    const snapshot = normalizedSnapshot(pricing_snapshot);
    const snapshotJSON = JSON.stringify(snapshot);
    const reserveFP = hash({ request_id, user_id, request_fingerprint, hold_atoms: hold.toString(), pricing_snapshot: snapshot });
    return this.#transaction('reserve', () => {
      const existing = this.#get('SELECT * FROM billing_requests WHERE request_id = ?', request_id);
      if (existing) {
        if (existing.reserve_fingerprint !== reserveFP) fail('IDEMPOTENCY_CONFLICT', 'Reservation ID has different request, amount, owner, or pricing.');
        return this.#requestResult(request_id, { replayed: true });
      }
      const wallet = this.#wallet(user_id);
      if (wallet.currency !== snapshot.currency) fail('CURRENCY_MISMATCH', 'Pricing currency does not match the wallet.');
      if (hold > wallet.balance_atoms - wallet.held_atoms) fail('INSUFFICIENT_AVAILABLE', 'Available balance cannot cover this reservation.');
      const now = new Date().toISOString();
      this.#ensureSnapshot(snapshot, snapshotJSON, now);
      this.#run(`INSERT INTO billing_requests
        (request_id,user_id,request_fingerprint,reserve_fingerprint,pricing_snapshot_id,pricing_snapshot_json,hold_atoms,state,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'reserved',?,?)`, request_id, user_id, request_fingerprint, reserveFP, snapshot.id, snapshotJSON, hold, now, now);
      this.#saveWallet(wallet, wallet.balance_atoms, wallet.held_atoms + hold, now);
      this.#entry(wallet, 'reserve', 'request', request_id, reserveFP, 0n, hold, now);
      this.#requestEvent(request_id, 'reserved', reserveFP, { hold_atoms: hold.toString(), pricing_snapshot_id: snapshot.id }, now);
      return this.#requestResult(request_id, { replayed: false });
    });
  }

  /** Accept a trusted calculator's final amount. Deliberately does not recalculate prices. */
  settle({ request_id, request_fingerprint, money_atoms, pricing_snapshot, usage, usage_status }) {
    identifier(request_id, 'request_id'); fingerprint(request_fingerprint);
    if (usage_status !== 'final_usage_observed') fail('FINAL_USAGE_REQUIRED', 'Provisional or unknown usage cannot be settled.');
    const amount = integer(money_atoms, 'money_atoms', { money: true });
    const snapshot = normalizedSnapshot(pricing_snapshot);
    const snapshotJSON = JSON.stringify(snapshot);
    const counters = normalizedUsage(usage);
    const usageJSON = JSON.stringify(counters);
    const settleFP = hash({ request_id, request_fingerprint, money_atoms: amount.toString(), pricing_snapshot: snapshot, usage: counters });
    return this.#transaction('settle', () => {
      const request = this.#request(request_id, request_fingerprint);
      if (request.pricing_snapshot_json !== snapshotJSON) fail('PRICING_SNAPSHOT_CONFLICT', 'Settlement must use the exact frozen reservation snapshot.');
      if (request.settlement_fingerprint && request.settlement_fingerprint !== settleFP) fail('IDEMPOTENCY_CONFLICT', 'Settlement amount or usage changed for this request.');
      if (request.state === 'settled') return this.#requestResult(request_id, { applied: false, replayed: true });
      if (!ACTIVE_STATES.includes(request.state)) fail('INVALID_REQUEST_STATE', 'This request can no longer capture funds.');
      const wallet = this.#wallet(request.user_id);
      const otherHolds = wallet.held_atoms - request.hold_atoms;
      if (otherHolds < 0n) fail('WALLET_INVARIANT', 'The request hold is missing from the wallet.');
      const capacity = wallet.balance_atoms - otherHolds;
      const now = new Date().toISOString();
      if (amount > capacity) {
        // Persist the attempted final amount, but never consume someone else's hold or
        // silently make the wallet negative. Same-payload retry can succeed after credit.
        this.#run(`UPDATE billing_requests SET state='needs_review',actual_atoms=?,usage_json=?,settlement_fingerprint=?,updated_at=? WHERE request_id=?`,
          amount, usageJSON, settleFP, now, request_id);
        if (!request.settlement_fingerprint) this.#requestEvent(request_id, 'needs_review', settleFP,
          { attempted_money_atoms: amount.toString(), capture_capacity_atoms: capacity.toString() }, now);
        return this.#requestResult(request_id, { applied: false, replayed: Boolean(request.settlement_fingerprint), additional_funding_atoms: (amount - capacity).toString() });
      }
      this.#saveWallet(wallet, wallet.balance_atoms - amount, otherHolds, now);
      this.#run(`UPDATE billing_requests SET state='settled',actual_atoms=?,usage_json=?,settlement_fingerprint=?,updated_at=? WHERE request_id=?`,
        amount, usageJSON, settleFP, now, request_id);
      this.#run(`INSERT INTO billing_usage_records
        (request_id,user_id,request_fingerprint,settlement_fingerprint,currency,money_atoms,pricing_snapshot_id,pricing_snapshot_json,usage_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, request_id, request.user_id, request_fingerprint, settleFP, wallet.currency, amount, snapshot.id, snapshotJSON, usageJSON, now);
      this.#entry(wallet, 'settle', 'request', request_id, settleFP, -amount, -request.hold_atoms, now);
      this.#requestEvent(request_id, 'settled', settleFP, { money_atoms: amount.toString(), pricing_snapshot_id: snapshot.id }, now);
      return this.#requestResult(request_id, { applied: true, replayed: false });
    });
  }

  markUnknown({ request_id, request_fingerprint, reason, evidence_ref }) {
    identifier(request_id, 'request_id'); fingerprint(request_fingerprint); identifier(evidence_ref, 'evidence_ref');
    if (!['stream_disconnected', 'missing_final_usage', 'transport_error', 'upstream_result_uncertain', 'process_recovery', 'stream_missing_done', 'usage_exceeds_bound'].includes(reason)) {
      fail('INVALID_UNKNOWN_REASON', 'A recognized uncertainty reason is required.');
    }
    const unknownFP = hash({ request_id, request_fingerprint, reason, evidence_ref });
    return this.#transaction('mark_unknown', () => {
      const request = this.#request(request_id, request_fingerprint);
      if (request.unknown_fingerprint) {
        if (request.unknown_fingerprint !== unknownFP) fail('IDEMPOTENCY_CONFLICT', 'Unknown-state evidence changed for this operation.');
        return this.#requestResult(request_id, { replayed: true });
      }
      if (!['reserved', 'unknown'].includes(request.state)) fail('INVALID_REQUEST_STATE', 'A resolved or needs-review request cannot be downgraded to unknown.');
      const now = new Date().toISOString();
      this.#run("UPDATE billing_requests SET state='unknown',unknown_fingerprint=?,updated_at=? WHERE request_id=?", unknownFP, now, request_id);
      this.#requestEvent(request_id, 'unknown', unknownFP, { reason, evidence_ref }, now);
      return this.#requestResult(request_id, { replayed: false });
    });
  }

  /** Evidence is verified outside this module. No write-off/TTL policy is implemented. */
  releaseWithNoConsumptionProof({ request_id, request_fingerprint, verified_no_consumption, reason, proof_ref }) {
    identifier(request_id, 'request_id'); fingerprint(request_fingerprint); identifier(proof_ref, 'proof_ref');
    if (verified_no_consumption !== true || !['upstream_confirmed_no_consumption', 'cancelled_before_dispatch'].includes(reason)) {
      fail('NO_CONSUMPTION_PROOF_REQUIRED', 'Only verified no-consumption evidence permits release; TTL expiry does not.');
    }
    const releaseFP = hash({ request_id, request_fingerprint, reason, proof_ref });
    return this.#transaction('release', () => {
      const request = this.#request(request_id, request_fingerprint);
      if (request.release_fingerprint) {
        if (request.release_fingerprint !== releaseFP) fail('IDEMPOTENCY_CONFLICT', 'Release evidence changed for this request.');
        return this.#requestResult(request_id, { replayed: true });
      }
      if (!['reserved', 'unknown'].includes(request.state)) fail('INVALID_REQUEST_STATE', 'Observed consumption or a settled request requires a separate correction workflow.');
      const wallet = this.#wallet(request.user_id);
      const now = new Date().toISOString();
      this.#saveWallet(wallet, wallet.balance_atoms, wallet.held_atoms - request.hold_atoms, now);
      this.#run("UPDATE billing_requests SET state='released',release_fingerprint=?,no_consumption_proof_ref=?,updated_at=? WHERE request_id=?",
        releaseFP, proof_ref, now, request_id);
      this.#entry(wallet, 'release', 'request', request_id, releaseFP, 0n, -request.hold_atoms, now);
      this.#requestEvent(request_id, 'released', releaseFP, { reason, proof_ref }, now);
      return this.#requestResult(request_id, { replayed: false });
    });
  }
}

module.exports = { BillingLedger, LedgerError, MAX_MONEY_ATOMS };
