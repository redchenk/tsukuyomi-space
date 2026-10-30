import { readonly, ref } from 'vue';
import { isEnglishSite } from '../utils/siteVariant';

export const CONTENT_TRANSLATION_STORAGE_KEY = 'tsukuyomi_content_translation';
export const contentTranslationAvailable = isEnglishSite();

function readPreference() {
  try { return localStorage.getItem(CONTENT_TRANSLATION_STORAGE_KEY) !== 'off'; }
  catch (_) { return true; }
}

const enabled = ref(contentTranslationAvailable && readPreference());
export const contentTranslationEnabled = readonly(enabled);
export const contentTranslationMode = () => enabled.value ? 'en' : 'original';

export function setContentTranslationEnabled(value) {
  if (!contentTranslationAvailable) return;
  enabled.value = Boolean(value);
  try { localStorage.setItem(CONTENT_TRANSLATION_STORAGE_KEY, enabled.value ? 'on' : 'off'); }
  catch (_) { /* This session can still switch when storage is unavailable. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === CONTENT_TRANSLATION_STORAGE_KEY || event.key === null) {
      enabled.value = contentTranslationAvailable && readPreference();
    }
  });
}
