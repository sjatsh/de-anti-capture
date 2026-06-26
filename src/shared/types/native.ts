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
