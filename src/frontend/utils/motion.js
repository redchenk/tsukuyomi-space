import { isReducedPerformance } from './performance';

const activeRouteMotion = new WeakMap();
const IMMERSIVE_PAGES = '.access-page, .auth-page, .room-page, .live2d-page, .arena-page, .game-page';

function routeMotionDisabled(element) {
  return document.visibilityState === 'hidden'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    || element.matches(IMMERSIVE_PAGES) || element.querySelector?.(IMMERSIVE_PAGES)
    || typeof element.animate !== 'function';
}

export function cancelRouteMotion(element) {
  activeRouteMotion.get(element)?.();
}

function animateRoute(element, done, leaving) {
  cancelRouteMotion(element);
  if (!element || routeMotionDisabled(element)) {
    if (leaving) queueMicrotask(done);
    else done();
    return;
  }
  // One opacity layer: no blur, scaling or transformed fixed-position children.
  const duration = isReducedPerformance() ? (leaving ? 70 : 130) : (leaving ? 110 : 220);
  let animation;
  let timer;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    activeRouteMotion.delete(element);
    element.classList.remove('route-motion-target');
    done();
    animation?.cancel();
  };
  try {
    element.classList.add('route-motion-target');
    animation = element.animate(
      [{ opacity: leaving ? 1 : 0 }, { opacity: leaving ? 0 : 1 }],
      { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' }
    );
    activeRouteMotion.set(element, finish);
    animation.finished.then(finish, finish);
    timer = setTimeout(finish, duration + 100);
  } catch (_) {
    queueMicrotask(finish);
  }
}

export function animateRouteEnter(element, done) {
  animateRoute(element, done, false);
}

export function animateRouteLeave(element, done) {
  animateRoute(element, done, true);
}
