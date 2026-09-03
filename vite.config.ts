import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: {
        tab: resolve(__dirname, 'tab.html'),
        pile: resolve(__dirname, 'pile.html'),
        note: resolve(__dirname, 'note.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
