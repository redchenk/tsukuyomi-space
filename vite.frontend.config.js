import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/frontend', import.meta.url)),
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: {
      '@frontend': fileURLToPath(new URL('./src/frontend', import.meta.url)),
      '@legacy-vue': fileURLToPath(new URL('./assets/js/vue', import.meta.url))
    }
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url))]
    },
    proxy: {
      '/api': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/frontend', import.meta.url)),
    emptyOutDir: true
  }
});
