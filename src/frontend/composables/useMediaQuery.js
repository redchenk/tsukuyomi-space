import { onBeforeUnmount, ref } from 'vue';

export function useMediaQuery(query) {
  const media = window.matchMedia(query);
  const matches = ref(media.matches);
  const sync = () => { matches.value = media.matches; };
  media.addEventListener('change', sync);
  onBeforeUnmount(() => media.removeEventListener('change', sync));
  return matches;
}
