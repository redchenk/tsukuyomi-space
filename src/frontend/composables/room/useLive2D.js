import { onBeforeUnmount, ref } from 'vue';
import { destroyLive2DRoom, initLive2DRoom, preloadLive2DResources, speakLive2D } from '../../services/room/live2dBridge';

export function useLive2D() {
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');
  let readyListener = null;

  async function init() {
    loading.value = true;
    error.value = '';
    preloadLive2DResources();
    try {
      if (readyListener) window.removeEventListener('tsukuyomi:live2d-ready', readyListener);
      readyListener = () => {
        ready.value = true;
        loading.value = false;
        readyListener = null;
      };
      window.addEventListener('tsukuyomi:live2d-ready', readyListener, { once: true });
      await initLive2DRoom();
      if (window.TSUKUYOMI_LIVE2D_READY && readyListener) readyListener();
    } catch (err) {
      error.value = err?.message || 'Live2D init failed';
      ready.value = false;
      loading.value = false;
    }
  }

  function speak() {
    speakLive2D();
  }

  function destroy() {
    if (readyListener) window.removeEventListener('tsukuyomi:live2d-ready', readyListener);
    readyListener = null;
    ready.value = false;
    loading.value = false;
    destroyLive2DRoom();
  }

  onBeforeUnmount(destroy);

  return { loading, ready, error, init, destroy, speak };
}
