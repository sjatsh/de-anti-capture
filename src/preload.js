'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  defaultDll: () => ipcRenderer.invoke('default-dll'),
  listWindows: (all) => ipcRenderer.invoke('list-windows', all),
  isWindow: (hwnd) => ipcRenderer.invoke('is-window', hwnd),
  wiggle: (hwnd, pid) => ipcRenderer.invoke('wiggle', hwnd, pid),
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

  // 自绘标题栏的窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  winIsMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  onMaximizeChange: (cb) => ipcRenderer.on('window-maximized', (_e, v) => cb(v))
});
