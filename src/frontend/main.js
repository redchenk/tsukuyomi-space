import { createApp } from 'vue';
import App from './App.vue';
import LoadingSkeleton from './components/LoadingSkeleton.vue';
import StatusLoader from './components/StatusLoader.vue';
import { router } from './router';
import { configureAssetCssVars } from './utils/assetUrl';
import { installImageBloom } from './utils/imageBloom';
import { initializePerformanceProfile } from './utils/performance';
import { uiText, prepareInterfaceLanguage } from './i18n/runtime';
import { initializeSeasonTheme } from './composables/useSeasonTheme';
import './styles/global.css';
import './styles/image-bloom.css';
import './styles/performance.css';
import './styles/navigation.css';
import './styles/navigation-art.css';
import './styles/material-components.css';
import './styles/material-pages.css';
import './styles/seasons.css';

initializePerformanceProfile();
configureAssetCssVars();
initializeSeasonTheme();

function syncWindowAppearance() {
  const isActive = document.visibilityState === 'visible' && document.hasFocus();
  document.documentElement.dataset.windowActive = isActive ? 'true' : 'false';
}

window.addEventListener('focus', syncWindowAppearance, { passive: true });
window.addEventListener('blur', syncWindowAppearance, { passive: true });
window.addEventListener('pageshow', syncWindowAppearance, { passive: true });
document.addEventListener('visibilitychange', syncWindowAppearance, { passive: true });
syncWindowAppearance();

const app = createApp(App);
app.config.globalProperties.$ui = uiText;
// Vue Teleport mounts dialogs beside #app, so observe the whole body to include
// lightboxes and any future portal content that opts into image bloom.
if (document.body) installImageBloom(document.body);

app.component('LoadingSkeleton', LoadingSkeleton);
app.component('StatusLoader', StatusLoader);

app.config.errorHandler = (err, vm, info) => {
  if (import.meta.env.DEV) console.error('Vue error:', err, info);
};

app.config.warnHandler = (msg, vm, info) => {
  if (import.meta.env.DEV) console.warn('Vue warn:', msg, info);
};

app.use(router);
// The immersive entry has no catalog-dependent labels. Never wait for a
// secondary locale download before exposing its navigation controls.
if (/^\/(?:access\/?)?$/.test(window.location.pathname)) {
  app.mount('#app');
  prepareInterfaceLanguage().catch(() => {});
} else {
  let mounted = false;
  const mount = () => { if (!mounted) { mounted = true; app.mount('#app'); } };
  const fallback = window.setTimeout(mount, 800);
  prepareInterfaceLanguage().catch(() => {}).finally(() => { window.clearTimeout(fallback); mount(); });
}
