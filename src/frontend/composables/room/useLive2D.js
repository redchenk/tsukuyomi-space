import { onBeforeUnmount, ref } from 'vue';
import { destroyLive2DRoom, initLive2DRoom, preloadLive2DResources, speakLive2D } from '../../services/room/live2dBridge';

export function useLive2D() {
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');

  async function init() {
    loading.value = true;
    error.value = '';
    preloadLive2DResources();
    try {
      await initLive2DRoom();
      ready.value = true;
      loading.value = false;
      return true;
    } catch (err) {
      error.value = err?.message || 'Live2D init failed';
      ready.value = false;
      loading.value = false;
      return false;
    }
  }

  function speak() {
    speakLive2D();
  }

  function destroy() {
    ready.value = false;
    loading.value = false;
    destroyLive2DRoom();
  }

  onBeforeUnmount(destroy);

  return { loading, ready, error, init, destroy, speak };
}
