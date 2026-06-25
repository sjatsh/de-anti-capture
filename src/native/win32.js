// win32 原生实现工厂（koffi）。包成 create()：让 native/index.js 能同时静态 import 本模块与 darwin.js，
// 而 koffi.load 只在所选平台调用 create() 时执行——避免「导入即触发」跨平台框架加载失败。
import koffi from 'koffi';
import fs from 'fs';
import path from 'path';
import * as pe from './peexports.js';

export function create() {
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

// ---- 常量 ----
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const ACCESS = 0x0002 | 0x0008 | 0x0010 | 0x0020 | 0x0400; // CREATE_THREAD|VM_OP|VM_READ|VM_WRITE|QUERY_INFO
const MEM_COMMIT = 0x1000, MEM_RESERVE = 0x2000, MEM_RELEASE = 0x8000, PAGE_RW = 0x04;
const WM_MOUSEMOVE = 0x0200;
const TH32CS_SNAPMODULE = 0x00000008;
const INVALID = 0xFFFFFFFFFFFFFFFFn;

// ---- 回调原型 ----
const EnumWindowsProc = koffi.proto('bool EnumWindowsProc(uintptr hwnd, intptr lparam)');

// ---- MODULEENTRY32W（用于在目标进程定位模块基址）----
const MODULEENTRY32W = koffi.struct('MODULEENTRY32W', {
  dwSize: 'uint32', th32ModuleID: 'uint32', th32ProcessID: 'uint32',
  GlblcntUsage: 'uint32', ProccntUsage: 'uint32',
  modBaseAddr: 'uintptr', modBaseSize: 'uint32', hModule: 'uintptr',
  szModule: koffi.array('uint16', 256), szExePath: koffi.array('uint16', 260)
});
const ME_SIZE = koffi.sizeof(MODULEENTRY32W);
const OFF_BASE = koffi.offsetof(MODULEENTRY32W, 'modBaseAddr');
const OFF_NAME = koffi.offsetof(MODULEENTRY32W, 'szModule');

// ---- 函数 ----
const EnumWindows = user32.func('EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr']);
const IsWindow = user32.func('IsWindow', 'bool', ['uintptr']);
const IsWindowVisible = user32.func('IsWindowVisible', 'bool', ['uintptr']);
const GetWindowTextW = user32.func('GetWindowTextW', 'int', ['uintptr', 'void*', 'int']);
const GetWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['uintptr']);
const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['uintptr', 'void*']);
const PostMessageW = user32.func('PostMessageW', 'bool', ['uintptr', 'uint', 'uintptr', 'intptr']);
const GetClientRect = user32.func('GetClientRect', 'bool', ['uintptr', 'void*']);
const GetClassNameW = user32.func('GetClassNameW', 'int', ['uintptr', 'void*', 'int']);

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
const FreeLibrary = kernel32.func('FreeLibrary', 'bool', ['uintptr']);
const QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'bool', ['uintptr', 'uint', 'void*', 'void*']);
const CreateToolhelp32Snapshot = kernel32.func('CreateToolhelp32Snapshot', 'uintptr', ['uint', 'uint']);
const Module32FirstW = kernel32.func('Module32FirstW', 'bool', ['uintptr', 'void*']);
const Module32NextW = kernel32.func('Module32NextW', 'bool', ['uintptr', 'void*']);
const GetLastError = kernel32.func('GetLastError', 'uint', []);

const big = (v) => (typeof v === 'bigint' ? v : BigInt(Math.trunc(v)));
const isNull = (h) => big(h) === 0n;

function processName(pid) {
  const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (isNull(h)) return '?';
  try {
    const buf = Buffer.alloc(260 * 2);
    const sz = Buffer.alloc(4); sz.writeUInt32LE(260, 0);
    if (QueryFullProcessImageNameW(h, 0, buf, sz)) {
      const len = sz.readUInt32LE(0);
      return path.basename(buf.toString('utf16le', 0, len * 2)).replace(/\.exe$/i, '');
    }
  } catch { /* */ } finally { CloseHandle(h); }
  return '?';
}

