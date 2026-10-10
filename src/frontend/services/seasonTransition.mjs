// Only explicit theme changes take snapshots; calendar/storage tracking remains
// synchronous. Latest selection wins even while a previous image is decoding.
export function createSeasonTransition({ document: doc, reducedMotion, prepare, flush }) {
  let generation = 0;
  let active = null;
  return async (season, apply) => {
    const request = ++generation;
    active?.skipTransition();
    if (!doc?.startViewTransition || reducedMotion() || doc.visibilityState === 'hidden'
      || doc.documentElement.dataset.season === season) {
      delete doc?.documentElement?.dataset.seasonTransition;
      apply();
      return;
    }
    await Promise.resolve().then(() => prepare(season)).catch(() => {});
    if (request !== generation) return;
    const update = async () => {
      if (request !== generation) return;
      apply();
      await flush();
    };
    doc.documentElement.dataset.seasonTransition = 'true';
    try {
      const transition = doc.startViewTransition(update);
      active = transition;
      // Skipping a transition rejects ready but must still apply the selection.
      transition.ready.catch(() => {});
      transition.updateCallbackDone.catch(() => {});
      await transition.finished.catch(() => {});
      if (active === transition) active = null;
    } catch (_) {
      await update();
    } finally {
      if (request === generation) delete doc.documentElement.dataset.seasonTransition;
    }
  };
}

export async function decodeSeasonImages(urls, { Image: ImageClass = globalThis.Image, timeout = 1200 } = {}) {
  if (!ImageClass) return;
  await Promise.allSettled([...new Set(urls.filter(Boolean))].map(src => new Promise(resolve => {
    const image = new ImageClass();
    const timer = setTimeout(done, timeout);
    function done() { clearTimeout(timer); image.onload = null; image.onerror = null; resolve(); }
    image.onload = () => Promise.resolve(image.decode?.()).catch(() => {}).then(done);
    image.onerror = done;
    image.src = src;
  })));
}
