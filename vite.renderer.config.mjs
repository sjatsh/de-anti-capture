import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

// 渲染层：以 src/renderer 为根，index.html 为入口。base './' 保证生产 file:// 下用相对路径加载资源。
// 关键：plugin-vite 给的 outDir 是相对路径，会被 Vite 按 root 解析；既然把 root 指到 src/renderer，
// 必须把 outDir 显式钉回项目根的 .vite/renderer/main_window（否则产物落到 src/renderer/.vite 下，
// 而 electron-packager 只收顶层 /.vite → 封包版白屏）。outDir 在 root 之外，需 emptyOutDir:true。
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    sourcemap: true,
    outDir: resolve(projectRoot, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
