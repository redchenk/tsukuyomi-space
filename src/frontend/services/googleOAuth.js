import { onMounted, ref } from 'vue';
import { loadPublicSettings } from '../api/client';

export function useGoogleOAuthEnabled() {
  const enabled = ref(false);
  onMounted(async () => {
    try { enabled.value = (await loadPublicSettings()).googleOAuthEnabled === true; }
    catch (_) { /* Keep unconfigured or unavailable sign-in out of the login form. */ }
  });
  return enabled;
}
