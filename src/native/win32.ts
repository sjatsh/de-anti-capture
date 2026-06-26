// win32 原生实现工厂（koffi）。包成 create()：让 native/index.ts 能同时静态 import 本模块与 darwin.ts，
// 而 koffi.load 只在所选平台调用 create() 时执行——避免「导入即触发」跨平台框架加载失败。
import koffi from 'koffi';
import fs from 'node:fs';
import path from 'node:path';
import * as pe from './peexports';
import type { NativeImpl } from './types';
import type { WindowInfo, SynthInputOpts, SynthResult } from '@shared/types';

export function create(): NativeImpl {
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');

  // ---- 常量 ----
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const ACCESS = 0x0002 | 0x0008 | 0x0010 | 0x0020 | 0x0400;
  const MEM_COMMIT = 0x1000;
  const MEM_RESERVE = 0x2000;
  const MEM_RELEASE = 0x8000;
  const PAGE_RW = 0x04;
  const WM_MOUSEMOVE = 0x0200;
  const TH32CS_SNAPMODULE = 0x00000008;
  const INVALID = 0xffffffffffffffffn;

  // ---- 回调原型 ----
  const EnumWindowsProc = koffi.proto('bool EnumWindowsProc(uintptr hwnd, intptr lparam)');

  // ---- MODULEENTRY32W（用于在目标进程定位模块基址）----
  const MODULEENTRY32W = koffi.struct('MODULEENTRY32W', {
    dwSize: 'uint32',
    th32ModuleID: 'uint32',
    th32ProcessID: 'uint32',
    GlblcntUsage: 'uint32',
    ProccntUsage: 'uint32',
    modBaseAddr: 'uintptr',
    modBaseSize: 'uint32',
    hModule: 'uintptr',
    szModule: koffi.array('uint16', 256),
    szExePath: koffi.array('uint16', 260),
  });
  const ME_SIZE = koffi.sizeof(MODULEENTRY32W);
  const OFF_BASE = koffi.offsetof(MODULEENTRY32W, 'modBaseAddr');
  const OFF_NAME = koffi.offsetof(MODULEENTRY32W, 'szModule');

  // ---- 函数 ----
  const EnumWindows = user32.func('EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr']);
  const IsWindowFn = user32.func('IsWindow', 'bool', ['uintptr']);
  const IsWindowVisible = user32.func('IsWindowVisible', 'bool', ['uintptr']);
  const GetWindowTextW = user32.func('GetWindowTextW', 'int', ['uintptr', 'void*', 'int']);
  const GetWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['uintptr']);
  const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['uintptr', 'void*']);
  const PostMessageW = user32.func('PostMessageW', 'bool', ['uintptr', 'uint', 'uintptr', 'intptr']);
  const GetClientRect = user32.func('GetClientRect', 'bool', ['uintptr', 'void*']);
  const GetClassNameW = user32.func('GetClassNameW', 'int', ['uintptr', 'void*', 'int']);
  const SetForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['uintptr']);
  const BringWindowToTop = user32.func('BringWindowToTop', 'bool', ['uintptr']);
  const AttachThreadInput = user32.func('AttachThreadInput', 'bool', ['uint32', 'uint32', 'bool']);
  const GetForegroundWindowFn = user32.func('GetForegroundWindow', 'uintptr', []);
  const IsIconic = user32.func('IsIconic', 'bool', ['uintptr']);
  const ShowWindow = user32.func('ShowWindow', 'bool', ['uintptr', 'int']);

  const OpenProcess = kernel32.func('OpenProcess', 'uintptr', ['uint', 'bool', 'uint']);
  const CloseHandle = kernel32.func('CloseHandle', 'bool', ['uintptr']);
  const VirtualAllocEx = kernel32.func('VirtualAllocEx', 'uintptr', ['uintptr', 'uintptr', 'size_t', 'uint', 'uint']);
  const VirtualFreeEx = kernel32.func('VirtualFreeEx', 'bool', ['uintptr', 'uintptr', 'size_t', 'uint']);
  const WriteProcessMemory = kernel32.func('WriteProcessMemory', 'bool', ['uintptr', 'uintptr', 'void*', 'size_t', 'void*']);
  const CreateRemoteThread = kernel32.func('CreateRemoteThread', 'uintptr', ['uintptr', 'uintptr', 'size_t', 'uintptr', 'uintptr', 'uint', 'void*']);
  const GetModuleHandleW = kernel32.func('GetModuleHandleW', 'uintptr', ['str16']);
  const GetProcAddress = kernel32.func('GetProcAddress', 'uintptr', ['uintptr', 'str']);
  const WaitForSingleObject = kernel32.func('WaitForSingleObject', 'uint', ['uintptr', 'uint']);
  const GetExitCodeThread = kernel32.func('GetExitCodeThread', 'bool', ['uintptr', 'void*']);
  const QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'bool', ['uintptr', 'uint', 'void*', 'void*']);
  const CreateToolhelp32Snapshot = kernel32.func('CreateToolhelp32Snapshot', 'uintptr', ['uint', 'uint']);
  const Module32FirstW = kernel32.func('Module32FirstW', 'bool', ['uintptr', 'void*']);
  const Module32NextW = kernel32.func('Module32NextW', 'bool', ['uintptr', 'void*']);
  const GetLastError = kernel32.func('GetLastError', 'uint', []);
  const GetCurrentThreadId = kernel32.func('GetCurrentThreadId', 'uint32', []);

  const big = (v: number | bigint): bigint => (typeof v === 'bigint' ? v : BigInt(Math.trunc(v)));
  const isNull = (h: number | bigint): boolean => big(h) === 0n;

  function processName(pid: number): string {
    const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (isNull(h)) return '?';
    try {
      const buf = Buffer.alloc(260 * 2);
      const sz = Buffer.alloc(4);
      sz.writeUInt32LE(260, 0);
      if (QueryFullProcessImageNameW(h, 0, buf, sz)) {
        const len = sz.readUInt32LE(0);
        return path.basename(buf.toString('utf16le', 0, len * 2)).replace(/\.exe$/i, '');
      }
    } catch {
      /* ignore */
    } finally {
      CloseHandle(h);
    }
    return '?';
  }

  function listWindows(opts: { all?: boolean }): WindowInfo[] {
    const all = !!opts?.all;
    const wins: WindowInfo[] = [];
    const cache = new Map<number, string>();
    const cb = koffi.register((hwnd: number | bigint): boolean => {
      try {
        const visible = !!IsWindowVisible(hwnd);
        const len = GetWindowTextLengthW(hwnd);
        let title = '';
        if (len > 0) {
          const buf = Buffer.alloc((len + 1) * 2);
          const n = GetWindowTextW(hwnd, buf, len + 1);
          title = buf.toString('utf16le', 0, n * 2);
        }
        const titled = !!title.trim();
        if (!all) {
          if (!visible || !titled) return true;
        } else {
          if (!titled && !visible) return true;
        }
        const clsBuf = Buffer.alloc(256 * 2);
        const cn = GetClassNameW(hwnd, clsBuf, 256);
        const cls = clsBuf.toString('utf16le', 0, cn * 2);
        const pidBuf = Buffer.alloc(4);
        GetWindowThreadProcessId(hwnd, pidBuf);
        const pid = pidBuf.readUInt32LE(0);
        let pname = cache.get(pid);
        if (pname === undefined) {
          pname = processName(pid);
          cache.set(pid, pname);
        }
        wins.push({ hwnd: big(hwnd).toString(), pid, title, process: pname, cls, visible });
      } catch {
        /* ignore */
      }
      return true;
    }, koffi.pointer(EnumWindowsProc));
    EnumWindows(cb, 0);
    koffi.unregister(cb);
    wins.sort(
      (a, b) =>
        (a.process || '').toLowerCase().localeCompare((b.process || '').toLowerCase()) ||
        (a.title || '').localeCompare(b.title || ''),
    );
    return wins;
  }

  function isWindow(hwndStr: string): boolean {
    return !!IsWindowFn(BigInt(hwndStr));
  }

  function wiggle(hwndStr: string): boolean {
    const h = BigInt(hwndStr);
    if (!IsWindowFn(h)) return false;
    const rc = Buffer.alloc(16);
    let w = 300;
    let ht = 200;
    if (GetClientRect(h, rc)) {
      w = Math.max(1, rc.readInt32LE(8) - rc.readInt32LE(0));
      ht = Math.max(1, rc.readInt32LE(12) - rc.readInt32LE(4));
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * ht);
      PostMessageW(h, WM_MOUSEMOVE, 0n, ((y & 0xffff) << 16) | (x & 0xffff));
    }
    return true;
  }

  function inject(pid: number, dllPath: string): { ok: boolean; msg?: string } {
    dllPath = path.resolve(dllPath);
    if (!fs.existsSync(dllPath)) return { ok: false, msg: '找不到 DLL: ' + dllPath };
    const h = OpenProcess(ACCESS, false, pid);
    if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() + '（需管理员 / 位数不符）' };
    let mem: bigint = 0n;
    let thread: bigint = 0n;
    try {
      const wbuf = Buffer.from(dllPath + '\0', 'utf16le');
      mem = big(VirtualAllocEx(h, 0n, BigInt(wbuf.length), MEM_COMMIT | MEM_RESERVE, PAGE_RW));
      if (mem === 0n) return { ok: false, msg: 'VirtualAllocEx 失败 ' + GetLastError() };
      const written = Buffer.alloc(8);
      if (!WriteProcessMemory(h, mem, wbuf, BigInt(wbuf.length), written))
        return { ok: false, msg: 'WriteProcessMemory 失败 ' + GetLastError() };
      const loadLib = big(GetProcAddress(GetModuleHandleW('kernel32.dll'), 'LoadLibraryW'));
      if (loadLib === 0n) return { ok: false, msg: '找不到 LoadLibraryW' };
      thread = big(CreateRemoteThread(h, 0n, 0n, loadLib, mem, 0, null));
      if (thread === 0n) return { ok: false, msg: 'CreateRemoteThread 失败 ' + GetLastError() };
      WaitForSingleObject(thread, 10000);
      const ec = Buffer.alloc(4);
      GetExitCodeThread(thread, ec);
      if (ec.readUInt32LE(0) === 0) return { ok: false, msg: 'LoadLibraryW 返回 0（位数不符或缺依赖）' };
      return { ok: true, msg: '已注入 (PID ' + pid + ')' };
    } finally {
      if (mem !== 0n) VirtualFreeEx(h, mem, 0n, MEM_RELEASE);
      if (thread !== 0n) CloseHandle(thread);
      CloseHandle(h);
    }
  }

  function findRemoteModuleBase(pid: number, dllName: string): bigint {
    const snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid);
    if (big(snap) === INVALID) return 0n;
    try {
      const buf = Buffer.alloc(ME_SIZE);
      buf.writeUInt32LE(ME_SIZE, 0);
      let ok = Module32FirstW(snap, buf);
      while (ok) {
        let e = OFF_NAME;
        while (e + 1 < buf.length && !(buf[e] === 0 && buf[e + 1] === 0)) e += 2;
        const name = buf.toString('utf16le', OFF_NAME, e);
        if (name.toLowerCase() === dllName.toLowerCase()) return buf.readBigUInt64LE(OFF_BASE);
        ok = Module32NextW(snap, buf);
      }
    } finally {
      CloseHandle(snap);
    }
    return 0n;
  }

  function moduleLoaded(pid: number, dllName?: string): boolean {
    return findRemoteModuleBase(pid, dllName ?? 'KeepAliveHook.dll') !== 0n;
  }

  function eject(pid: number, dllName?: string): { ok: boolean; msg?: string } {
    const name = dllName ?? 'KeepAliveHook.dll';
    const base = findRemoteModuleBase(pid, name);
    if (base === 0n) return { ok: false, msg: '目标进程未发现 ' + name + '（可能未注入）' };
    const h = OpenProcess(ACCESS, false, pid);
    if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() };
    let thread: bigint = 0n;
    try {
      const freeLib = big(GetProcAddress(GetModuleHandleW('kernel32.dll'), 'FreeLibrary'));
      thread = big(CreateRemoteThread(h, 0n, 0n, freeLib, base, 0, null));
      if (thread === 0n) return { ok: false, msg: 'CreateRemoteThread 失败 ' + GetLastError() };
      WaitForSingleObject(thread, 10000);
      return { ok: true, msg: '已请求卸载 ' + name };
    } finally {
      if (thread !== 0n) CloseHandle(thread);
      CloseHandle(h);
    }
  }

  function reload(pid: number, dllPath: string): { ok: boolean; msg?: string } {
    const dllName = path.basename(dllPath);
    const base = findRemoteModuleBase(pid, dllName);
    if (base === 0n) return { ok: false, msg: '目标未注入该 DLL，请先注入' };
    const exp = pe.parse(path.resolve(dllPath));
    const rva = exp.rva['ReloadHooks'];
    if (!rva) return { ok: false, msg: 'DLL 未导出 ReloadHooks' };
    const remoteFunc = base + BigInt(rva);
    const h = OpenProcess(ACCESS, false, pid);
    if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() };
    let thread: bigint = 0n;
    try {
      thread = big(CreateRemoteThread(h, 0n, 0n, remoteFunc, 0n, 0, null));
      if (thread === 0n) return { ok: false, msg: 'CreateRemoteThread 失败 ' + GetLastError() };
      WaitForSingleObject(thread, 10000);
      return { ok: true, msg: '已应用规则到 PID ' + pid };
    } finally {
      if (thread !== 0n) CloseHandle(thread);
      CloseHandle(h);
    }
  }

  // ---------------- 防休眠①：系统级电源断言 ----------------
  const SetThreadExecutionState = kernel32.func('SetThreadExecutionState', 'uint32', ['uint32']);
  const ES_CONTINUOUS = 0x80000000;
  const ES_SYSTEM_REQUIRED = 0x00000001;
  const ES_DISPLAY_REQUIRED = 0x00000002;

  function systemAwake(on: boolean): { ok: boolean; on: boolean } {
    const flags = (on ? ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED : ES_CONTINUOUS) >>> 0;
    const prev = SetThreadExecutionState(flags);
    return { ok: prev !== 0, on: !!on };
  }

  // ---------------- 防休眠②：真实输入心跳（SendInput）----------------
  const SendInput = user32.func('SendInput', 'uint32', ['uint32', 'void*', 'int32']);
  const INPUT_SIZE = 40;
  const INPUT_MOUSE = 0;
  const INPUT_KEYBOARD = 1;
  const MOUSEEVENTF_MOVE = 0x0001;
  const KEYEVENTF_KEYUP = 0x0002;
  const VK_F15 = 0x7e;

  function mouseMoveInput(dx: number, dy = 0): Buffer {
    const b = Buffer.alloc(INPUT_SIZE);
    b.writeUInt32LE(INPUT_MOUSE, 0);
    b.writeInt32LE(dx, 8);
    b.writeInt32LE(dy, 12);
    b.writeUInt32LE(MOUSEEVENTF_MOVE, 20);
    return b;
  }
  function keyInput(vk: number, up: boolean): Buffer {
    const b = Buffer.alloc(INPUT_SIZE);
    b.writeUInt32LE(INPUT_KEYBOARD, 0);
    b.writeUInt16LE(vk, 8);
    b.writeUInt32LE(up ? KEYEVENTF_KEYUP : 0, 12);
    return b;
  }
  function synthInput(opts?: SynthInputOpts): SynthResult {
    const mode = opts?.mode ?? 'key';
    const parts: Buffer[] = [];
    if (mode === 'mouse' || mode === 'both') {
      if (opts?.dx != null || opts?.dy != null) {
        // 单向真实位移：让光标真正走位（前台脉冲用，供远端 GetCursorPos 轮询读到）
        parts.push(mouseMoveInput(opts.dx ?? 0, opts.dy ?? 0));
      } else {
        // ±1px 净零微移：本机防空闲（SendInput 事件即更新系统「最后输入时间」）
        parts.push(mouseMoveInput(1), mouseMoveInput(-1));
      }
    }
    if (mode === 'key' || mode === 'both') {
      const vk = opts?.vk ?? VK_F15;
      parts.push(keyInput(vk, false), keyInput(vk, true));
    }
    if (!parts.length) return { ok: false, msg: '无输入' };
    const sent = SendInput(parts.length, Buffer.concat(parts), INPUT_SIZE);
    return { ok: sent === parts.length, sent, mode };
  }

  // ---------------- 防休眠③：前台脉冲（focus-pulse）----------------
  function getForeground(): string {
    return big(GetForegroundWindowFn()).toString();
  }

  function focusWindow(hwndStr: string): { ok: boolean; focused: boolean; msg?: string } {
    const h = BigInt(hwndStr);
    if (!IsWindowFn(h)) return { ok: false, focused: false };
    const myTid = GetCurrentThreadId();
    const pidBuf = Buffer.alloc(4);
    const tgtTid = GetWindowThreadProcessId(h, pidBuf);
    let attached = false;
    if (tgtTid && tgtTid !== myTid) attached = !!AttachThreadInput(myTid, tgtTid, true);
    try {
      if (IsIconic(h)) ShowWindow(h, 9);
      BringWindowToTop(h);
      const ok = !!SetForegroundWindow(h);
      const focused = big(GetForegroundWindowFn()) === h;
      return { ok, focused };
    } finally {
      if (attached) AttachThreadInput(myTid, tgtTid, false);
    }
  }

  function minimizeWindow(hwndStr: string): { ok: boolean } {
    const h = BigInt(hwndStr);
    if (!IsWindowFn(h)) return { ok: false };
    ShowWindow(h, 6);
    return { ok: !!IsIconic(h) };
  }

  return {
    listWindows,
    isWindow,
    wiggle,
    inject,
    eject,
    reload,
    moduleLoaded,
    systemAwake,
    synthInput,
    getForeground,
    focusWindow,
    minimizeWindow,
  };
}
