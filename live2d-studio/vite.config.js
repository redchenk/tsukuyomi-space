import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: {
      '@frontend': fileURLToPath(new URL('../../src/frontend', import.meta.url))
    }
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))]
    }
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/live2d-studio', import.meta.url)),
    emptyOutDir: true
  }
});
