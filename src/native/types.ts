// 原生层（win32 / darwin）实现需满足的统一接口。
// 各平台 create() 返回 NativeImpl；native/index.ts 选其一实例化并叠加 capabilities。
import type {
  WindowInfo,
  NativeResult,
  FocusResult,
  MinimizeResult,
  SynthResult,
  AwakeResult,
  SynthInputOpts,
} from '@shared/types';

export interface NativeImpl {
  listWindows(opts: { all?: boolean }): WindowInfo[];
  isWindow(hwnd: string): boolean;
  wiggle(hwnd: string, pid?: number): boolean;
  inject(pid: number, dllPath: string): NativeResult;
  eject(pid: number, dllName?: string): NativeResult;
  reload(pid: number, dllPath: string): NativeResult;
  moduleLoaded(pid: number, dllName?: string): boolean;
  systemAwake(on: boolean): AwakeResult;
  synthInput(opts?: SynthInputOpts): SynthResult;
  getForeground(): string;
  focusWindow(hwnd: string): FocusResult;
  minimizeWindow(hwnd: string): MinimizeResult;
}
