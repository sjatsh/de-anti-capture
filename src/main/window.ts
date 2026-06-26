import { BrowserWindow } from 'electron';
import path from 'node:path';
import { ICON } from './paths';

// Vite plugin injects these at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
export const getMainWindow = (): BrowserWindow | null => mainWindow;

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: '窗口保活 / API 拦截工具',
    backgroundColor: '#0b0d12',
    icon: ICON,
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.removeMenu();

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const sendMax = (): void => {
    if (mainWindow) mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);
  return mainWindow;
}
