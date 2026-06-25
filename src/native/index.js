'use strict';
// 平台分派：按 process.platform 选原生实现，并暴露能力标志供 UI 裁剪功能。
//   win32  → win32.js   （DLL 注入 + IAT Hook 全功能）
//   darwin → darwin.js  （非注入子集：窗口列表 + 合成输入/电源断言保活；注入类置为不支持）
// 两个实现暴露同一组函数（listWindows/isWindow/wiggle/inject/eject/reload/moduleLoaded）。
const platform = process.platform;
let impl;
try {
  impl = platform === 'darwin' ? require('./darwin') : require('./win32');
} catch (e) {
  // 原生层加载失败（如 macOS 上 koffi 解析框架符号出错）时退化为 stub，
  // 让应用仍能启动以便排查，而不是直接崩在启动阶段。
  console.error('[native] 原生层加载失败，已退化为 stub:', (e && e.message) || e);
  const fail = () => ({ ok: false, msg: '原生层加载失败: ' + ((e && e.message) || e) });
  impl = { listWindows: () => [], isWindow: () => false, wiggle: () => false, inject: fail, eject: fail, reload: fail, moduleLoaded: () => false };
}

// 能力标志：UI 据此决定哪些功能可用。inject 类仅 Windows。
const capabilities = {
  platform,
  inject: platform === 'win32',          // 注入类规则 fg/uncapture/hook/idle（依赖 DLL 注入）
  antiScreenshotOther: platform === 'win32',  // 改“别的窗口”的防截屏（macOS 做不到）
  keepalive: platform === 'win32' || platform === 'darwin'
};

module.exports = Object.assign({}, impl, { capabilities });
