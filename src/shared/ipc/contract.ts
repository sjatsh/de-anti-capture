// ============================================================================
//  强类型 IPC 契约 —— 渲染层 ↔ 主进程的单一数据源。
//  · IpcInvokeMap：每个 invoke 通道的 (参数, 返回)，主进程 handler 与 preload 都按它约束。
//  · IpcSendChannel / IpcEventMap：单向 send 与 main→renderer 事件。
//  · IpcApi：preload 经 contextBridge 暴露给渲染层的 window.api 形状（驼峰方法）。
//  改一处签名，两端编译失败直到对齐。
// ============================================================================
import type {
  WindowInfo,
  Rule,
  ConfigTarget,
  AppState,
  HookLogPayload,
  VerifyResult,
  NativeResult,
  FocusResult,
  MinimizeResult,
  SynthResult,
  AwakeResult,
  SaveConfigResult,
  OkResult,
  SynthInputOpts,
  NativeCapabilities,
} from '../types';

export interface IpcInvokeMap {
  'default-dll': { args: []; ret: string };
  'list-windows': { args: [all: boolean]; ret: WindowInfo[] };
  'is-window': { args: [hwnd: string]; ret: boolean };
  'wiggle': { args: [hwnd: string, pid: number]; ret: boolean };
  'system-awake': { args: [on: boolean]; ret: AwakeResult };
  'synth-input': { args: [opts: SynthInputOpts]; ret: SynthResult };
  'get-foreground': { args: []; ret: string };
  'focus-window': { args: [hwnd: string]; ret: FocusResult };
  'minimize-window': { args: [hwnd: string]; ret: MinimizeResult };
  'native-info': { args: []; ret: NativeCapabilities };
  'inject': { args: [pid: number, dll?: string]; ret: NativeResult };
  'module-loaded': { args: [pid: number, name?: string]; ret: boolean };
  'eject': { args: [pid: number, name?: string]; ret: NativeResult };
  'reload': { args: [pid: number, dll?: string]; ret: NativeResult };
  'get-exports': { args: [dll: string]; ret: string[] };
  'save-config': { args: [dll: string, targets: ConfigTarget[], opts: { logAll?: boolean }]; ret: SaveConfigResult };
  'load-state': { args: []; ret: AppState | null };
  'save-state': { args: [s: AppState]; ret: OkResult };
  'open-hook-log': { args: []; ret: OkResult };
  'copy-text': { args: [text: string]; ret: OkResult };
  'hook-log-read': { args: []; ret: string[] };
  'verify-rule': { args: [rule: Rule]; ret: VerifyResult };
  'win-is-maximized': { args: []; ret: boolean };
}

export type InvokeChannel = keyof IpcInvokeMap;
export type InvokeArgs<K extends InvokeChannel> = IpcInvokeMap[K]['args'];
export type InvokeRet<K extends InvokeChannel> = IpcInvokeMap[K]['ret'];

// 单向 send 通道（自绘标题栏控制，无返回）。
export type IpcSendChannel = 'win-minimize' | 'win-maximize' | 'win-close';

// main → renderer 推送事件。
export interface IpcEventMap {
  'hook-log-line': HookLogPayload;
  'window-maximized': boolean;
}

// preload 暴露给渲染层的 window.api。方法名为驼峰；其实现在 preload 里
// 按 IpcInvokeMap 强类型地转发到对应通道（见 src/preload/index.ts）。
export interface IpcApi {
  defaultDll(): Promise<string>;
  listWindows(all: boolean): Promise<WindowInfo[]>;
  isWindow(hwnd: string): Promise<boolean>;
  wiggle(hwnd: string, pid: number): Promise<boolean>;
  systemAwake(on: boolean): Promise<AwakeResult>;
  synthInput(opts: SynthInputOpts): Promise<SynthResult>;
  getForeground(): Promise<string>;
  focusWindow(hwnd: string): Promise<FocusResult>;
  minimizeWindow(hwnd: string): Promise<MinimizeResult>;
  nativeInfo(): Promise<NativeCapabilities>;
  inject(pid: number, dll?: string): Promise<NativeResult>;
  moduleLoaded(pid: number, name?: string): Promise<boolean>;
  eject(pid: number, name?: string): Promise<NativeResult>;
  reload(pid: number, dll?: string): Promise<NativeResult>;
  getExports(dll: string): Promise<string[]>;
  saveConfig(dll: string, targets: ConfigTarget[], opts: { logAll?: boolean }): Promise<SaveConfigResult>;
  loadState(): Promise<AppState | null>;
  saveState(s: AppState): Promise<OkResult>;
  openHookLog(): Promise<OkResult>;
  copyText(text: string): Promise<OkResult>;
  readHookLog(): Promise<string[]>;
  verifyRule(rule: Rule): Promise<VerifyResult>;
  winIsMaximized(): Promise<boolean>;

  // 单向 send
  winMinimize(): void;
  winMaximize(): void;
  winClose(): void;

  // 事件订阅（返回退订函数，便于 React effect 清理）
  onHookLog(cb: (payload: HookLogPayload) => void): () => void;
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
}
