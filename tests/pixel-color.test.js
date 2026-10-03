const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/frontend/utils/pixelColor.mjs');

test('pixel picker round-trips palette and artwork colors without RGB drift', async () => {
  const { hexToHsv, hsvToHex } = await load();
  for (const color of ['#7b8cf6', '#ff9aba', '#273e61', '#ffffff', '#000000', '#808080', '#56bfe8']) {
    const { h, s, v } = hexToHsv(color);
    assert.equal(hsvToHex(h, s, v), color);
  }
});
test('pixel picker hue wraps and pointer saturation/value clamp at edges', async () => {
  const { hsvToHex } = await load();
  assert.equal(hsvToHex(360, 1, 1), '#ff0000');
  assert.equal(hsvToHex(-120, 1, 1), '#0000ff');
  assert.equal(hsvToHex(60, 2, 2), '#ffff00');
  assert.equal(hsvToHex(120, -1, 1), '#ffffff');
  assert.equal(hsvToHex(120, 1, -1), '#000000');
});
test('pixel picker rejects malformed saved colors', async () => {
  const { hexToHsv } = await load();
  for (const color of ['', '#xyzxyz', 'red', '#fff']) assert.deepEqual(hexToHsv(color), { h: 0, s: 0, v: 0 });
});
