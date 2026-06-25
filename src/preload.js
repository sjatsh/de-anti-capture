import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  defaultDll: () => ipcRenderer.invoke('default-dll'),
  listWindows: (all) => ipcRenderer.invoke('list-windows', all),
  isWindow: (hwnd) => ipcRenderer.invoke('is-window', hwnd),
  wiggle: (hwnd, pid) => ipcRenderer.invoke('wiggle', hwnd, pid),
  systemAwake: (on) => ipcRenderer.invoke('system-awake', on), // 系统级防休眠（SetThreadExecutionState）
  synthInput: (opts) => ipcRenderer.invoke('synth-input', opts), // 真实输入心跳（SendInput）
  getForeground: () => ipcRenderer.invoke('get-foreground'), // 当前前台窗口 hwnd（脉冲前记录）
  focusWindow: (hwnd) => ipcRenderer.invoke('focus-window', hwnd), // 瞬时切前台（脉冲喂输入给远端）
  minimizeWindow: (hwnd) => ipcRenderer.invoke('minimize-window', hwnd), // 喂完最小化回任务栏
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
  readHookLog: () => ipcRenderer.invoke('hook-log-read'), // 订阅时取最近缓冲做回放
  onHookLog: (cb) => ipcRenderer.on('hook-log-line', (_e, payload) => cb(payload)), // 实时增量行
  verifyRule: (rule) => ipcRenderer.invoke('verify-rule', rule), // 一键验证：注入前后对比

  // 自绘标题栏的窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  winIsMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  onMaximizeChange: (cb) => ipcRenderer.on('window-maximized', (_e, v) => cb(v))
});
