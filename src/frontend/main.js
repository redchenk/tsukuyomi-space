import { createApp } from 'vue';
import App from './App.vue';
import LoadingSkeleton from './components/LoadingSkeleton.vue';
import StatusLoader from './components/StatusLoader.vue';
import { router } from './router';
import { configureAssetCssVars } from './utils/assetUrl';
import './styles/global.css';

configureAssetCssVars();

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

app.component('LoadingSkeleton', LoadingSkeleton);
app.component('StatusLoader', StatusLoader);

app.config.errorHandler = (err, vm, info) => {
  console.error('Vue error:', err, info);
};

app.config.warnHandler = (msg, vm, info) => {
  console.warn('Vue warn:', msg, info);
};

app.use(router);
app.mount('#app');
