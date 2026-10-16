import { isReducedPerformance, PERFORMANCE_PROFILE_EVENT } from './performance';

const BLOCKS = '[data-scroll-reveal], .panel, [data-material="content"], [data-material="card"], .scene-card, .stage-card, .gallery-card, .plaza-msg-card, .friend-link-card, .notification-card, .attachments-card, .uc-card, .uc-article-item, .uc-pixel-card, .profile-article, .artwork-card, .room-settings-card, .terminal-card, .growth-overview, .growth-task-card, .download-app-card, .reality-section, .wiki-entry-section, .article-content > *, .wiki-entry-article > p';
const TARGETS = `${BLOCKS}, h1, h2, h3`;
const EXCLUDED = '[data-scroll-reveal="off"], [role="dialog"], [contenteditable], textarea, pre, .room-chat-messages, .room-chat-composer, .arena-canvas-viewport, .game-stage, .live2d-stage, .ts-skeleton';

// Content is visible by default. Only a viewport re-entry gets an animation;
// failed JS, initial rendering, find-in-page and cached returns stay readable.
export function installScrollReveal(root) {
  if (!root || typeof IntersectionObserver !== 'function') return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map();
  const active = new Set();
  let frame = 0;
  let stopped = false;
  const additions = new Set();
  const removals = new Set();
  const disabled = () => reduced.matches || document.visibilityState === 'hidden';

  function scrollContainer(element, containers) {
    const visited = [];
    for (let parent = element.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
      visited.push(parent);
      const container = containers.has(parent) ? containers.get(parent)
        : /auto|scroll/.test(getComputedStyle(parent).overflowY) ? parent : undefined;
      if (container !== undefined) {
        visited.forEach(node => containers.set(node, container));
        return container;
      }
    }
    visited.forEach(node => containers.set(node, null));
    return null;
  }

  function cancel(element, state) {
    state.animation?.cancel();
    state.animation = null;
    active.delete(element);
    element.classList.remove('scroll-reveal-active');
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const element = entry.target;
      const state = states.get(element);
      if (!state) continue;
      if (!entry.isIntersecting) {
        state.outside = true;
        const edge = Math.max(entry.rootBounds?.top || 0, state.container?.getBoundingClientRect().top || 0);
        state.side = entry.boundingClientRect.bottom <= edge ? 'above' : 'below';
        continue;
      }
      if (!state.outside) continue;
      state.outside = false;
      if (disabled() || element.contains(document.activeElement) || !element.animate) continue;
      // Small edge reversals (including the reveal's own translation) should
      // finish the current motion, not repeatedly flash and restart opacity.
      if (state.animation || performance.now() - state.lastPlayed < 300) continue;
      cancel(element, state);
      const low = isReducedPerformance();
      const distance = low ? 8 : 18;
      state.lastPlayed = performance.now();
      element.dataset.scrollMotion = `from-${state.side}`;
      element.classList.add('scroll-reveal-active');
      const animation = element.animate([
        { opacity: 0.65, translate: `0 ${state.side === 'above' ? -distance : distance}px` },
        { opacity: 1, translate: '0 0' }
      ], { duration: low ? 180 : 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      state.animation = animation;
      active.add(element);
      animation.finished.catch(() => {}).finally(() => {
        if (state.animation === animation) cancel(element, state);
      });
    }
  }, { threshold: 0, rootMargin: '-16px 0px -16px 0px' });

  function register(element, containers, pending) {
    if (states.has(element) || element.closest(EXCLUDED)) return;
    // Animate cards as a single unit, not both the card and all its headings.
    let parent = element.parentElement?.closest(TARGETS);
    while (parent && root.contains(parent)) {
      if (states.has(parent)) return;
      parent = parent.parentElement?.closest(TARGETS);
    }
    const style = getComputedStyle(element);
    if (style.position === 'fixed' || style.position === 'sticky' || style.display === 'contents') return;
    const box = element.getBoundingClientRect();
    // Large structural wrappers remain stationary; their smaller descendants
    // can still enter separately, with no transformed fixed/sticky containers.
    if (box.height > window.innerHeight * 0.9 || !box.height) return;
    const outside = box.bottom <= 16 || box.top >= window.innerHeight - 16;
    states.set(element, { outside, side: box.bottom <= 16 ? 'above' : 'below', container: scrollContainer(element, containers), animation: null, lastPlayed: -Infinity });
    pending.push(element);
  }

  function scan(node, containers, pending) {
    if (!(node instanceof Element) || node.closest(EXCLUDED)) return;
    if (node.matches(TARGETS)) register(node, containers, pending);
    node.querySelectorAll(TARGETS).forEach(element => register(element, containers, pending));
  }

  function forget(element) {
    const state = states.get(element);
    if (!state || root.contains(element)) return;
    cancel(element, state);
    observer.unobserve(element);
    delete element.dataset.scrollMotion;
    states.delete(element);
  }

  function refresh() {
    frame = 0;
    for (const node of removals) {
      forget(node);
      node.querySelectorAll('[data-scroll-motion]').forEach(forget);
    }
    removals.clear();
    const containers = new WeakMap();
    const pending = [];
    additions.forEach(node => {
      if (!root.contains(node)) return;
      for (let parent = node.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
        if (additions.has(parent)) return;
      }
      scan(node, containers, pending);
    });
    additions.clear();
    // Complete geometry reads before attributes/observers can invalidate style.
    for (const element of pending) {
      element.dataset.scrollMotion = 'ready';
      observer.observe(element);
    }
  }

  const mutations = new MutationObserver(records => {
    for (const record of records) {
      if (record.target instanceof Element && record.target.closest(EXCLUDED)) continue;
      if (record.type === 'attributes') {
        if (record.attributeName !== 'style' || /display\s*:/.test(`${record.oldValue || ''};${record.target.getAttribute('style') || ''}`)) {
          additions.add(record.target);
          if (!frame) frame = requestAnimationFrame(refresh);
        }
        continue;
      }
      for (const node of record.addedNodes) if (node instanceof Element) additions.add(node);
      for (const node of record.removedNodes) if (node instanceof Element) removals.add(node);
      if ((record.addedNodes.length || record.removedNodes.length) && !frame) frame = requestAnimationFrame(refresh);
    }
  });
  function revealFocused(event) {
    for (const element of active) if (element.contains(event.target)) cancel(element, states.get(element));
  }
  function preferencesChanged() {
    for (const element of active) cancel(element, states.get(element));
  }
  additions.add(root);
  refresh();
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'hidden', 'open'] });
  root.addEventListener('focusin', revealFocused);
  reduced.addEventListener('change', preferencesChanged);
  document.addEventListener('visibilitychange', preferencesChanged);
  window.addEventListener(PERFORMANCE_PROFILE_EVENT, preferencesChanged);
  root.dataset.scrollReveal = 'bidirectional';

  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    mutations.disconnect();
    for (const [element, state] of states) {
      cancel(element, state);
      delete element.dataset.scrollMotion;
    }
    states.clear();
    additions.clear();
    removals.clear();
    active.clear();
    delete root.dataset.scrollReveal;
    root.removeEventListener('focusin', revealFocused);
    reduced.removeEventListener('change', preferencesChanged);
    document.removeEventListener('visibilitychange', preferencesChanged);
    window.removeEventListener(PERFORMANCE_PROFILE_EVENT, preferencesChanged);
  };
}
