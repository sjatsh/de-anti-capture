import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

// 单测配置。测试在 Node 环境运行（被测的是纯逻辑 + 原生桥，不涉及 DOM）。
// 别名与各 vite.*.config.mjs 保持一致，让测试能用与源码相同的 @shared / @ 路径。
// koffi 是预编译原生加载器，交给 Node 原样 require，勿让 Vite 改写。
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@': resolve(root, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {
      deps: { external: ['koffi'] },
    },
  },
});
