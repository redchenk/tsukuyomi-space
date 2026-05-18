import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { configureAssetCssVars } from './utils/assetUrl';
import './styles/global.css';

configureAssetCssVars();

const app = createApp(App);

app.config.errorHandler = (err, vm, info) => {
  console.error('Vue error:', err, info);
};

app.config.warnHandler = (msg, vm, info) => {
  console.warn('Vue warn:', msg, info);
};

app.use(router);
app.mount('#app');
