// Limit the oversized phone canvas's fill rate, not the source model/textures.
// Desktop and other SDK canvases keep their native resolution.
export function roomRenderPixelRatio({ width, height, devicePixelRatio = 1, mobile = false } = {}) {
  const nativeRatio = Math.max(1, Number(devicePixelRatio) || 1);
  if (!mobile) return nativeRatio;
  const area = Math.max(1, (Number(width) || 1) * (Number(height) || 1));
  return Math.min(nativeRatio, 2, Math.sqrt(2_000_000 / area));
}
