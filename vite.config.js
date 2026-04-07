import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@framework': fileURLToPath(new URL('./lib/Framework/src', import.meta.url)),
      '@live2d': fileURLToPath(new URL('./src/live2d', import.meta.url))
    }
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/live2d/main-room.ts', import.meta.url)),
      name: 'Live2D',
      formats: ['iife'],
      fileName: 'live2d-room'
    },
    outDir: 'lib/bundled',
    emptyOutDir: true
  }
})
