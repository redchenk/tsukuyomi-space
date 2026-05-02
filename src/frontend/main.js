import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/global.css';

const app = createApp(App);

app.config.errorHandler = (err, vm, info) => {
  console.error('Vue error:', err, info);
};

app.config.warnHandler = (msg, vm, info) => {
  console.warn('Vue warn:', msg, info);
};

app.use(router);
app.mount('#app');
