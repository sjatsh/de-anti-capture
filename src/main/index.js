// 主进程入口（生命周期编排）。各职责拆分到同目录模块：window / dll / state / ipc / paths。
// 开发期热加载由 Forge + Vite 自带的 HMR / 主进程重启提供，不再手写 fs.watch。
import { app, BrowserWindow } from 'electron';
import { resolveDll, setDefaultDll } from './dll.js';
import { registerIpc } from './ipc.js';
import { createWindow } from './window.js';

app.whenReady().then(() => {
  setDefaultDll(resolveDll()); // 打包后从 resources 复制 DLL 到可写目录，并记录默认路径
  registerIpc(); // 在 default-dll 取值之后注册，确保返回的是解析后的路径
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
