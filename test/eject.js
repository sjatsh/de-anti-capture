'use strict';
// 从指定 PID 列表中卸载 KeepAliveHook.dll（解除文件锁，便于重新编译）。
const win32 = require('../src/native/win32');
const pids = process.argv.slice(2).map((x) => parseInt(x, 10)).filter(Boolean);
if (!pids.length) { console.error('usage: node test/eject.js <pid> [pid...]'); process.exit(1); }
for (const pid of pids) {
  try {
    const loaded = win32.moduleLoaded(pid, 'KeepAliveHook.dll');
    if (!loaded) { console.log(`pid=${pid}: 未加载，跳过`); continue; }
    let r, tries = 0;
    do { r = win32.eject(pid, 'KeepAliveHook.dll'); tries++; }
    while (tries < 8 && win32.moduleLoaded(pid, 'KeepAliveHook.dll'));   // 引用计数可能 >1，循环卸到干净
    console.log(`pid=${pid}: 卸载 ${tries} 次 -> 现在 loaded=${win32.moduleLoaded(pid, 'KeepAliveHook.dll')}`, JSON.stringify(r));
  } catch (e) { console.log(`pid=${pid}: 异常 ${e.message}`); }
}
