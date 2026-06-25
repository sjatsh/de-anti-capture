'use strict';
// 列出某 PID 的已加载模块（名字+基址），用来判断 fg 钩子该跳过哪些框架/系统 DLL。
const koffi = require('koffi');
const kernel32 = koffi.load('kernel32.dll');

const MODULEENTRY32W = koffi.struct('MODULEENTRY32W', {
  dwSize: 'uint32', th32ModuleID: 'uint32', th32ProcessID: 'uint32',
  GlblcntUsage: 'uint32', ProccntUsage: 'uint32',
  modBaseAddr: 'uintptr', modBaseSize: 'uint32', hModule: 'uintptr',
  szModule: koffi.array('uint16', 256), szExePath: koffi.array('uint16', 260)
});
const ME_SIZE = koffi.sizeof(MODULEENTRY32W);
const CreateToolhelp32Snapshot = kernel32.func('CreateToolhelp32Snapshot', 'uintptr', ['uint', 'uint']);
const Module32FirstW = kernel32.func('Module32FirstW', 'bool', ['uintptr', 'void*']);
const Module32NextW = kernel32.func('Module32NextW', 'bool', ['uintptr', 'void*']);
const CloseHandle = kernel32.func('CloseHandle', 'bool', ['uintptr']);

const TH32CS_SNAPMODULE = 0x8, TH32CS_SNAPMODULE32 = 0x10;
const pid = parseInt(process.argv[2], 10);
if (!pid) { console.error('usage: node test/mods.js <pid>'); process.exit(1); }

const snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
if (BigInt(snap) === 0xFFFFFFFFFFFFFFFFn || BigInt(snap) === 0n) { console.error('snapshot failed (需要管理员/位数一致)'); process.exit(1); }
const buf = Buffer.alloc(ME_SIZE); buf.writeUInt32LE(ME_SIZE, 0);
const mods = [];
const readName = (b) => { const off = koffi.offsetof(MODULEENTRY32W, 'szModule'); const s = b.toString('utf16le', off, off + 256 * 2); return s.slice(0, s.indexOf('\0') >= 0 ? s.indexOf('\0') : s.length); };
if (Module32FirstW(snap, buf)) { do { mods.push(readName(buf)); buf.writeUInt32LE(ME_SIZE, 0); } while (Module32NextW(snap, buf)); }
CloseHandle(snap);

console.log(`pid=${pid} 共 ${mods.length} 个模块:`);
const qt = mods.filter((m) => /^qt\d/i.test(m));
const sys = mods.filter((m) => /^(kernel32|kernelbase|user32|gdi32|ntdll|combase|ole32|shell32|shcore|win32u|msvcrt|ucrtbase|vcruntime|advapi32|rpcrt4|sechost|imm32|uxtheme|dwmapi|d3d|dxgi|gdiplus|setupapi|ws2_32|crypt|bcrypt|wininet|winhttp|propsys|comctl32|comdlg32|oleaut32|version|psapi|powrprof|profapi|cfgmgr32|windows\.)/i.test(m));
const other = mods.filter((m) => !qt.includes(m) && !sys.includes(m));
console.log('\n--- Qt 框架模块(应跳过) ---\n' + qt.join('  '));
console.log('\n--- 其它/可能含无影自身逻辑(值得 hook) ---\n' + other.join('\n'));