function listWindows(opts) {
  const all = !!(opts && opts.all);   // true = 连“隐藏窗口/无标题窗口”一起列（如全屏云电脑的 layered 投屏窗口）
  const wins = [];
  const cache = new Map();
  const cb = koffi.register((hwnd) => {
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
      // 普通模式：仅“可见 + 有标题”。全部模式：有标题(含隐藏) 或 可见(含无标题)；丢弃“既无标题又隐藏”的纯噪声(IME/Dummy 等)
      if (!all) { if (!visible || !titled) return true; }
      else { if (!titled && !visible) return true; }
      const clsBuf = Buffer.alloc(256 * 2);
      const cn = GetClassNameW(hwnd, clsBuf, 256);
      const cls = clsBuf.toString('utf16le', 0, cn * 2);
      const pidBuf = Buffer.alloc(4);
      GetWindowThreadProcessId(hwnd, pidBuf);
      const pid = pidBuf.readUInt32LE(0);
      let pname = cache.get(pid);
      if (pname === undefined) { pname = processName(pid); cache.set(pid, pname); }
      wins.push({ hwnd: big(hwnd).toString(), pid, title, process: pname, cls, visible });
    } catch { /* */ }
    return true;
  }, koffi.pointer(EnumWindowsProc));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  wins.sort((a, b) =>
    (a.process || '').toLowerCase().localeCompare((b.process || '').toLowerCase()) ||
    (a.title || '').localeCompare(b.title || ''));
  return wins;
}

function isWindow(hwndStr) { return IsWindow(BigInt(hwndStr)); }

function wiggle(hwndStr) {
  const h = BigInt(hwndStr);
  if (!IsWindow(h)) return false;
  const rc = Buffer.alloc(16);
  let w = 300, ht = 200;
  if (GetClientRect(h, rc)) {
    w = Math.max(1, rc.readInt32LE(8) - rc.readInt32LE(0));
    ht = Math.max(1, rc.readInt32LE(12) - rc.readInt32LE(4));
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(Math.random() * w), y = Math.floor(Math.random() * ht);
    PostMessageW(h, WM_MOUSEMOVE, 0n, ((y & 0xffff) << 16) | (x & 0xffff));
  }
  return true;
}

function inject(pid, dllPath) {
  dllPath = path.resolve(dllPath);
  if (!fs.existsSync(dllPath)) return { ok: false, msg: '找不到 DLL: ' + dllPath };
  const h = OpenProcess(ACCESS, false, pid);
  if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() + '（需管理员 / 位数不符）' };
  let mem = 0n, thread = 0n;
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
    const ec = Buffer.alloc(4); GetExitCodeThread(thread, ec);
    if (ec.readUInt32LE(0) === 0) return { ok: false, msg: 'LoadLibraryW 返回 0（位数不符或缺依赖）' };
    return { ok: true, msg: '已注入 (PID ' + pid + ')' };
  } finally {
    if (mem !== 0n) VirtualFreeEx(h, mem, 0n, MEM_RELEASE);
    if (thread !== 0n) CloseHandle(thread);
    CloseHandle(h);
  }
}

function findRemoteModuleBase(pid, dllName) {
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
  } finally { CloseHandle(snap); }
  return 0n;
}

function moduleLoaded(pid, dllName) { return findRemoteModuleBase(pid, dllName) !== 0n; }

function eject(pid, dllName) {
  const base = findRemoteModuleBase(pid, dllName);
  if (base === 0n) return { ok: false, msg: '目标进程未发现 ' + dllName + '（可能未注入）' };
  const h = OpenProcess(ACCESS, false, pid);
  if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() };
  let thread = 0n;
  try {
    const freeLib = big(GetProcAddress(GetModuleHandleW('kernel32.dll'), 'FreeLibrary'));
    thread = big(CreateRemoteThread(h, 0n, 0n, freeLib, base, 0, null));
    if (thread === 0n) return { ok: false, msg: 'CreateRemoteThread 失败 ' + GetLastError() };
    WaitForSingleObject(thread, 10000);
    return { ok: true, msg: '已请求卸载 ' + dllName };
  } finally { if (thread !== 0n) CloseHandle(thread); CloseHandle(h); }
}

function reload(pid, dllPath) {
  const dllName = path.basename(dllPath);
  const base = findRemoteModuleBase(pid, dllName);
  if (base === 0n) return { ok: false, msg: '目标未注入该 DLL，请先注入' };
  const exp = pe.parse(path.resolve(dllPath));
  const rva = exp.rva['ReloadHooks'];
  if (!rva) return { ok: false, msg: 'DLL 未导出 ReloadHooks' };
  const remoteFunc = base + BigInt(rva);
  const h = OpenProcess(ACCESS, false, pid);
  if (isNull(h)) return { ok: false, msg: 'OpenProcess 失败 ' + GetLastError() };
  let thread = 0n;
  try {
    thread = big(CreateRemoteThread(h, 0n, 0n, remoteFunc, 0n, 0, null));
    if (thread === 0n) return { ok: false, msg: 'CreateRemoteThread 失败 ' + GetLastError() };
    WaitForSingleObject(thread, 10000);
    return { ok: true, msg: '已应用规则到 PID ' + pid };
  } finally { if (thread !== 0n) CloseHandle(thread); CloseHandle(h); }
}

  return { listWindows, isWindow, wiggle, inject, eject, reload, moduleLoaded };
}
