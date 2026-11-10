import { animate, createTimeline } from 'animejs';
import { isReducedPerformance } from './performance';

const PRELUDE_DURATION = 2500;
const PET_SPRITE = '/assets/pets/yachiyo/spritesheet-perf-r2.webp';
const PET_IDLE = '/assets/pets/yachiyo/idle.webp';
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const noise = index => {
  const value = Math.sin(index * 67.31 + 2.8) * 43758.5453;
  return value - Math.floor(value);
};

function textParticles(titles, reduced) {
  const raster = document.createElement('canvas');
  const ctx = raster.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const points = [];
  for (const title of titles) {
    const rect = title.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const style = getComputedStyle(title);
    raster.width = Math.ceil(rect.width);
    raster.height = Math.ceil(rect.height);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.textContent.trim(), rect.width / 2, rect.height / 2, rect.width);
    const pixels = ctx.getImageData(0, 0, raster.width, raster.height).data;
    const step = reduced ? 11 : 7;
    for (let y = 1; y < raster.height; y += step) {
      for (let x = 1; x < raster.width; x += step) {
        if (pixels[(y * raster.width + x) * 4 + 3] > 110) points.push([rect.x + x, rect.y + y]);
      }
    }
  }
  const stride = Math.max(1, Math.ceil(points.length / (reduced ? 75 : 190)));
  return points.filter((_, i) => i % stride === 0).map(([x, y], i) => ({
    x, y,
    dx: (noise(i * 5) - .5) * 118,
    dy: -(22 + noise(i * 5 + 1) * 78),
    size: .55 + noise(i * 5 + 2) * 1.65,
    delay: 95 + noise(i * 5 + 3) * 185
  }));
}

function createPetFlight(root, width, height) {
  const trail = root.querySelector('.moon-entry-trail');
  const pet = root.querySelector('.moon-entry-pet');
  const dock = root.querySelector('.moon-entry-dock').getBoundingClientRect();
  const start = { x: width * .515, y: height * .535 };
  const end = { x: dock.x + dock.width / 2, y: dock.y + dock.height / 2 };
  const span = end.x - start.x;
  const d = `M${start.x} ${start.y} C${start.x + span * .46} ${height * .27} ${end.x - span * .08} ${height * .59} ${end.x} ${end.y}`;
  trail.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const paths = trail.querySelectorAll('path');
  paths.forEach(path => path.setAttribute('d', d));
  const path = paths[0];
  const length = path.getTotalLength();
  pet.style.setProperty('--entry-dock-width', `${dock.width}px`);
  const sprite = new Image();
  sprite.src = PET_SPRITE;
  const point = progress => path.getPointAtLength(length * clamp(progress));
  let previousFrame;
  function draw(progress, time) {
    const p = point(progress);
    const scale = .57 + .43 * progress;
    const running = progress < .97;
    const bounce = running ? Math.sin(time * .021) * 3 * Math.sin(progress * Math.PI) : 0;
    pet.style.transform = `translate3d(${p.x - dock.width / 2}px,${p.y - dock.height / 2 + bounce}px,0) scale(${scale})`;
    const jumping = progress < .28;
    const elapsed = Math.max(0, time - 830);
    const frame = running ? (jumping ? 32 + Math.min(4, Math.floor(elapsed / 70)) : 8 + Math.floor(elapsed / 93) % 8) : 0;
    const useSprite = running && sprite.complete && sprite.naturalWidth > 0;
    const key = useSprite ? frame : -1;
    if (key === previousFrame) return;
    previousFrame = key;
    pet.style.backgroundImage = `url("${useSprite ? PET_SPRITE : PET_IDLE}")`;
    pet.style.backgroundSize = useSprite ? '800% 900%' : '100% 100%';
    pet.style.backgroundPosition = useSprite ? `${(frame % 8) / 7 * 100}% ${Math.floor(frame / 8) / 8 * 100}%` : '0 0';
  }
  return { trail, pet, point, draw };
}

