// 平台分派：按 process.platform 选原生实现，并暴露能力标志供 UI 裁剪功能。
//   win32  → win32.js   （DLL 注入 + IAT Hook 全功能）
//   darwin → darwin.js  （非注入子集：窗口列表 + 合成输入/电源断言保活）
// 两个平台实现都导出 create() 工厂（koffi.load 延迟到 create() 调用时），因此可同时静态 import；
// 本文件按平台只实例化其一，另一平台的 koffi.load 不会在导入期执行。
import { create as createWin32 } from './win32.js';
import { create as createDarwin } from './darwin.js';

const platform = process.platform;
let impl;
try {
  impl = platform === 'darwin' ? createDarwin() : createWin32();
} catch (e) {
  // 原生层加载失败时退化为 stub，让应用仍能启动以便排查，而不是直接崩在启动阶段。
  console.error('[native] 原生层加载失败，已退化为 stub:', (e && e.message) || e);
  const fail = () => ({ ok: false, msg: '原生层加载失败: ' + ((e && e.message) || e) });
  impl = {
    listWindows: () => [],
    isWindow: () => false,
    wiggle: () => false,
    inject: fail,
    eject: fail,
    reload: fail,
    moduleLoaded: () => false,
    systemAwake: fail,
    synthInput: fail,
  };
}

// 能力标志：UI 据此决定哪些功能可用。inject 类仅 Windows。
const capabilities = {
  platform,
  inject: platform === 'win32',
  antiScreenshotOther: platform === 'win32',
  keepalive: platform === 'win32' || platform === 'darwin',
  stayAwake: platform === 'win32' || platform === 'darwin', // 系统级防休眠（SetThreadExecutionState / IOKit 断言）
  synthInput: platform === 'win32' || platform === 'darwin', // 真实输入心跳（SendInput / 声明用户活动）
};

const native = Object.assign({}, impl, { capabilities });
export default native;
export { capabilities };
