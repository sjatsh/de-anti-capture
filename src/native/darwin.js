// macOS 原生实现（非注入子集）。与 win32.js 暴露同一组接口，但注入类能力在 macOS 上
// 受 SIP + 强化运行时 + 库验证封死（见 docs/macos-port-research.md），inject/eject/reload/
// moduleLoaded 以 stub 返回明确错误。
//
// 经 koffi 直接调系统框架：
//   CoreFoundation —— CFArray/CFDictionary/CFString/CFNumber 解析窗口信息
//   CoreGraphics   —— CGWindowListCopyWindowInfo（列窗口）、CGEvent*（合成输入保活）
//   IOKit          —— IOPMAssertionDeclareUserActivity（重置全局空闲，免权限）
//
// ⚠️ 本文件无法在 Windows 上测试，需在 Mac 上 `npm install`(编译 koffi) 后实测调试。
//    若 listWindows 返回空，最可能是 kCGWindow* 键名假设不成立——见下方 cfKey() 注释。
import koffi from 'koffi';

// 平台原生实现工厂（见 win32.js 同名说明）：darwin 的 koffi.load 只在 create() 被调用时执行。
export function create() {
const FW = '/System/Library/Frameworks';
const CoreFoundation = koffi.load(`${FW}/CoreFoundation.framework/CoreFoundation`);
const CoreGraphics = koffi.load(`${FW}/CoreGraphics.framework/CoreGraphics`);
const IOKit = koffi.load(`${FW}/IOKit.framework/IOKit`);

// ---- CoreFoundation ----
const CFRelease = CoreFoundation.func('CFRelease', 'void', ['void*']);
const CFArrayGetCount = CoreFoundation.func('CFArrayGetCount', 'long', ['void*']);
const CFArrayGetValueAtIndex = CoreFoundation.func('CFArrayGetValueAtIndex', 'void*', ['void*', 'long']);
const CFDictionaryGetValue = CoreFoundation.func('CFDictionaryGetValue', 'void*', ['void*', 'void*']);
const CFStringGetCString = CoreFoundation.func('CFStringGetCString', 'bool', ['void*', 'void*', 'long', 'uint32']);
const CFStringCreateWithCString = CoreFoundation.func('CFStringCreateWithCString', 'void*', ['void*', 'str', 'uint32']);
const CFNumberGetValue = CoreFoundation.func('CFNumberGetValue', 'bool', ['void*', 'int', 'void*']);

const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberSInt64Type = 4;

// ---- CoreGraphics ----
const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
const CGWindowListCopyWindowInfo = CoreGraphics.func('CGWindowListCopyWindowInfo', 'void*', ['uint32', 'uint32']);
const CGEventCreateMouseEvent = CoreGraphics.func('CGEventCreateMouseEvent', 'void*', ['void*', 'uint32', CGPoint, 'uint32']);
const CGEventPostToPid = CoreGraphics.func('CGEventPostToPid', 'void', ['uint32', 'void*']);

const kCGWindowListOptionAll = 0;
const kCGWindowListOptionOnScreenOnly = 1;
const kCGWindowListExcludeDesktopElements = 16;
const kCGNullWindowID = 0;
const kCGEventMouseMoved = 5;

// ---- IOKit (电源断言：重置系统全局空闲，无需任何权限) ----
const IOPMAssertionDeclareUserActivity = IOKit.func('IOPMAssertionDeclareUserActivity', 'int', ['void*', 'uint32', 'void*']);
const kIOPMUserActiveLocal = 0;

// CGWindowList 字典的键是 CFString 常量。这里用其“名字字符串”重建键——CoreGraphics 里
// 这些常量的实际字符串内容就等于名字（如 kCGWindowOwnerPID 的内容是 "kCGWindowOwnerPID"）。
// 若该假设在某系统版本不成立 → 解析会取不到值，listWindows 返回空；那时改为读导出符号。
const _keyCache = new Map();
function cfKey(name) {
  if (_keyCache.has(name)) return _keyCache.get(name);
  const k = CFStringCreateWithCString(null, name, kCFStringEncodingUTF8); // 进程级常驻，不释放
  _keyCache.set(name, k);
  return k;
}

function cfStr(ref) {
  if (!ref) return '';
  const buf = Buffer.alloc(1024);
  if (CFStringGetCString(ref, buf, buf.length, kCFStringEncodingUTF8)) {
    const z = buf.indexOf(0);
    return buf.toString('utf8', 0, z < 0 ? buf.length : z);
  }
  return '';
}
function cfNum(ref) {
  if (!ref) return 0;
  const out = Buffer.alloc(8);
  if (CFNumberGetValue(ref, kCFNumberSInt64Type, out)) return Number(out.readBigInt64LE(0));
  return 0;
}
function dictStr(dict, key) { return cfStr(CFDictionaryGetValue(dict, cfKey(key))); }
function dictNum(dict, key) { return cfNum(CFDictionaryGetValue(dict, cfKey(key))); }

// ---- 接口实现 ----
function listWindows(opts) {
  const all = !!(opts && opts.all);
  const option = all ? kCGWindowListOptionAll : (kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements);
  const arr = CGWindowListCopyWindowInfo(option, kCGNullWindowID);
  if (!arr) return [];
  const wins = [];
  try {
    const n = CFArrayGetCount(arr);
    for (let i = 0; i < n; i++) {
      const d = CFArrayGetValueAtIndex(arr, i);
      if (!d) continue;
      const wid = dictNum(d, 'kCGWindowNumber');
      const pid = dictNum(d, 'kCGWindowOwnerPID');
      const proc = dictStr(d, 'kCGWindowOwnerName');
      const title = dictStr(d, 'kCGWindowName');         // 需「屏幕录制」权限才有值，否则为空
      const layer = dictNum(d, 'kCGWindowLayer');
      const onscreen = !!dictNum(d, 'kCGWindowIsOnscreen');
      const titled = !!title.trim();
      if (!all) { if (!onscreen || layer !== 0) continue; }  // 普通模式：仅屏上、普通层
      wins.push({ hwnd: String(wid), pid, title, process: proc, cls: '', visible: onscreen });
    }
  } finally { CFRelease(arr); }
  wins.sort((a, b) =>
    (a.process || '').toLowerCase().localeCompare((b.process || '').toLowerCase()) ||
    (a.title || '').localeCompare(b.title || ''));
  return wins;
}

function isWindow(hwndStr) {
  const id = Number(hwndStr) || 0;
  if (!id) return false;
  const arr = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID);
  if (!arr) return false;
  try {
    const n = CFArrayGetCount(arr);
    for (let i = 0; i < n; i++) {
      const d = CFArrayGetValueAtIndex(arr, i);
      if (d && dictNum(d, 'kCGWindowNumber') === id) return true;
    }
  } finally { CFRelease(arr); }
  return false;
}