export function playMoonlightEntry(gate) {
  const root = gate.querySelector('.moonlight-entry');
  const select = name => root.querySelector(`.moon-entry-${name}`);
  const width = gate.clientWidth;
  const height = gate.clientHeight;
  const reduced = isReducedPerformance();
  const titleArea = select('direct-copy');
  const titles = [...(titleArea?.querySelectorAll('.access-title, .access-kicker, .access-subtitle') || [])];
  const ripple = select('ripple');
  const seal = select('seal');
  const source = select('badge').getBoundingClientRect();
  Object.assign(ripple.style, { left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px` });
  const particles = textParticles(titles, reduced);
  const canvas = select('dust');
  const ratio = Math.min(devicePixelRatio || 1, reduced ? 1 : 1.35);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx?.scale(ratio, ratio);
  const flight = createPetFlight(root, width, height);
  const state = { travel: 0 };
  let resolve;
  const finished = new Promise(done => { resolve = done; });
  let hadDust = false;

  function draw(time) {
    if (time >= 800) flight.draw(state.travel, time);
    if (!ctx) return;
    const hasDust = time < 930 || (time >= 860 && time < 2280);
    if (!hasDust && !hadDust) return;
    hadDust = hasDust;
    ctx.clearRect(0, 0, width, height);
    if (time < 930) {
      ctx.fillStyle = '#fff0d0';
      for (const particle of particles) {
        const age = (time - particle.delay) / 610;
        if (age < 0 || age > 1) continue;
        ctx.globalAlpha = Math.sin(age * Math.PI) * .82;
        ctx.fillRect(particle.x + particle.dx * age, particle.y + particle.dy * age, particle.size, particle.size);
      }
    }
    if (time >= 860 && time < 2280) {
      ctx.fillStyle = '#ffdfa3';
      for (let i = 0; i < 13; i++) {
        const age = i / 13;
        const p = flight.point(state.travel - age * .16);
        ctx.globalAlpha = (1 - age) * .88 * (1 - clamp((time - 1820) / 460));
        ctx.fillRect(p.x + (noise(i) - .5) * age * 28, p.y + (noise(i + 20) - .5) * age * 26, 2.7 - age * 1.8, 2.7 - age * 1.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  const film = createTimeline({
    autoplay: false,
    defaults: { ease: 'outQuad' },
    onRender: self => draw(self.currentTime),
    onComplete: () => resolve()
  });
  if (titles.length) film.add(titles, { translateY: [0, -20], opacity: [1, 0], duration: 430 }, 60);
  film
    .add(ripple, { scale: [1, 1.62], opacity: [{ to: .82, duration: 75 }, { to: 0, duration: 480 }] }, 0)
    .add(seal, { scale: [.55, 1], opacity: 1, duration: 690 }, 75)
    .add(select('orbit'), { rotate: [-9, 38], duration: 1800, ease: 'linear' }, 120)
    .add(select('corridor'), { opacity: [.38, 1], scale: [1, 1.16], duration: 910, ease: 'inOutQuad' }, 320)
    .add(select('vignette'), { opacity: [0, .88], duration: 740 }, 410)
    .add(flight.trail, { opacity: [0, .86], duration: 210 }, 810)
    .add(flight.pet, { opacity: [0, 1], duration: 190 }, 815)
    .add(state, { travel: [0, .82], duration: 895, ease: 'inOutSine' }, 815)
    .add(flight.trail, { opacity: .46, duration: 450 }, 1820)
    .add(state, { travel: 1, duration: PRELUDE_DURATION - 1710, ease: 'inOutSine' }, 1710)
    .add(seal, { opacity: .16, scale: 1.42, duration: 420 }, 1500)
    .add(select('portrait'), { opacity: [0, 1], translateY: [16, 0], scale: [.94, 1], duration: 490 }, 1590)
    .add(select('beam'), { opacity: [0, .84], duration: 610, ease: 'inOutQuad' }, 1670)
    .add(select('portrait'), { filter: ['brightness(.25)', 'brightness(1.05)'], duration: 570, ease: 'inOutQuad' }, 1685)
    .add(select('slogan'), { opacity: [0, 1], translateY: [8, 0], letterSpacing: ['0.4em', '0.08em'], duration: 560 }, 1930);

  [...root.querySelectorAll('.moon-entry-frame')].forEach((frame, index) => {
    const side = index % 2 ? 1 : -1;
    const depth = Math.floor(index / 2);
    const band = Math.min(height * .16, 130);
    const y = (depth - 1) * band + (side === 1 ? 12 : -12);
    const nearEdge = width * (width < 600 ? .23 : .15);
    film.add(frame, {
      translateX: [side * nearEdge, side * (width / 2 + 110)],
      translateY: [y * .68, y * 1.2 + 22],
      rotateY: [-side * 12, -side * 28],
      rotateZ: [side * 1, side * 4],
      scale: [.33, 1.22],
      opacity: [{ to: .93, duration: 180 }, { to: .94, duration: 260 }, { to: 0, duration: 248 }],
      duration: 688,
      ease: 'inQuad'
    }, 765 + depth * 115 + (side === 1 ? 31 : 0));
  });
  flight.draw(0, 0);
  film.play();

  return {
    finished,
    stop() { film.pause(); resolve(); },
    reveal() {
      return animate(select('glare'), {
        opacity: [{ from: .12, to: .67, duration: 240 }, { to: 0, duration: 410 }],
        scale: [.64, 1.56],
        duration: 650,
        ease: 'outQuad'
      });
    },
    dispose() { film.revert(); resolve(); }
  };
}
