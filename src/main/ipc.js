import { ipcMain, shell } from 'electron';
import fs from 'fs';
import native from '../native/index.js';
import * as pe from '../native/peexports.js';
import * as config from '../config.js';
import { getMainWindow } from './window.js';
import { getDefaultDll } from './dll.js';
import { loadState, saveState } from './state.js';
import { rulesFileFor, hookLogFile } from './paths.js';
import { readHookLogBuffer } from './logtail.js';
import { verifyRule } from './verify.js';

// 把抛错的处理器统一收敛成 {ok:false,msg}，避免渲染层 invoke 直接 reject。
const guard =
  (fn) =>
  (...a) => {
    try {
      return fn(...a);
    } catch (e) {
      return { ok: false, msg: String((e && e.message) || e) };
    }
  };

// 注册所有 ipcMain 处理器。通道名与 preload 暴露的 window.api 一一对应，迁移中保持不变。
export function registerIpc() {
  // ---- 自绘标题栏的窗口控制 ----
  ipcMain.on('win-minimize', () => {
    const w = getMainWindow();
    if (w) w.minimize();
  });
  ipcMain.on('win-maximize', () => {
    const w = getMainWindow();
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on('win-close', () => {
    const w = getMainWindow();
    if (w) w.close();
  });
  ipcMain.handle('win-is-maximized', () => {
    const w = getMainWindow();
    return !!(w && w.isMaximized());
  });

  // ---- 原生能力 ----
  ipcMain.handle('default-dll', () => getDefaultDll());
  ipcMain.handle('list-windows', guard((e, all) => native.listWindows({ all })));
  ipcMain.handle('is-window', guard((e, hwnd) => native.isWindow(hwnd)));
  ipcMain.handle('wiggle', guard((e, hwnd, pid) => native.wiggle(hwnd, pid)));
  ipcMain.handle('system-awake', guard((e, on) => native.systemAwake(on))); // 系统级防休眠开/关
  ipcMain.handle('synth-input', guard((e, opts) => native.synthInput(opts))); // 真实输入心跳（单次）
  ipcMain.handle('get-foreground', guard(() => native.getForeground())); // 当前前台窗口 hwnd（脉冲前记录）
  ipcMain.handle('focus-window', guard((e, hwnd) => native.focusWindow(hwnd))); // 瞬时切前台（脉冲喂输入）
  ipcMain.handle('native-info', () => native.capabilities);
  ipcMain.handle('inject', guard((e, pid, dll) => native.inject(pid, dll || getDefaultDll())));
  ipcMain.handle('module-loaded', guard((e, pid, name) => native.moduleLoaded(pid, name || 'KeepAliveHook.dll')));
  ipcMain.handle('eject', guard((e, pid, name) => native.eject(pid, name)));
  ipcMain.handle('reload', guard((e, pid, dll) => native.reload(pid, dll || getDefaultDll())));
  ipcMain.handle('get-exports', guard((e, dll) => pe.getExports(dll).names));

  // ---- 规则文件 / 状态持久化 ----
  ipcMain.handle('save-config', (e, dll, targets, opts) => {
    try {
      const cfg = rulesFileFor(dll || getDefaultDll());
      config.save(cfg, targets, opts || {});
      return { ok: true, path: cfg };
    } catch (err) {
      return { ok: false, msg: String((err && err.message) || err) };
    }
  });
  ipcMain.handle('load-state', () => loadState());
  ipcMain.handle('save-state', (e, s) => saveState(s));

  // ---- 拦截日志：实时 tail 的初始回放（订阅时拿最近缓冲）----
  ipcMain.handle('hook-log-read', () => readHookLogBuffer());

  // ---- 一键验证：起探针注入该规则并对比注入前后观测 ----
  ipcMain.handle('verify-rule', (e, rule) => verifyRule(rule));

  // ---- 打开拦截日志（%TEMP%\KeepAliveHook.log）----
  ipcMain.handle('open-hook-log', () => {
    const log = hookLogFile();
    try {
      if (!fs.existsSync(log)) fs.writeFileSync(log, ''); // 还没产生日志时也能打开
      shell.openPath(log);
      return { ok: true, path: log };
    } catch (err) {
      return { ok: false, msg: String((err && err.message) || err) };
    }
  });
}
