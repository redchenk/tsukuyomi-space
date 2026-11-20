// Pixel landmarks are measured in the supplied 1280 × 796 still.
export const frame = {
  width: 1280, skyTop: 85, height: 711, focal: 760, horizon: 629,
  eye: 0.022,
};
const centerY = frame.skyTop + frame.height / 2;
export const openingPitch = Math.atan((frame.horizon - centerY) / frame.focal);
export const openingFov = 2 * Math.atan(frame.height / (2 * frame.focal)) * 180 / Math.PI;

export function atHeight(pixelX, pixelY, height) {
  const up = (centerY - pixelY) / frame.focal;
  const c = Math.cos(openingPitch), s = Math.sin(openingPitch);
  const distance = (height - frame.eye) / (s + up * c);
  return { x: distance * (pixelX - frame.width / 2) / frame.focal,
    z: distance * (up * s - c) };
}
