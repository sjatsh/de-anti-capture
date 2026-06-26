'use strict';
const path = require('node:path');

// Electron Forge 配置。打包内核：electron-packager + plugin-vite（Vite 打包 main/preload/renderer）。
// koffi 策略见 vite.main.config.mjs 的 external 与下方 asar.unpack —— 两者缺一不可。
module.exports = {
  packagerConfig: {
    name: 'de-anti-capture',
    executableName: 'de-anti-capture',
    // Windows 需要 .ico（Phase 5 由 build.bat/render-icon 生成 assets/icon.ico）；缺失时 Forge 用默认图标，不报错。
    icon: path.resolve(__dirname, 'assets', 'icon'),
    asar: {
      // koffi 的 JS 加载器与原生包 @koromix/* 必须留在 asar 外，运行时 require 才能解析到真实 .node。
      unpack: '{**/node_modules/koffi/**,**/node_modules/@koromix/**}',
    },
    // 把内置拦截 DLL 与注入目标随包复制到 resources/bin/（resolveDll 的 packaged 分支零改动）。
    extraResource: ['./bin'],
    prune: true,
    // plugin-vite 默认的 ignore 只保留 /.vite，会把 node_modules 全部排除——但 koffi 是 external，
    // 必须把它的 JS 加载器与原生包 @koromix/* 留在包内（再由上面的 asar.unpack 解包出 .node）。
    // 自定义 ignore 为函数时，plugin-vite 会原样沿用（不覆盖、不告警）。
    ignore: (file) => {
      if (!file) return false; // 根目录本身保留
      if (file.startsWith('/.vite')) return false; // Vite 全部产物（main/preload/renderer）
      if (file === '/package.json') return false; // 运行时元信息
      if (file === '/node_modules' || file === '/node_modules/@koromix') return false; // 需进入这些目录递归
      if (file.startsWith('/node_modules/koffi')) return false; // koffi JS 加载器
      if (file.startsWith('/node_modules/@koromix/')) return false; // 预编译 koffi.node
      return true; // 其余一律排除
    },
  },

  // koffi 3.x 为预编译产物，无需 node-gyp 重建。
  rebuildConfig: {},

  makers: [
    {
      // 默认安装器：Squirrel.Windows（每用户装到 %LocalAppData%，免管理员，利于自动更新）。
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'de_anti_capture',
        setupExe: 'DeAntiCapture-Setup.exe',
        // setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'), // Phase 5 生成 .ico 后启用
      },
    },
    // 便携兜底：解压即用的 zip。
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // 每个 build 入口由各自的 Vite 配置打包；main 产物即 package.json 的 "main"。
        build: [
          { entry: 'src/main/index.ts', config: 'vite.main.config.mjs' },
          { entry: 'src/preload.ts', config: 'vite.preload.config.mjs' },
        ],
        renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
      },
    },
  ],
};
