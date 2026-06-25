'use strict';
// 诊断：列出指定进程(按 PID 或进程名子串)的所有顶层窗口详情，
// 用于定位“注入后出现的白屏窗口”是哪一个、什么样式/可见性/标题/截屏保护。
// 用法: node test/win-dump.js 60768,19048        (按 PID)
//       node test/win-dump.js stream_viewer,wuying (按进程名子串)
const koffi = require('koffi');
const path = require('path');
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const EnumWindowsProc = koffi.proto('bool EnumWindowsProc(uintptr hwnd, intptr lparam)');
const EnumWindows = user32.func('EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr']);
const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['uintptr', 'void*']);
const GetWindowTextW = user32.func('GetWindowTextW', 'int', ['uintptr', 'void*', 'int']);
const GetWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['uintptr']);
const GetClassNameW = user32.func('GetClassNameW', 'int', ['uintptr', 'void*', 'int']);
const IsWindowVisible = user32.func('IsWindowVisible', 'bool', ['uintptr']);
const GetWindowRect = user32.func('GetWindowRect', 'bool', ['uintptr', 'void*']);
const GetWindow = user32.func('GetWindow', 'uintptr', ['uintptr', 'uint']);
const GetWindowLongPtrW = user32.func('GetWindowLongPtrW', 'intptr', ['uintptr', 'int']);
const GetWindowDisplayAffinity = user32.func('GetWindowDisplayAffinity', 'bool', ['uintptr', 'void*']);

const OpenProcess = kernel32.func('OpenProcess', 'uintptr', ['uint', 'bool', 'uint']);
const CloseHandle = kernel32.func('CloseHandle', 'bool', ['uintptr']);
const QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'bool', ['uintptr', 'uint', 'void*', 'void*']);

const GW_OWNER = 4, GWL_STYLE = -16, GWL_EXSTYLE = -20;
const big = (v) => (typeof v === 'bigint' ? v : BigInt(Math.trunc(v)));

function procName(pid) {
  const h = OpenProcess(0x1000, false, pid);
  if (big(h) === 0n) return '?';
  try {
    const buf = Buffer.alloc(260 * 2); const sz = Buffer.alloc(4); sz.writeUInt32LE(260, 0);
    if (QueryFullProcessImageNameW(h, 0, buf, sz)) {
      const len = sz.readUInt32LE(0);
      return path.basename(buf.toString('utf16le', 0, len * 2)).replace(/\.exe$/i, '');
    }
  } catch { /* */ } finally { CloseHandle(h); }
  return '?';
}

const ARG = process.argv[2] || 'stream_viewer,wuying';
const PIDS = ARG.split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
const NAMES = ARG.toLowerCase().split(',').filter((x) => !/^\d+$/.test(x));
const cache = new Map();
const rows = [];

const cb = koffi.register((hwnd) => {
  try {
    const pidBuf = Buffer.alloc(4); GetWindowThreadProcessId(hwnd, pidBuf); const pid = pidBuf.readUInt32LE(0);
    let pname = cache.get(pid); if (pname === undefined) { pname = procName(pid); cache.set(pid, pname); }
    const matchPid = PIDS.includes(pid);
    const matchName = NAMES.length && NAMES.some((t) => (pname || '').toLowerCase().includes(t));
    if (!matchPid && !matchName) return true;

    const len = GetWindowTextLengthW(hwnd); let title = '';
    if (len > 0) { const b = Buffer.alloc((len + 1) * 2); const n = GetWindowTextW(hwnd, b, len + 1); title = b.toString('utf16le', 0, n * 2); }
    const cb2 = Buffer.alloc(256 * 2); const cn = GetClassNameW(hwnd, cb2, 256); const cls = cb2.toString('utf16le', 0, cn * 2);
    const vis = !!IsWindowVisible(hwnd);
    const owner = big(GetWindow(hwnd, GW_OWNER)) !== 0n;
    const style = big(GetWindowLongPtrW(hwnd, GWL_STYLE)) & 0xffffffffn;
    const ex = big(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & 0xffffffffn;
    const rb = Buffer.alloc(16); GetWindowRect(hwnd, rb);
    const L = rb.readInt32LE(0), T = rb.readInt32LE(4), R = rb.readInt32LE(8), B = rb.readInt32LE(12);
    const affb = Buffer.alloc(4); const affOk = GetWindowDisplayAffinity(hwnd, affb);
    const has = (v, m) => (v & BigInt(m)) === BigInt(m);
    rows.push({
      hwnd: '0x' + big(hwnd).toString(16), pid, pname, title, cls, vis, owner,
      size: `${R - L}x${B - T}`, pos: `${L},${T}`,
      cap: has(style, 0x00C00000), popup: has(style, 0x80000000), child: has(style, 0x40000000), dis: has(style, 0x08000000),
      layered: has(ex, 0x80000), tool: has(ex, 0x80), noact: has(ex, 0x08000000), transp: has(ex, 0x20),
      aff: affOk ? affb.readUInt32LE(0) : '?'
    });
  } catch (e) { /* */ }
  return true;
}, koffi.pointer(EnumWindowsProc));

EnumWindows(cb, 0);
koffi.unregister(cb);

rows.sort((a, b) => (Number(b.vis) - Number(a.vis)) || a.pid - b.pid);
const yn = (v) => (v ? 'Y' : '-');
console.log(`找到 ${rows.length} 个顶层窗口 (${ARG})  [aff: 0=NONE 1=MONITOR 17=EXCLUDEFROMCAPTURE]\n`);
for (const r of rows) {
  console.log(`pid=${r.pid} ${r.pname}  ${r.hwnd}  vis=${yn(r.vis)} cap=${yn(r.cap)} popup=${yn(r.popup)} child=${yn(r.child)} owner=${yn(r.owner)} dis=${yn(r.dis)} | layered=${yn(r.layered)} tool=${yn(r.tool)} noact=${yn(r.noact)} transp=${yn(r.transp)} aff=${r.aff}`);
  console.log(`     size=${r.size} pos=${r.pos}  class="${r.cls}"  title="${r.title}"`);
  if (r.title) console.log(`     title-codepoints: ${[...r.title].slice(0, 24).map((c) => c.codePointAt(0).toString(16)).join(' ')}`);
}
