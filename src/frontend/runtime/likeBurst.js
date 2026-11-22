// A single small canvas carries all the particles for this activation.
export function playLikeBurst(heart, onFinish) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!heart?.isConnected || reduced.matches || document.hidden) return;
  const bounds = heart.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const diameter = 168;
  const layer = document.createElement('canvas');
  layer.className = 'like-burst-layer';
  layer.setAttribute('aria-hidden', 'true');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  layer.width = layer.height = Math.round(diameter * ratio);
  const ctx = layer.getContext('2d');
  if (!ctx) return;
  Object.assign(layer.style, {
    position: 'fixed', inset: '0 auto auto 0', margin: '0', padding: '0', border: '0',
    width: diameter + 'px', height: diameter + 'px', maxWidth: 'none', maxHeight: 'none',
    background: 'transparent', pointerEvents: 'none', zIndex: '2147483647'
  });
  // Keep the spray above a native image dialog and outside clipped cards.
  const topLayer = typeof layer.showPopover === 'function';
  if (topLayer) layer.setAttribute('popover', 'manual');
  (topLayer ? document.body : heart.closest('dialog[open]') || document.body).append(layer);
  if (topLayer) {
    try { layer.showPopover(); }
    catch { layer.remove(); return; }
  }
  const origin = layer.getBoundingClientRect();
  const ink = getComputedStyle(heart).color;
  const colors = [ink, '#fb778c', '#ef496d', '#f8a4b1'];
  const shape = new Path2D('M0 0.92 C-0.29 0.65 -1 0.19 -1 -0.36 C-1 -0.98 -0.32 -1.15 0 -0.58 C0.34 -1.14 1 -0.98 1 -0.36 C1 0.18 0.32 0.65 0 0.92Z');
  const pieces = Array.from({ length: 12 }, (_, i) => {
    const angle = ((i + Math.random() * 0.55) / 12) * Math.PI * 2;
    const reach = 31 + Math.random() * 22;
    return {
      dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach - 40,
      radius: i % 2 ? 1.6 + Math.random() : 3 + Math.random() * 1.6,
      dot: i % 2 === 1, spin: (Math.random() - 0.5) * 2.5,
      life: 550 + Math.random() * 180, color: colors[i % colors.length]
    };
  });
  const pop = heart.animate?.([
    { transform: 'scale(1)' },
    { transform: 'scale(1.17, .77)', offset: .21 },
    { transform: 'scale(.96, 1.22)', offset: .5 },
    { transform: 'scale(1.08, .96)', offset: .72 },
    { transform: 'scale(1)' }
  ], { duration: 345, easing: 'ease-in-out' });
  let frame = 0;
  const start = performance.now();
  function stop() {
    cancelAnimationFrame(frame);
    pop?.cancel();
    layer.remove();
    reduced.removeEventListener('change', stop);
    document.removeEventListener('visibilitychange', stop);
    onFinish();
  }
  function draw(now) {
    const box = heart.getBoundingClientRect();
    if (!heart.isConnected || !box.width || !box.height) { stop(); return; }
    layer.style.left = (box.left + box.width / 2 - diameter / 2 - origin.left) + 'px';
    layer.style.top = (box.top + box.height / 2 - diameter / 2 - origin.top) + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, diameter, diameter);
    let live = false;
    for (const piece of pieces) {
      const t = Math.max(0, now - start) / piece.life;
      if (t >= 1) continue;
      live = true;
      ctx.save();
      ctx.translate(diameter / 2 + piece.dx * t, diameter / 2 + piece.dy * t + 44 * t * t);
      ctx.rotate(piece.spin * t);
      ctx.fillStyle = piece.color;
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.5);
      const size = piece.radius * (1 - .45 * t);
      if (piece.dot) {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.scale(size, size);
        ctx.fill(shape);
      }
      ctx.restore();
    }
    if (live) frame = requestAnimationFrame(draw);
    else stop();
  }
  reduced.addEventListener('change', stop);
  document.addEventListener('visibilitychange', stop);
  draw(start);
  return stop;
}
