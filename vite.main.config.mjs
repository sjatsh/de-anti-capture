import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

// 主进程打包。核心是 external：koffi 的 JS 加载器、其原生包 @koromix/*、以及任何 .node
// 都不能被 Rollup 打包——保持成运行时 require，由 Node 解析到 asar.unpack 出来的真实文件。
// APP_ROOT 在打包时被替换为「构建机的项目根」，仅可用于 dev 分支（!app.isPackaged）解析 bin/assets。
export default defineConfig({
  define: {
    'process.env.APP_ROOT': JSON.stringify(projectRoot),
  },
  resolve: {
    alias: {
      '@shared': resolve(projectRoot, 'src/shared'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['electron', 'koffi', /^@koromix\//, /\.node$/],
    },
  },
});
