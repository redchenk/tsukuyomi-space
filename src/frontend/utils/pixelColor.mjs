export function hexToHsv(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) return { h: 0, s: 0, v: 0 };
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rgb[0]) h = ((rgb[1] - rgb[2]) / delta) % 6;
    else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / delta + 2;
    else h = (rgb[0] - rgb[1]) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

export function hsvToHex(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, s));
  const value = Math.max(0, Math.min(1, v));
  const c = value * saturation, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = value - c;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60)];
  return '#' + rgb.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('');
}
