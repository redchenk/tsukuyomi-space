import { onActivated, onDeactivated, watch } from 'vue';
import { contentTranslationEnabled } from '../services/contentTranslation';

// KeepAlive pages refresh when revisited; their drafts and filters stay mounted.
export function useContentTranslationRefresh(refresh) {
  let active = true;
  let pending = false;
  watch(contentTranslationEnabled, () => {
    if (active) refresh();
    else pending = true;
  }, { flush: 'sync' });
  onDeactivated(() => { active = false; });
  onActivated(() => {
    active = true;
    if (pending) { pending = false; refresh(); }
  });
}
