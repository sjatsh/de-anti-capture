// 平台分派：按 process.platform 选原生实现，并暴露能力标志供 UI 裁剪功能。
//   win32  → win32.ts   （DLL 注入 + IAT Hook 全功能）
//   darwin → darwin.ts  （非注入子集：窗口列表 + 合成输入/电源断言保活）
// 两个平台实现都导出 create() 工厂（koffi.load 延迟到 create() 调用时），因此可同时静态 import；
// 本文件按平台只实例化其一，另一平台的 koffi.load 不会在导入期执行。
import { create as createWin32 } from './win32';
import { create as createDarwin } from './darwin';
import type { NativeImpl } from './types';
import type { NativeCapabilities } from '@shared/types';

const platform = process.platform;
let impl: NativeImpl;
try {
  impl = platform === 'darwin' ? createDarwin() : createWin32();
} catch (e) {
  console.error('[native] 原生层加载失败，已退化为 stub:', (e as Error)?.message || e);
  const msg = '原生层加载失败: ' + ((e as Error)?.message || e);
  const fail = () => ({ ok: false, msg });
  impl = {
    listWindows: () => [],
    isWindow: () => false,
    wiggle: () => false,
    inject: fail,
    eject: fail,
    reload: fail,
    moduleLoaded: () => false,
    systemAwake: () => ({ ok: false, on: false, msg }),
    synthInput: () => ({ ok: false, msg }),
    getForeground: () => '0',
    focusWindow: () => ({ ok: false, focused: false, msg }),
    minimizeWindow: () => ({ ok: false, msg }),
  };
}

export const capabilities: NativeCapabilities = {
  platform,
  inject: platform === 'win32',
  antiScreenshotOther: platform === 'win32',
  keepalive: platform === 'win32' || platform === 'darwin',
  stayAwake: platform === 'win32' || platform === 'darwin',
  synthInput: platform === 'win32' || platform === 'darwin',
  focusPulse: platform === 'win32',
};

const native = Object.assign({}, impl, { capabilities });
export default native;
