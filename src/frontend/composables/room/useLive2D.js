import { onBeforeUnmount, ref } from 'vue';
import {
  consumePendingRoomLive2DIntent,
  ROOM_LIVE2D_PENDING_INTENT_KEY
} from '../../services/room/live2dControl';
import {
  destroyLive2DRoom,
  initLive2DRoom,
  preloadLive2DResources,
  shouldDisableLive2DPointer,
  speakLive2D,
  stopLive2DSpeech
} from '../../services/room/live2dBridge';
import { mountLive2DStageBodyActuator } from '../../services/room/live2dBodyActuator';
import { mountLocalCubismBridge } from '../../services/room/live2dLocalCubismBridge';

export function useLive2D() {
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');
  let destroyCubismBridge = null;
  let destroyStageBodyActuator = null;

  function consumePendingSoon() {
    window.setTimeout(() => consumePendingRoomLive2DIntent(), 250);
  }

  function onStorage(event) {
    if (event.key === ROOM_LIVE2D_PENDING_INTENT_KEY && ready.value) consumePendingSoon();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  async function init() {
    loading.value = true;
    error.value = '';
    window.TSUKUYOMI_LIVE2D_DISABLE_POINTER = shouldDisableLive2DPointer();
    preloadLive2DResources();
    try {
      await initLive2DRoom();
      destroyCubismBridge?.();
      destroyStageBodyActuator?.();
      destroyCubismBridge = mountLocalCubismBridge();
      destroyStageBodyActuator = mountLive2DStageBodyActuator('#live2d-container');
      ready.value = true;
      loading.value = false;
      consumePendingSoon();
      return true;
    } catch (err) {
      error.value = err?.message || 'Live2D init failed';
      ready.value = false;
      loading.value = false;
      return false;
    }
  }

  function speak(options = {}) {
    speakLive2D(options);
  }

  function stopSpeaking() {
    stopLive2DSpeech();
  }

  function destroy() {
    ready.value = false;
    loading.value = false;
    destroyCubismBridge?.();
    destroyStageBodyActuator?.();
    destroyCubismBridge = null;
    destroyStageBodyActuator = null;
    stopSpeaking();
    destroyLive2DRoom();
  }

  onBeforeUnmount(destroy);
  onBeforeUnmount(() => {
    window.removeEventListener('storage', onStorage);
  });

  return { loading, ready, error, init, destroy, speak, stopSpeaking };
}
