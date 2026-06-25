import { defineConfig } from 'vite';

// preload 打包为 CJS（沙箱 preload 不支持运行时 ESM）。仅 electron 外置，其余自包含。
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs' },
    },
  },
});
