import { onBeforeUnmount, ref } from 'vue';
import { destroyLive2DRoom, initLive2DRoom, preloadLive2DResources, speakLive2D } from '../../services/room/live2dBridge';

export function useLive2D() {
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');
  const unsupported = ref(false);
  const fallbackReason = ref('');

  function shouldUseStaticFallback() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const isIPhone = /iPhone|iPod/i.test(ua) || /iPhone|iPod/i.test(platform);
    return isIPhone;
  }

  async function init() {
    loading.value = true;
    error.value = '';
    unsupported.value = false;
    fallbackReason.value = '';
    if (shouldUseStaticFallback()) {
      unsupported.value = true;
      fallbackReason.value = 'iPhone Safari 使用静态模式以避免 WebGL 内存崩溃';
      ready.value = false;
      loading.value = false;
      return false;
    }
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
    unsupported.value = false;
    destroyLive2DRoom();
  }

  onBeforeUnmount(destroy);

  return { loading, ready, error, unsupported, fallbackReason, init, destroy, speak };
}
