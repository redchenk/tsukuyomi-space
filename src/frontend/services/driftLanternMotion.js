export const FILM = Object.freeze({
  ignite: 600,
  shore: 3200,
  zoom: 4000,
  cover: 5180,
  end: 5630
});

const clamp = (v, low = 0, high = 1) => Math.min(high, Math.max(low, v));
const mix = (a, b, t) => a + (b - a) * t;
const progress = (t, a, b) => clamp((t - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const cubic = (a, b, c, d, t) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
};

export function lakeIgnition(time) {
  return time < FILM.ignite ? Math.sin(progress(time, 0, FILM.ignite) * Math.PI) ** 2 : 0;
}

function waterEase(x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(0, .25, .25, 1, mid) < x) lo = mid;
    else hi = mid;
  }
  return cubic(0, .1, 1, 1, (lo + hi) / 2);
}

// The image coordinates are measured on the desktop and portrait paintings.
// Convert them through the same object-fit crop as the visible picture.
export function measureLakeFilm(image, anchor, objectPosition, viewport) {
  const portrait = image.naturalHeight > image.naturalWidth;
  const art = portrait
    ? { moonX: .882, moonY: .233, radius: .083, shoreY: .462 }
    : { moonX: .736, moonY: .119, radius: .0475, shoreY: .444 };
  const ratio = Math.max(image.width / image.naturalWidth, image.height / image.naturalHeight);
  const position = objectPosition.split(/\s+/).map(value => {
    if (value === 'top' || value === 'left') return 0;
    if (value === 'bottom' || value === 'right') return 1;
    return value.endsWith('%') ? parseFloat(value) / 100 : .5;
  });
  const width = image.naturalWidth * ratio;
  const height = image.naturalHeight * ratio;
  const draw = {
    x: image.left + (image.width - width) * (position[0] ?? .5),
    y: image.top + (image.height - height) * (position[1] ?? .5),
    width, height
  };
  const moon = { x: draw.x + width * art.moonX, y: draw.y + height * art.moonY, radius: width * art.radius };
  const start = { x: anchor.left + anchor.width / 2, y: anchor.top };
  const shore = {
    x: clamp(moon.x - image.width * .009, image.left + 14, image.right - 14),
    y: Math.min(start.y - 14, draw.y + height * art.shoreY + (portrait ? 8 : 12))
  };
  return {
    image, draw, moon, start, shore, portrait,
    sway: Math.min(image.width * .041, 56),
    lanternWidth: anchor.width,
    viewport
  };
}

export function lakeWaterPoint(time, geometry) {
  const { start, shore, sway } = geometry;
  const raw = progress(time, FILM.ignite, FILM.shore);
  const t = raw === 0 || raw === 1 ? raw : waterEase(raw);
  const dx = shore.x - start.x;
  return {
    x: cubic(start.x, start.x + dx * .26 - sway, shore.x + sway, shore.x, t),
    y: cubic(start.y, mix(start.y, shore.y, .06), mix(start.y, shore.y, .91), shore.y, t)
      + Math.sin(raw * Math.PI * 4) * Math.sin(raw * Math.PI) * (1 - t) * 4,
    size: mix(1, .15, t),
    rotation: Math.sin(raw * Math.PI * 4.2) * Math.sin(raw * Math.PI) * 2
  };
}

export function lakeLightPoint(time, { moon, shore, sway }) {
  const p = smooth(progress(time, FILM.shore, 3850));
  return {
    x: cubic(shore.x, shore.x + sway * .72, moon.x - sway * .42, moon.x, p),
    y: cubic(shore.y - 3, mix(shore.y, moon.y, .22), mix(shore.y, moon.y, .7), moon.y, p)
  };
}

export function lakeCamera(time, { moon, viewport }) {
  // Match the static and moving paintings before moving the focal point.
  const t = progress(time, 4140, FILM.cover);
  const push = t * t * (2 - t);
  return {
    x: mix(moon.x, viewport.width / 2, smooth(clamp(t * 1.32))),
    y: mix(moon.y, viewport.height / 2, smooth(clamp(t * 1.32))),
    scale: Math.pow(18, push),
    blur: 12 * smooth(t),
    reveal: smooth(progress(time, FILM.zoom, 4140)),
    veil: time < FILM.cover
      ? smooth(progress(time, 4660, FILM.cover))
      : 1 - smooth(progress(time, FILM.cover + 45, FILM.end))
  };
}
