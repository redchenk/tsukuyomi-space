// Versioned application-API tariff. Existing three-token and TTS contracts
// stay unchanged. All units and rational rates are frozen before dispatch.
const UNIT = 'deepseek-apps-v1';
const DIMENSIONS = ['input_uncached', 'input_cached', 'output', 'search', 'fetch', 'image_search', 'ocr_pages', 'asr_seconds'];
const integer = value => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,30})$/.test(value)) throw new Error('Invalid DeepSeek billing integer');
  return BigInt(value);
};
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) throw new Error('Invalid DeepSeek billing fields');
}
function snapshot(raw) {
  keys(raw, ['id', 'currency', 'unit', 'rates']);
  if (raw.unit !== UNIT || raw.currency !== 'CNY' || !/^[A-Za-z0-9._:-]{1,128}$/.test(raw.id)) throw new Error('Invalid DeepSeek pricing snapshot');
  keys(raw.rates, DIMENSIONS);
  const rates = {};
  for (const key of DIMENSIONS) {
    keys(raw.rates[key], ['numerator', 'denominator']);
    const n = integer(raw.rates[key].numerator), d = integer(raw.rates[key].denominator);
    if (!d) throw new Error('Invalid DeepSeek rate denominator');
    rates[key] = { numerator: String(n), denominator: String(d) };
  }
  return { id: raw.id, currency: 'CNY', unit: UNIT, rates };
}
function usage(raw) { keys(raw, DIMENSIONS); return Object.fromEntries(DIMENSIONS.map(k => [k, String(integer(raw[k]))])); }
const zero = () => Object.fromEntries(DIMENSIONS.map(k => [k, '0']));
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function price(raw, counts) {
  const s = snapshot(raw), u = usage(counts);
  let n = 0n, d = 1n;
  const dimensions = {};
  for (const key of DIMENSIONS) {
    const a = BigInt(u[key]) * BigInt(s.rates[key].numerator), b = BigInt(s.rates[key].denominator);
    dimensions[key] = { numerator: String(a), denominator: String(b) };
    const factor = gcd(d, b); n = n * (b / factor) + a * (d / factor); d = d / factor * b;
  }
  return { money_atoms: String((n + d - 1n) / d), pricing_snapshot: s, pricing_snapshot_id: s.id, currency: 'CNY',
    tokens: u, units: u, rounding: 'ceil_once_per_request', dimension_costs: dimensions };
}
module.exports = { UNIT, DIMENSIONS, snapshot, usage, zero, price };
