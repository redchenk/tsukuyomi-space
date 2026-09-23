const IMAGE_SELECTOR = 'img:not([data-image-bloom="off"])';

function imageSourceSignature(image) {
  return [
    image.getAttribute('src') || '',
    image.getAttribute('srcset') || '',
    image.getAttribute('sizes') || '',
    image.currentSrc || ''
  ].join('|');
}

function collectImages(node, images) {
  if (!(node instanceof Element)) return;
  if (node.matches(IMAGE_SELECTOR)) images.add(node);
  node.querySelectorAll(IMAGE_SELECTOR).forEach((image) => images.add(image));
}

/**
 * Reveal images across all routes after their current source has decoded.
 * Cached images appear immediately; the observer also covers Teleports and HTML.
 */
export function installImageBloom(root = document) {
  if (typeof window === 'undefined' || typeof MutationObserver !== 'function') return () => {};

  const state = new WeakMap();

  function markLoaded(image, generation) {
    if (state.get(image)?.generation !== generation) return;
    const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
    Promise.resolve(decoded).catch(() => {}).then(() => {
      if (state.get(image)?.generation !== generation) return;
      image.dataset.imageState = image.naturalWidth > 0 ? 'loaded' : 'error';
    });
  }

  function prepareImage(image) {
    if (image.getAttribute('data-image-bloom') === 'off') {
      state.get(image)?.cleanup?.();
      state.delete(image);
      delete image.dataset.imageState;
      delete image.dataset.imageReveal;
      return;
    }

    const signature = imageSourceSignature(image);
    if (!signature.replace(/\|/g, '')) return;
    if (state.get(image)?.signature === signature) return;

    state.get(image)?.cleanup?.();
    const generation = Symbol('image-bloom');
    state.set(image, { signature, generation });
    if (!image.hasAttribute('data-image-bloom')) image.setAttribute('data-image-bloom', '');

    // A completed image is already painted, including a cache hit on SPA
    // navigation. Do not blur it briefly or replay the reveal animation.
    if (image.complete) {
      image.dataset.imageReveal = 'skip';
      image.dataset.imageState = image.naturalWidth > 0 ? 'loaded' : 'error';
      return;
    }

    delete image.dataset.imageReveal;
    image.dataset.imageState = 'pending';

    const onLoad = () => markLoaded(image, generation);
    const onError = () => {
      if (state.get(image)?.generation === generation) image.dataset.imageState = 'error';
    };
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
    state.get(image).cleanup = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
  }

  root.querySelectorAll?.(IMAGE_SELECTOR).forEach(prepareImage);

  const observer = new MutationObserver((mutations) => {
    const images = new Set();
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.target instanceof HTMLImageElement) images.add(mutation.target);
        if (mutation.target instanceof HTMLSourceElement && mutation.target.parentElement?.tagName === 'PICTURE') {
          const image = mutation.target.parentElement.querySelector('img');
          if (image) images.add(image);
        }
        continue;
      }
      mutation.addedNodes.forEach((node) => collectImages(node, images));
    }
    images.forEach(prepareImage);
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'data-image-bloom']
  });

  return () => observer.disconnect();
}
