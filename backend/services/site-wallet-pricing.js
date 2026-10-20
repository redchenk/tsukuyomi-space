/**
 * Original offline pricing reference. Node.js standard library only.
 *
 * This is a three-dimension contract for normalized, mutually exclusive token
 * counts: input_uncached, input_cached, output. Output already includes reasoning
 * under the provider contract selected by the caller. Raw provider usage is NOT
 * accepted here. In particular, Anthropic cache creation, images, audio, search,
 * tools, per-request prices and tiered prices require separately reviewed adapters.
 * Unknown dimensions, including cache_write, fail closed even when their value is 0.
 *
 * One currency unit is 1,000,000,000 money_atoms. Each rate is an integer number of
 * money_atoms per 1,000,000 tokens. All products/sums/division use BigInt. One request
 * gets ONE ceiling after its complete numerator is accumulated; never price chunks
 * or individual dimensions and then add their already rounded charges.
 *
 * The caller must supply the immutable pricing snapshot captured at reservation.
 * This function never retrieves current prices, performs FX, stores a wallet,
 * calls a provider, or establishes whether usage is final or a bill was committed.
 * Snapshot-ID uniqueness/content immutability must be enforced by the price store.
 * All tests are artificial offline fixtures, not provider or payment certification.
 */

class PricingContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PricingContractError';
    this.code = code;
  }
}

const MONEY_ATOMS_PER_CURRENCY_UNIT = '1000000000';
const TOKENS_PER_RATE_UNIT = '1000000';
const MAX_INTEGER_DIGITS = 128;
const PRICING_DIMENSIONS = Object.freeze(['input_uncached', 'input_cached', 'output']);

const RATE_DENOMINATOR = 1000000n;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function fail(code, message) {
  throw new PricingContractError(code, message);
}

function objectFields(value, allowed, code, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be a plain JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, `${label} must be a plain JSON object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      fail(code, `${label} contains an unsupported field or billing dimension.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !own(descriptor, 'value')) {
      fail(code, `${label} must contain data properties, not accessors.`);
    }
  }
  for (const key of allowed) {
    if (!own(value, key)) fail(code, `${label}.${key} is required; no value is inferred.`);
  }
  return value;
}

function integer(value, label, allowNumber) {
  if (allowNumber && typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail('INVALID_TOKEN_COUNT', `${label} must be a nonnegative safe integer or decimal integer string.`);
    }
    return BigInt(value);
  }
  const code = allowNumber ? 'INVALID_TOKEN_COUNT' : 'INVALID_RATE';
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    fail(code, `${label} must be a nonnegative decimal integer string.`);
  }
  if (value.length > MAX_INTEGER_DIGITS) {
    fail('INTEGER_TOO_LONG', `${label} exceeds the explicit ${MAX_INTEGER_DIGITS}-digit input limit.`);
  }
  return BigInt(value);
}

function snapshotForPricing(snapshot) {
  objectFields(snapshot, ['id', 'currency', 'rates_per_million_money_atoms'], 'INVALID_SNAPSHOT', 'snapshot');
  if (typeof snapshot.id !== 'string' || snapshot.id.length === 0 || snapshot.id.length > 128 ||
      snapshot.id.trim() !== snapshot.id || /[\u0000-\u001f\u007f]/.test(snapshot.id)) {
    fail('INVALID_SNAPSHOT_ID', 'snapshot.id must be an explicit nonempty stable identifier.');
  }
  // Format validation only; this does not certify ISO registration or perform FX.
  if (typeof snapshot.currency !== 'string' || !/^[A-Z]{3}$/.test(snapshot.currency)) {
    fail('INVALID_CURRENCY', 'snapshot.currency must be an explicit uppercase three-letter accounting currency code.');
  }
  objectFields(snapshot.rates_per_million_money_atoms, PRICING_DIMENSIONS,
    'UNSUPPORTED_PRICING_DIMENSIONS', 'snapshot.rates_per_million_money_atoms');
  const rates = Object.fromEntries(PRICING_DIMENSIONS.map((dimension) => [dimension,
    integer(snapshot.rates_per_million_money_atoms[dimension], `rate.${dimension}`, false).toString(),
  ]));
  return Object.freeze({
    id: snapshot.id,
    currency: snapshot.currency,
    rates_per_million_money_atoms: Object.freeze(rates),
  });
}

/**
 * priceUsage(snapshot, { input_uncached, input_cached, output })
 *
 * Tokens accept safe JS integers or decimal integer strings. Rates MUST be strings.
 * Inputs up to MAX_INTEGER_DIGITS digits are supported and canonicalized on output.
 * The result is JSON-safe: all counters, amounts, numerators and the denominator
 * are strings. The result's copied snapshot is immutable, but is not a signature.
 * A downstream SQLite/SQL ledger must additionally enforce its own integer bounds.
 */
function priceUsage(snapshot, usage) {
  const pricingSnapshot = snapshotForPricing(snapshot);
  objectFields(usage, PRICING_DIMENSIONS, 'UNSUPPORTED_USAGE_DIMENSIONS', 'usage');
  let numerator = 0n;
  const tokens = {};
  const dimensionNumerators = {};
  for (const dimension of PRICING_DIMENSIONS) {
    const count = integer(usage[dimension], `usage.${dimension}`, true);
    const rate = BigInt(pricingSnapshot.rates_per_million_money_atoms[dimension]);
    const contribution = count * rate;
    tokens[dimension] = count.toString();
    dimensionNumerators[dimension] = contribution.toString();
    numerator += contribution;
  }
  const charge = (numerator + RATE_DENOMINATOR - 1n) / RATE_DENOMINATOR;
  return Object.freeze({
    pricing_snapshot_id: pricingSnapshot.id,
    pricing_snapshot: pricingSnapshot,
    currency: pricingSnapshot.currency,
    money_atoms_per_currency_unit: MONEY_ATOMS_PER_CURRENCY_UNIT,
    money_atoms: charge.toString(),
    exact_numerator_money_atoms: numerator.toString(),
    denominator: TOKENS_PER_RATE_UNIT,
    rounding: 'ceil_once_per_request',
    tokens: Object.freeze(tokens),
    dimension_numerators_money_atoms: Object.freeze(dimensionNumerators),
  });
}

/** Fictional teaching rates, NOT official provider prices and NOT a default tariff. */
const EXAMPLE_ONLY_PRICING_SNAPSHOT = Object.freeze({
  id: 'example-only-not-official-v1',
  currency: 'CNY',
  rates_per_million_money_atoms: Object.freeze({
    input_uncached: '2000000000', // Example only: CNY 2 per million uncached input.
    input_cached: '200000000',   // Example only: CNY 0.2 per million cached input.
    output: '8000000000',        // Example only: CNY 8 per million output.
  }),
});

module.exports = { priceUsage };
