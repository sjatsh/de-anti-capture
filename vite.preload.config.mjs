import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

// preload 打包为 CJS（沙箱 preload 不支持运行时 ESM）。仅 electron 外置，其余自包含。
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(projectRoot, 'src/shared'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs' },
    },
  },
});
