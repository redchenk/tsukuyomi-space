import { createApp } from '/assets/vendor/vue.esm-browser.prod.js';
import { App } from '/assets/js/vue/App.js';

const app = createApp(App);
app.config.errorHandler = (err, vm, info) => {
    console.error('Vue error:', err, info);
};
app.config.warnHandler = (msg, vm, info) => {
    console.warn('Vue warn:', msg, info);
};
app.mount('#app');
