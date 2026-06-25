'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const native = require('./native');
const pe = require('./native/peexports');
const config = require('./config');

let mainWindow;
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

// 解析内置拦截 DLL 路径：开发时用项目 bin/；打包后 DLL 在只读的 resources/bin/，
// 复制到可写的 userData/bin/（DLL 要在同目录写规则文件 KeepAliveHook.rules.txt）。
function resolveDll() {
  if (!app.isPackaged) return path.resolve(__dirname, '..', 'bin', 'KeepAliveHook.dll');
  const src = path.join(process.resourcesPath, 'bin');
  const dst = path.join(app.getPath('userData'), 'bin');
  try {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['KeepAliveHook.dll', 'inject_target.exe']) {
      const s = path.join(src, f), d = path.join(dst, f);
      if (fs.existsSync(s) && (!fs.existsSync(d) || fs.statSync(s).mtimeMs > fs.statSync(d).mtimeMs)) fs.copyFileSync(s, d);
    }
  } catch (e) { /* 复制失败则回退 resources 路径 */ return path.join(src, 'KeepAliveHook.dll'); }
  return path.join(dst, 'KeepAliveHook.dll');
}
let DEFAULT_DLL = path.resolve(__dirname, '..', 'bin', 'KeepAliveHook.dll');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 820, minWidth: 940, minHeight: 620,
    title: '窗口保活 / API 拦截工具',
    backgroundColor: '#0b0d12',
    icon: ICON,
    frame: false,                  // 自绘标题栏，更现代
    autoHideMenuBar: true,
    show: false,                   // ready-to-show 前隐藏，避免白屏闪烁
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false   // 最小化时保活定时器仍跑
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 把最大化状态同步给渲染层，让按钮切换“最大化/还原”图标
  const sendMax = () => mainWindow && mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);
}

// 开发期热加载：改 renderer 自动刷新页面；改 main/preload/native/config 自动重启应用。
// 仅未打包时启用（设 WKA_NO_RELOAD=1 可关闭）。
function setupHotReload() {
  if (app.isPackaged || process.env.WKA_NO_RELOAD === '1') return;
  const dirs = [
    { dir: __dirname, tag: 'src' },                              // src/（renderer / native / main / preload / config）
    { dir: path.join(__dirname, '..', 'assets'), tag: 'assets' }
  ];
  let timer = null, wantRelaunch = false;
  const trigger = (file, tag) => {
    if (!file || !/\.(js|html|css|svg|png)$/i.test(file)) return;
    const f = String(file).replace(/\\/g, '/');
    if (tag === 'src' && (/^(main|preload|config)\.js$/i.test(f) || f.startsWith('native/'))) wantRelaunch = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (wantRelaunch) { app.relaunch(); app.exit(0); return; }
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
    }, 180);
  };
  for (const w of dirs) {
    try { fs.watch(w.dir, { recursive: true }, (_e, file) => trigger(file, w.tag)); } catch (_) { /* 目录缺失则跳过 */ }
  }
  console.log('[dev] 热加载已启用：监听 src/ 与 assets/');
}

app.whenReady().then(() => {
  DEFAULT_DLL = resolveDll();    // 打包后从 resources 复制到可写目录
  createWindow();
  setupHotReload();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- 自绘标题栏的窗口控制 ----
ipcMain.on('win-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow && mainWindow.close());
ipcMain.handle('win-is-maximized', () => !!(mainWindow && mainWindow.isMaximized()));

const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { return { ok: false, msg: String(e && e.message || e) }; } };

ipcMain.handle('default-dll', () => DEFAULT_DLL);
ipcMain.handle('list-windows', guard((e, all) => native.listWindows({ all })));
ipcMain.handle('is-window', guard((e, hwnd) => native.isWindow(hwnd)));
ipcMain.handle('wiggle', guard((e, hwnd, pid) => native.wiggle(hwnd, pid)));
ipcMain.handle('native-info', () => native.capabilities);
ipcMain.handle('inject', guard((e, pid, dll) => native.inject(pid, dll || DEFAULT_DLL)));
ipcMain.handle('module-loaded', guard((e, pid, name) => native.moduleLoaded(pid, name || 'KeepAliveHook.dll')));
ipcMain.handle('eject', guard((e, pid, name) => native.eject(pid, name)));
ipcMain.handle('reload', guard((e, pid, dll) => native.reload(pid, dll || DEFAULT_DLL)));
ipcMain.handle('get-exports', guard((e, dll) => pe.getExports(dll).names));

ipcMain.handle('save-config', (e, dll, targets, opts) => {
  try {
    const cfg = path.join(path.dirname(dll || DEFAULT_DLL), 'KeepAliveHook.rules.txt');
    config.save(cfg, targets, opts || {});
    return { ok: true, path: cfg };
  } catch (err) { return { ok: false, msg: String(err && err.message || err) }; }
});

// 应用状态持久化（目标/规则/设置）→ %APPDATA%/<productName>/state.json
const stateFile = () => path.join(app.getPath('userData'), 'state.json');
ipcMain.handle('load-state', () => {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
});
ipcMain.handle('save-state', (e, s) => {
  try { fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2)); return { ok: true }; }
  catch (err) { return { ok: false, msg: String(err && err.message || err) }; }
});

// 打开 DLL 写出的拦截日志（%TEMP%\KeepAliveHook.log）
ipcMain.handle('open-hook-log', () => {
  const log = path.join(process.env.TEMP || process.env.TMP || app.getPath('temp'), 'KeepAliveHook.log');
  try {
    if (!fs.existsSync(log)) fs.writeFileSync(log, '');   // 还没产生日志时也能打开
    shell.openPath(log);
    return { ok: true, path: log };
  } catch (err) { return { ok: false, msg: String(err && err.message || err) }; }
});
