import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(projectRoot, 'src/shared'),
      '@': resolve(projectRoot, 'src/renderer'),
    },
  },
  build: {
    sourcemap: true,
    outDir: resolve(projectRoot, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
