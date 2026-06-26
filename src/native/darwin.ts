// macOS 原生实现（非注入子集）。与 win32.ts 暴露同一组接口，但注入类能力在 macOS 上
// 受 SIP + 强化运行时 + 库验证封死，inject/eject/reload/moduleLoaded 以 stub 返回明确错误。
import koffi from 'koffi';
import type { NativeImpl } from './types';
import type { WindowInfo } from '@shared/types';

export function create(): NativeImpl {
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

  // ---- IOKit ----
  const IOPMAssertionDeclareUserActivity = IOKit.func('IOPMAssertionDeclareUserActivity', 'int', ['void*', 'uint32', 'void*']);
  const kIOPMUserActiveLocal = 0;

  const _keyCache = new Map<string, unknown>();
  function cfKey(name: string): unknown {
    const cached = _keyCache.get(name);
    if (cached !== undefined) return cached;
    const k = CFStringCreateWithCString(null, name, kCFStringEncodingUTF8);
    _keyCache.set(name, k);
    return k;
  }

  function cfStr(ref: unknown): string {
    if (!ref) return '';
    const buf = Buffer.alloc(1024);
    if (CFStringGetCString(ref, buf, buf.length, kCFStringEncodingUTF8)) {
      const z = buf.indexOf(0);
      return buf.toString('utf8', 0, z < 0 ? buf.length : z);
    }
    return '';
  }
  function cfNum(ref: unknown): number {
    if (!ref) return 0;
    const out = Buffer.alloc(8);
    if (CFNumberGetValue(ref, kCFNumberSInt64Type, out)) return Number(out.readBigInt64LE(0));
    return 0;
  }
  function dictStr(dict: unknown, key: string): string {
    return cfStr(CFDictionaryGetValue(dict, cfKey(key)));
  }
  function dictNum(dict: unknown, key: string): number {
    return cfNum(CFDictionaryGetValue(dict, cfKey(key)));
  }

  function listWindows(opts: { all?: boolean }): WindowInfo[] {
    const all = !!opts?.all;
    const option = all
      ? kCGWindowListOptionAll
      : kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    const arr = CGWindowListCopyWindowInfo(option, kCGNullWindowID);
    if (!arr) return [];
    const wins: WindowInfo[] = [];
    try {
      const n = Number(CFArrayGetCount(arr));
      for (let i = 0; i < n; i++) {
        const d = CFArrayGetValueAtIndex(arr, i);
        if (!d) continue;
        const wid = dictNum(d, 'kCGWindowNumber');
        const pid = dictNum(d, 'kCGWindowOwnerPID');
        const proc = dictStr(d, 'kCGWindowOwnerName');
        const title = dictStr(d, 'kCGWindowName');
        const layer = dictNum(d, 'kCGWindowLayer');
        const onscreen = !!dictNum(d, 'kCGWindowIsOnscreen');
        if (!all) {
          if (!onscreen || layer !== 0) continue;
        }
        wins.push({ hwnd: String(wid), pid, title, process: proc, cls: '', visible: onscreen });
      }
    } finally {
      CFRelease(arr);
    }
    wins.sort(
      (a, b) =>
        (a.process || '').toLowerCase().localeCompare((b.process || '').toLowerCase()) ||
        (a.title || '').localeCompare(b.title || ''),
    );
    return wins;
  }

  function isWindow(hwndStr: string): boolean {
    const id = Number(hwndStr) || 0;
    if (!id) return false;
    const arr = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID);
    if (!arr) return false;
    try {
      const n = Number(CFArrayGetCount(arr));
      for (let i = 0; i < n; i++) {
        const d = CFArrayGetValueAtIndex(arr, i);
        if (d && dictNum(d, 'kCGWindowNumber') === id) return true;
      }
    } finally {
      CFRelease(arr);
    }
    return false;
  }

  function wiggle(_hwndStr: string, pid?: number): boolean {
    let acted = false;
    try {
      const idBuf = Buffer.alloc(4);
      IOPMAssertionDeclareUserActivity('WindowKeepAlive', kIOPMUserActiveLocal, idBuf);
      acted = true;
    } catch {
      /* ignore */
    }
    if (pid) {
      try {
        const x = 2 + Math.floor(Math.random() * 6);
        const y = 2 + Math.floor(Math.random() * 6);
        const ev = CGEventCreateMouseEvent(null, kCGEventMouseMoved, { x, y }, 0);
        if (ev) {
          CGEventPostToPid(pid, ev);
          CFRelease(ev);
          acted = true;
        }
      } catch {
        /* 无辅助功能权限时静默失败 */
      }
    }
    return acted;
  }

  const UNSUPPORTED = 'macOS 不支持注入式拦截（SIP/强化运行时/库验证限制，详见 docs/macos-port-research.md）';
  const injectUnsupported = (): { ok: false; msg: string } => ({ ok: false, msg: UNSUPPORTED });
  const inject = injectUnsupported;
  const eject = injectUnsupported;
  const reload = injectUnsupported;
  const moduleLoaded = (): boolean => false;

  // 防休眠①：IOKit 电源断言
  const IOPMAssertionCreateWithName = IOKit.func('IOPMAssertionCreateWithName', 'int', ['void*', 'uint32', 'void*', 'void*']);
  const IOPMAssertionRelease = IOKit.func('IOPMAssertionRelease', 'int', ['uint32']);
  const kIOPMAssertionLevelOn = 255;
  let _awakeId = 0;

  function systemAwake(on: boolean): { ok: boolean; on: boolean; msg?: string } {
    try {
      if (on) {
        if (_awakeId) return { ok: true, on: true };
        const idBuf = Buffer.alloc(4);
        const type = CFStringCreateWithCString(null, 'PreventUserIdleDisplaySleep', kCFStringEncodingUTF8);
        const name = CFStringCreateWithCString(null, 'de-anti-capture stay awake', kCFStringEncodingUTF8);
        const r = IOPMAssertionCreateWithName(type, kIOPMAssertionLevelOn, name, idBuf);
        CFRelease(type);
        CFRelease(name);
        if (r === 0) {
          _awakeId = idBuf.readUInt32LE(0);
          return { ok: true, on: true };
        }
        return { ok: false, on: false, msg: 'IOPMAssertionCreateWithName 失败 ' + r };
      }
      if (_awakeId) {
        IOPMAssertionRelease(_awakeId);
        _awakeId = 0;
      }
      return { ok: true, on: false };
    } catch (e) {
      return { ok: false, on: false, msg: String((e as Error)?.message || e) };
    }
  }

  function synthInput(): { ok: boolean; mode?: string; msg?: string } {
    try {
      const idBuf = Buffer.alloc(4);
      IOPMAssertionDeclareUserActivity('de-anti-capture beat', kIOPMUserActiveLocal, idBuf);
      return { ok: true, mode: 'useractivity' };
    } catch (e) {
      return { ok: false, msg: String((e as Error)?.message || e) };
    }
  }

  function getForeground(): string {
    return '0';
  }
  function focusWindow(): { ok: boolean; focused: boolean; msg: string } {
    return { ok: false, focused: false, msg: 'macOS 暂不支持前台脉冲' };
  }
  function minimizeWindow(): { ok: boolean; msg: string } {
    return { ok: false, msg: 'macOS 暂不支持前台脉冲' };
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
