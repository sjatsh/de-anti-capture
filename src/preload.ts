import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IpcApi } from '@shared/ipc/contract';
import type { HookLogPayload } from '@shared/types';

const api: IpcApi = {
  defaultDll: () => ipcRenderer.invoke('default-dll'),
  listWindows: (all) => ipcRenderer.invoke('list-windows', all),
  isWindow: (hwnd) => ipcRenderer.invoke('is-window', hwnd),
  wiggle: (hwnd, pid) => ipcRenderer.invoke('wiggle', hwnd, pid),
  systemAwake: (on) => ipcRenderer.invoke('system-awake', on),
  synthInput: (opts) => ipcRenderer.invoke('synth-input', opts),
  getForeground: () => ipcRenderer.invoke('get-foreground'),
  focusWindow: (hwnd) => ipcRenderer.invoke('focus-window', hwnd),
  minimizeWindow: (hwnd) => ipcRenderer.invoke('minimize-window', hwnd),
  nativeInfo: () => ipcRenderer.invoke('native-info'),
  inject: (pid, dll) => ipcRenderer.invoke('inject', pid, dll),
  moduleLoaded: (pid, name) => ipcRenderer.invoke('module-loaded', pid, name),
  eject: (pid, name) => ipcRenderer.invoke('eject', pid, name),
  reload: (pid, dll) => ipcRenderer.invoke('reload', pid, dll),
  getExports: (dll) => ipcRenderer.invoke('get-exports', dll),
  saveConfig: (dll, targets, opts) => ipcRenderer.invoke('save-config', dll, targets, opts),
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (s) => ipcRenderer.invoke('save-state', s),
  openHookLog: () => ipcRenderer.invoke('open-hook-log'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  readHookLog: () => ipcRenderer.invoke('hook-log-read'),
  verifyRule: (rule) => ipcRenderer.invoke('verify-rule', rule),
  winIsMaximized: () => ipcRenderer.invoke('win-is-maximized'),

  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),

  // 事件订阅：返回退订函数，便于 React effect 清理
  onHookLog: (cb: (p: HookLogPayload) => void) => {
    const handler = (_e: IpcRendererEvent, payload: HookLogPayload): void => cb(payload);
    ipcRenderer.on('hook-log-line', handler);
    return () => {
      ipcRenderer.off('hook-log-line', handler);
    };
  },
  onMaximizeChange: (cb: (v: boolean) => void) => {
    const handler = (_e: IpcRendererEvent, v: boolean): void => cb(v);
    ipcRenderer.on('window-maximized', handler);
    return () => {
      ipcRenderer.off('window-maximized', handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
