// 主进程入口（生命周期编排）。各职责拆分到同目录模块：window / dll / state / ipc / paths。
// 开发期热加载由 Forge + Vite 自带的 HMR / 主进程重启提供，不再手写 fs.watch。
import { app, BrowserWindow } from 'electron';
import { resolveDll, setDefaultDll } from './dll';
import { registerIpc } from './ipc';
import { createWindow, getMainWindow } from './window';
import { startHookLogTail } from './logtail';

app.whenReady().then(() => {
  setDefaultDll(resolveDll());
  registerIpc();
  createWindow();
  startHookLogTail(getMainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
