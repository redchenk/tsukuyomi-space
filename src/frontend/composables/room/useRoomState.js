import { computed, onBeforeUnmount, onMounted, reactive } from 'vue';
import { useLive2D } from './useLive2D';
import { useRoomChat } from './useRoomChat';
import { useRoomMusic } from './useRoomMusic';
import { useRoomNote } from './useRoomNote';
import { useRoomPanels } from './useRoomPanels';
import { useRoomProfile } from './useRoomProfile';
import { useRoomWorld } from './useRoomWorld';

export function useRoomState() {
  const loading = reactive({
    active: true,
    title: 'SYNCHRONIZING...',
    detail: 'Loading room assets...'
  });
  const live2d = useLive2D();
  const panels = useRoomPanels();
  const world = useRoomWorld();
  const music = useRoomMusic();
  const profile = useRoomProfile();
  const note = useRoomNote();
  const chat = useRoomChat({ live2d, world });

  async function init() {
    loading.active = true;
    loading.title = 'SYNCHRONIZING...';
    loading.detail = 'Loading room assets...';
    world.initRoomWorld();
    try {
      await live2d.init();
      loading.active = false;
    } catch (err) {
      loading.title = 'LIVE2D LOAD FAILED';
      loading.detail = err?.message || 'Live2D init failed';
    }
  }

  function destroy() {
    world.destroyRoomWorld();
    chat.destroy();
    music.destroy();
    live2d.destroy();
  }

  onMounted(init);
  onBeforeUnmount(destroy);

  return {
    loading,
    live2d,
    panels,
    world,
    music,
    profile,
    note,
    chat,
    roomStyle: computed(() => (world.world.value.temperature == null ? null : { '--room-temperature': world.world.value.temperature }))
  };
}
