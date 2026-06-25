'use strict';
// ESLint 9 flat config。主进程/渲染层为 ESM（Vite 打包）；tools/test/根配置为 CommonJS(Node)。
// 规则偏宽松：以发现真实问题为主，风格交给 Prettier，避免对既有密集代码大量误报。
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.vite/**', 'out/**', 'dist/**', 'bin/**', 'assets/**'] },
  js.configs.recommended,

  // 主进程侧（ESM，由 Vite 打包）：main / preload / config / native / shared
  {
    files: [
      'src/main.js',
      'src/main/**/*.js',
      'src/preload.js',
      'src/config.js',
      'src/native/**/*.js',
      'src/shared/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // 渲染层（ESM，浏览器）
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // 纯 CJS 脚本与根配置：tools / test / forge.config.js / eslint.config.js
  {
    files: ['tools/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Vite 配置 + ESM 测试脚本（.mjs，Node ESM）：test/*.mjs 直接 import ESM 原生模块，故走 ESM
  {
    files: ['vite.*.config.mjs', 'test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-console': 'off',
    },
  },
];
