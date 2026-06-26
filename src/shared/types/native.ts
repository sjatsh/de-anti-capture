import type { SynthMode } from './settings';

// 原生层各操作的返回形状。注入/卸载/应用等统一 { ok, msg }。
export interface NativeResult {
  ok: boolean;
  msg?: string;
}

export interface FocusResult {
  ok: boolean;
  focused: boolean;
  msg?: string;
}

export interface MinimizeResult {
  ok: boolean;
}

export interface SynthResult {
  ok: boolean;
  sent?: number;
  mode?: string;
  msg?: string;
}

export interface AwakeResult {
  ok: boolean;
  on: boolean;
  msg?: string;
}

export interface SaveConfigResult {
  ok: boolean;
  path?: string;
  msg?: string;
}

// open-hook-log / copy-text / save-state 等通用 { ok, msg?, path? }。
export interface OkResult {
  ok: boolean;
  msg?: string;
  path?: string;
}

export interface SynthInputOpts {
  mode?: SynthMode;
  vk?: number;
  /**
   * 鼠标相对位移（px）。给了 dx/dy 时发「单向真实移动」（不自动回弹）——
   * 前台脉冲靠它让光标真正走位，被无影的 GetCursorPos 轮询读到并转发到远端。
   * 不给则保持 ±1px 净零微移（本机防空闲用：SendInput 事件本身即更新系统「最后输入时间」）。
   */
  dx?: number;
  dy?: number;
}

// 能力标志：UI 据此裁剪功能。inject/focusPulse 仅 Windows。
export interface NativeCapabilities {
  platform: string;
  inject: boolean;
  antiScreenshotOther: boolean;
  keepalive: boolean;
  stayAwake: boolean;
  synthInput: boolean;
  focusPulse: boolean;
}
