/* global MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME */
import { BrowserWindow } from 'electron';
import path from 'path';
import { ICON } from './paths.js';

let mainWindow = null;
export const getMainWindow = () => mainWindow;

export function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: '窗口保活 / API 拦截工具',
    backgroundColor: '#0b0d12',
    icon: ICON,
    frame: false, // 自绘标题栏，更现代
    autoHideMenuBar: true,
    show: false, // ready-to-show 前隐藏，避免白屏闪烁
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 与 main 同在 .vite/build/
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // 最小化时保活定时器仍跑
    },
  });
  mainWindow.removeMenu();
  // Forge + Vite：dev 用插件注入的开发服务器 URL，prod 加载构建产物 .vite/renderer/main_window/index.html
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 把最大化状态同步给渲染层，让按钮切换“最大化/还原”图标
  const sendMax = () => mainWindow && mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);
  return mainWindow;
}
