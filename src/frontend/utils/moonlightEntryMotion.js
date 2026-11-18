import { animate, createTimeline } from 'animejs';

// The welcome holds briefly after Yachiyo opens her hand, even on a warm route.
const WELCOME_END = 2500;

export function playMoonlightEntry(gate) {
  const root = gate.querySelector('.moonlight-entry');
  const select = name => root.querySelector(`.moon-entry-${name}`);
  const seal = select('seal');
  const handLight = select('hand-light');
  let resolve;
  const finished = new Promise(done => { resolve = done; });
  const film = createTimeline({
    autoplay: false,
    defaults: { ease: 'outQuad' },
    onComplete: () => resolve()
  });

  film
    .add(select('direct-copy'), { translateY: [0, -8], opacity: [1, 0], duration: 400 }, 100)
    .add(select('corridor'), { opacity: [.4, 1], scale: [1, 1.06], duration: 1250, ease: 'inOutSine' }, 0)
    .add(select('orbit'), { rotate: [-12, 22], duration: 920, ease: 'inOutSine' }, 0)
    .add(seal, { scale: [.92, 1.08], opacity: [1, 0], duration: 520 }, 370);

  [...root.querySelectorAll('.moon-entry-frame')].forEach((frame, index) => {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const band = (row - 1) * Math.min(gate.clientHeight * .15, 108);
    film.add(frame, {
      translateX: [side * gate.clientWidth * .15, side * (gate.clientWidth / 2 + 140)],
      translateY: [band, band * 1.25],
      rotateY: [side * -8, side * -18],
      scale: [.36, 1.02],
      opacity: [{ to: .75, duration: 160 }, { to: 0, duration: 360 }],
      duration: 520,
      ease: 'inQuad'
    }, 190 + row * 85);
  });

  film
    .add(select('vignette'), { opacity: [0, 1], duration: 730 }, 360)
    .add(select('portrait'), {
      opacity: [0, 1], translateY: [10, 0], scale: [.985, 1], duration: 600, ease: 'outCubic'
    }, 680)
    .add(select('slogan'), { opacity: [0, 1], translateY: [6, 0], duration: 420 }, 1090)
    .add(handLight, { opacity: [0, 1], scale: [.65, 1], duration: 430 }, 1330)
    .add(select('hand-ring'), { opacity: [.57, 0], scale: [.55, 1.9], duration: 810 }, 1560)
    .add(handLight, { scale: 1.12, duration: WELCOME_END - 1760, ease: 'inOutSine' }, 1760);
  film.play();

  function origin() {
    const hand = handLight.getBoundingClientRect();
    if (!hand.width) return { x: gate.clientWidth / 2, y: gate.clientHeight / 2 };
    return { x: hand.left + hand.width / 2, y: hand.top + hand.height / 2 };
  }
  return {
    finished,
    origin,
    reveal({ x, y }) {
      const glare = select('glare');
      glare.style.setProperty('--moonlight-x', `${x}px`);
      glare.style.setProperty('--moonlight-y', `${y}px`);
      return animate(glare, {
        opacity: [{ from: 0, to: .46, duration: 150 }, { to: 0, duration: 430 }],
        ease: 'outSine'
      });
    },
    dispose() { film.revert(); resolve(); }
  };
}
