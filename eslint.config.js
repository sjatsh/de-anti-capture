'use strict';
// ESLint 9 flat config。主进程/工具/测试为 CommonJS(Node)，渲染层为 ESM(浏览器)。
// 规则偏宽松：以发现真实问题为主，风格交给 Prettier，避免对既有密集代码大量误报。
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.vite/**', 'out/**', 'dist/**', 'bin/**', 'assets/**'] },
  js.configs.recommended,

  // Node 侧：主进程、preload、config、native、shared、工具、测试、根配置
  {
    files: [
      'src/main.js',
      'src/main/**/*.js',
      'src/preload.js',
      'src/config.js',
      'src/native/**/*.js',
      'src/shared/**/*.js',
      'tools/**/*.js',
      'test/**/*.js',
      '*.config.js',
      'forge.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // 渲染层：浏览器 ESM
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // Vite 配置（.mjs，Node ESM）
  {
    files: ['vite.*.config.mjs'],
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
