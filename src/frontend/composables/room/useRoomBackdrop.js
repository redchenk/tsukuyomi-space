import { uiText } from '../../i18n/runtime';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { activeSeason } from '../useSeasonTheme';
import { roomSceneKey, trackRoomLighting } from '../../services/room/roomScene.mjs';
import springDay from '../../assets/room/lakeside-v1/spring-day.webp';
import springNight from '../../assets/room/lakeside-v1/spring-night.webp';
import summerDay from '../../assets/room/lakeside-v1/summer-day.webp';
import summerNight from '../../assets/room/lakeside-v1/summer-night.webp';
import autumnDay from '../../assets/room/lakeside-v1/autumn-day.webp';
import autumnNight from '../../assets/room/lakeside-v1/autumn-night.webp';
import winterDay from '../../assets/room/lakeside-v1/winter-day.webp';
import winterNight from '../../assets/room/lakeside-v1/winter-night.webp';

const artwork = {
  'spring-day': springDay, 'spring-night': springNight,
  'summer-day': summerDay, 'summer-night': summerNight,
  'autumn-day': autumnDay, 'autumn-night': autumnNight,
  'winter-day': winterDay, 'winter-night': winterNight
};
const names = { spring: '樱花', summer: '夏日', autumn: '红叶', winter: '冬雪' };

export function useRoomBackdrop() {
  const clock = ref(new Date());
  const requestedKey = computed(() => roomSceneKey(activeSeason.value, clock.value));
  const displayedKey = ref(requestedKey.value);
  let stopTracking;

  // URL imports are just strings. Decode only the selected replacement, then
  // swap the CSS image. The previous image remains visible on failure or while
  // downloading; rapid selections cannot install an older, late response.
  watch(requestedKey, (key, _previous, onCleanup) => {
    if (key === displayedKey.value) return;
    const image = new Image();
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
      image.onload = image.onerror = null;
      image.src = '';
    });
    image.onload = async () => {
      try {
        await image.decode();
        if (!cancelled && image.naturalWidth > 0) displayedKey.value = key;
      } catch (_) { /* Keep the last usable room. */ }
    };
    image.onerror = () => { /* Keep the last usable room. */ };
    image.src = artwork[key];
  });
  const scene = computed(() => {
    const [season, time] = displayedKey.value.split('-');
    return {
      key: displayedKey.value, season, time,
      label: uiText(names[season] + '小屋'),
      title: uiText(names[season]) + ' · ' + uiText(time === 'day' ? '白昼' : '月夜'),
      icon: time === 'day' ? 'sun' : 'moon',
      image: artwork[displayedKey.value]
    };
  });
  const style = computed(() => ({ '--ts-room-bg-image': 'url("' + scene.value.image + '")' }));
  onMounted(() => { stopTracking = trackRoomLighting(date => { clock.value = date; }); });
  onBeforeUnmount(() => { stopTracking?.(); });
  return { scene, style };
}
