import { waapi } from 'animejs/waapi';
import { isReducedPerformance } from './performance';

const MAX_ROUTE_TARGETS = 6;
const ROUTE_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const activeRouteMotion = new WeakMap();

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function routeMotionDisabled(element) {
  return document.visibilityState === 'hidden'
    || prefersReducedMotion()
    || isReducedPerformance()
    || element.matches('.hub, .access-page, .auth-page, .room-page, .live2d-page, .arena-page');
}

function routeTargets(element) {
  return Array.from(element.children)
    .filter((child) => !['SCRIPT', 'STYLE'].includes(child.tagName) && !child.hidden)
    .slice(0, MAX_ROUTE_TARGETS);
}

function settleRouteMotion(element, state, notifyVue) {
  if (!state || state.settled) return;
  state.settled = true;
  activeRouteMotion.delete(element);
  for (const target of state.targets) target.classList.remove('route-motion-target');
  for (const animation of state.animations) {
    try {
      animation.revert();
    } catch (_) {
      // The browser can discard an animation when its route node is removed.
    }
  }
  if (notifyVue) state.done();
}

export function cancelRouteMotion(element) {
  settleRouteMotion(element, activeRouteMotion.get(element), false);
}

export function animateRouteEnter(element, done) {
  cancelRouteMotion(element);
  if (!(element instanceof Element) || routeMotionDisabled(element)) {
    done();
    return;
  }

  const targets = routeTargets(element);
  const animatedTargets = targets.length ? targets : [element];
  for (const target of animatedTargets) target.classList.add('route-motion-target');

  try {
    const animations = [
      waapi.animate(element, {
        opacity: { from: 0.76, to: 1 },
        duration: 180,
        ease: ROUTE_EASE
      })
    ];
    if (targets.length) {
      animations.push(waapi.animate(targets, {
        opacity: { from: 0.88, to: 1 },
        y: { from: '7px', to: '0px' },
        delay: (_, index) => Math.min(index * 18, 90),
        duration: 260,
        ease: ROUTE_EASE
      }));
    }

    const state = { animations, done, settled: false, targets: animatedTargets };
    activeRouteMotion.set(element, state);
    Promise.all(animations.map((animation) => animation.then()))
      .then(() => settleRouteMotion(element, state, true))
      .catch(() => settleRouteMotion(element, state, true));
  } catch (_) {
    for (const target of animatedTargets) target.classList.remove('route-motion-target');
    done();
  }
}
