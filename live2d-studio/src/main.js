import { createApp } from 'vue';
import App from './App.vue';
import { configureAssetCssVars } from '../../src/frontend/utils/assetUrl';
import './style.css';

configureAssetCssVars();

const app = createApp(App);

app.config.errorHandler = (err, vm, info) => {
  console.error('Live2D Studio error:', err, info);
};

app.mount('#app');