// 保活：①声明用户活动 → 重置系统全局空闲时钟（无需权限，对“读系统空闲判活”的程序有效）；
//       ②若给了 pid，再用 CGEventPostToPid 给该进程发一次 mouseMoved（需「辅助功能」权限，
//         对非 AppKit 客户端可能被丢弃）。不移动真实光标、不抢焦点。
function wiggle(hwndStr, pid) {
  let acted = false;
  try {
    const idBuf = Buffer.alloc(4);
    IOPMAssertionDeclareUserActivity('WindowKeepAlive', kIOPMUserActiveLocal, idBuf);
    acted = true;
  } catch (_) { /* 忽略 */ }
  if (pid) {
    try {
      const x = 2 + Math.floor(Math.random() * 6), y = 2 + Math.floor(Math.random() * 6);
      const ev = CGEventCreateMouseEvent(null, kCGEventMouseMoved, { x, y }, 0);
      if (ev) { CGEventPostToPid(pid, ev); CFRelease(ev); acted = true; }
    } catch (_) { /* 无辅助功能权限时静默失败 */ }
  }
  return acted;
}

// ---- 注入类：macOS 不支持（系统安全机制封死）----
const UNSUPPORTED = 'macOS 不支持注入式拦截（SIP/强化运行时/库验证限制，详见 docs/macos-port-research.md）';
function injectUnsupported() { return { ok: false, msg: UNSUPPORTED }; }
const inject = injectUnsupported;
const eject = injectUnsupported;
const reload = injectUnsupported;
function moduleLoaded() { return false; }

// 防休眠①：IOKit 电源断言保持系统/显示器不睡（best-effort，未在 Mac 实测，失败静默降级）。
const IOPMAssertionCreateWithName = IOKit.func('IOPMAssertionCreateWithName', 'int', ['void*', 'uint32', 'void*', 'void*']);
const IOPMAssertionRelease = IOKit.func('IOPMAssertionRelease', 'int', ['uint32']);
const kIOPMAssertionLevelOn = 255;
let _awakeId = 0;
function systemAwake(on) {
  try {
    if (on) {
      if (_awakeId) return { ok: true, on: true };
      const idBuf = Buffer.alloc(4);
      const type = CFStringCreateWithCString(null, 'PreventUserIdleDisplaySleep', kCFStringEncodingUTF8);
      const name = CFStringCreateWithCString(null, 'de-anti-capture stay awake', kCFStringEncodingUTF8);
      const r = IOPMAssertionCreateWithName(type, kIOPMAssertionLevelOn, name, idBuf);
      CFRelease(type); CFRelease(name);
      if (r === 0) { _awakeId = idBuf.readUInt32LE(0); return { ok: true, on: true }; }
      return { ok: false, msg: 'IOPMAssertionCreateWithName 失败 ' + r };
    }
    if (_awakeId) { IOPMAssertionRelease(_awakeId); _awakeId = 0; }
    return { ok: true, on: false };
  } catch (e) { return { ok: false, msg: String((e && e.message) || e) }; }
}
// 防休眠②：声明用户活动即可重置系统全局空闲（无需权限；macOS 无 SendInput 等价物，用这个最稳）。
function synthInput() {
  try {
    const idBuf = Buffer.alloc(4);
    IOPMAssertionDeclareUserActivity('de-anti-capture beat', kIOPMUserActiveLocal, idBuf);
    return { ok: true, mode: 'useractivity' };
  } catch (e) { return { ok: false, msg: String((e && e.message) || e) }; }
}

// 防休眠③：前台脉冲在 macOS 上暂不实现（切前台/还原焦点的可靠 API 与 Windows 不同，且本项目
// 主战场是 Windows 无影客户端）。返回明确的 unsupported，渲染层据此不启用脉冲模式。
function getForeground() { return '0'; }
function focusWindow() { return { ok: false, focused: false, msg: 'macOS 暂不支持前台脉冲' }; }
function minimizeWindow() { return { ok: false, msg: 'macOS 暂不支持前台脉冲' }; }

  return { listWindows, isWindow, wiggle, inject, eject, reload, moduleLoaded, systemAwake, synthInput, getForeground, focusWindow, minimizeWindow };
}
