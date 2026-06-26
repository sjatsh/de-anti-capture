import { ipcMain, shell, clipboard } from 'electron';
import fs from 'node:fs';
import native, { capabilities } from '../native/index';
import * as pe from '../native/peexports';
import * as config from '../config';
import type { InvokeChannel, InvokeArgs, InvokeRet } from '@shared/ipc/contract';
import { getMainWindow } from './window';
import { getDefaultDll } from './dll';
import { loadState, saveState } from './state';
import { rulesFileFor, hookLogFile } from './paths';
import { readHookLogBuffer } from './logtail';
import { verifyRule } from './verify';

// 类型安全的 invoke 注册器：通道名约束 handler 签名一致于 IpcInvokeMap。
function handle<K extends InvokeChannel>(
  channel: K,
  fn: (...args: InvokeArgs<K>) => InvokeRet<K> | Promise<InvokeRet<K>>,
): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as InvokeArgs<K>)));
}

const errMsg = (e: unknown): string => String((e as Error)?.message || e);

// 注册所有 ipcMain 处理器。通道名与 preload 暴露的 window.api 一一对应。
export function registerIpc(): void {
  // ---- 自绘标题栏的窗口控制 ----
  ipcMain.on('win-minimize', () => {
    getMainWindow()?.minimize();
  });
  ipcMain.on('win-maximize', () => {
    const w = getMainWindow();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on('win-close', () => {
    getMainWindow()?.close();
  });
  handle('win-is-maximized', () => !!getMainWindow()?.isMaximized());

  // ---- 原生能力（按契约返回；不抛错——失败用 {ok:false,msg} 或空值表达）----
  handle('default-dll', () => getDefaultDll());
  handle('list-windows', (all) => {
    try { return native.listWindows({ all }); } catch { return []; }
  });
  handle('is-window', (hwnd) => {
    try { return native.isWindow(hwnd); } catch { return false; }
  });
  handle('wiggle', (hwnd, pid) => {
    try { return native.wiggle(hwnd, pid); } catch { return false; }
  });
  handle('system-awake', (on) => {
    try { return native.systemAwake(on); } catch (e) { return { ok: false, on: false, msg: errMsg(e) }; }
  });
  handle('synth-input', (opts) => {
    try { return native.synthInput(opts); } catch (e) { return { ok: false, msg: errMsg(e) }; }
  });
  handle('get-foreground', () => {
    try { return native.getForeground(); } catch { return '0'; }
  });
  handle('focus-window', (hwnd) => {
    try { return native.focusWindow(hwnd); } catch (e) { return { ok: false, focused: false, msg: errMsg(e) }; }
  });
  handle('minimize-window', (hwnd) => {
    try { return native.minimizeWindow(hwnd); } catch (e) { return { ok: false, msg: errMsg(e) } as { ok: boolean }; }
  });
  handle('native-info', () => capabilities);
  handle('inject', (pid, dll) => {
    try { return native.inject(pid, dll || getDefaultDll()); } catch (e) { return { ok: false, msg: errMsg(e) }; }
  });
  handle('module-loaded', (pid, name) => {
    try { return native.moduleLoaded(pid, name || 'KeepAliveHook.dll'); } catch { return false; }
  });
  handle('eject', (pid, name) => {
    try { return native.eject(pid, name); } catch (e) { return { ok: false, msg: errMsg(e) }; }
  });
  handle('reload', (pid, dll) => {
    try { return native.reload(pid, dll || getDefaultDll()); } catch (e) { return { ok: false, msg: errMsg(e) }; }
  });
  handle('get-exports', (dll) => {
    try { return pe.getExports(dll).names; } catch { return []; }
  });

  // ---- 规则文件 / 状态持久化 ----
  handle('save-config', (dll, targets, opts) => {
    try {
      const cfg = rulesFileFor(dll || getDefaultDll());
      config.save(cfg, targets, opts || {});
      return { ok: true, path: cfg };
    } catch (err) {
      return { ok: false, msg: errMsg(err) };
    }
  });
  handle('load-state', () => loadState());
  handle('save-state', (s) => saveState(s));

  // ---- 拦截日志：实时 tail 的初始回放（订阅时拿最近缓冲）----
  handle('hook-log-read', () => readHookLogBuffer());

  // ---- 复制日志到系统剪贴板（走主进程 clipboard，避开渲染层 sandbox/安全上下文限制）----
  handle('copy-text', (text) => {
    try {
      clipboard.writeText(String(text ?? ''));
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: errMsg(err) };
    }
  });

  // ---- 一键验证：起探针注入该规则并对比注入前后观测 ----
  handle('verify-rule', (rule) => verifyRule(rule));

  // ---- 打开拦截日志（%TEMP%\KeepAliveHook.log）----
  handle('open-hook-log', () => {
    const log = hookLogFile();
    try {
      if (!fs.existsSync(log)) fs.writeFileSync(log, '');
      shell.openPath(log);
      return { ok: true, path: log };
    } catch (err) {
      return { ok: false, msg: errMsg(err) };
    }
  });
}
