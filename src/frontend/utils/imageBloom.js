const BLOOM_SELECTOR = 'img[data-image-bloom]:not([data-image-bloom="off"])';

function imageSourceSignature(image) {
  return [
    image.getAttribute('src') || '',
    image.getAttribute('srcset') || '',
    image.getAttribute('sizes') || ''
  ].join('|');
}

function collectBloomImages(node, images) {
  if (!(node instanceof Element)) return;
  if (node.matches(BLOOM_SELECTOR)) images.add(node);
  node.querySelectorAll(BLOOM_SELECTOR).forEach((image) => images.add(image));
}

/**
 * Reveal opted-in images only after the browser has decoded their current source.
 * A MutationObserver covers route changes, v-html article content and src swaps.
 */
export function installImageBloom(root = document) {
  if (typeof window === 'undefined' || typeof MutationObserver !== 'function') return () => {};

  const state = new WeakMap();

  function markLoaded(image, token) {
    const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
    Promise.resolve(decoded).catch(() => {}).then(() => {
      if (state.get(image)?.token !== token) return;
      image.dataset.imageState = 'loaded';
    });
  }

  function prepareImage(image) {
    const signature = imageSourceSignature(image);
    if (!signature.replace(/\|/g, '')) return;
    if (state.get(image)?.signature === signature) return;

    const token = Symbol('image-bloom');
    state.set(image, { signature, token });
    image.dataset.imageState = 'pending';

    image.addEventListener('load', () => markLoaded(image, token), { once: true });
    image.addEventListener('error', () => {
      if (state.get(image)?.token === token) image.dataset.imageState = 'error';
    }, { once: true });

    if (image.complete) {
      if (image.naturalWidth > 0) markLoaded(image, token);
      else image.dataset.imageState = 'error';
    }
  }

  root.querySelectorAll?.(BLOOM_SELECTOR).forEach(prepareImage);

  const observer = new MutationObserver((mutations) => {
    const images = new Set();
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.target.matches?.(BLOOM_SELECTOR)) images.add(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach((node) => collectBloomImages(node, images));
    }
    images.forEach(prepareImage);
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'sizes']
  });

  return () => observer.disconnect();
}
