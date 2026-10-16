// Cut a hole in the covering surface, keeping the live destination underneath.
export function animateCircleReveal(element, origin) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const x = Math.max(0, Math.min(width, origin.x));
  const y = Math.max(0, Math.min(height, origin.y));
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
  const path = r => `path(evenodd, "M0 0H${width}V${height}H0Z M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z")`;
  const circular = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && CSS.supports('clip-path', path(0.1));
  return element.animate(circular
    ? [{ clipPath: path(0.1) }, { clipPath: path(radius) }]
    : [{ opacity: 1 }, { opacity: 0 }], {
    duration: circular ? 650 : 140,
    easing: circular ? 'cubic-bezier(.4, 0, .2, 1)' : 'ease-out',
    fill: 'forwards'
  });
}
