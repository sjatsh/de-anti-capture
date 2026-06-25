import { defineConfig } from 'vite';

// 渲染层：以 src/renderer 为根，index.html 为入口。base './' 保证生产 file:// 下用相对路径加载资源。
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    sourcemap: true,
  },
});
