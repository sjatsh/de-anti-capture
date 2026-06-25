'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const win32 = require('../src/native/win32');
const pe = require('../src/native/peexports');

const BIN = path.resolve(__dirname, '..', 'bin');
const DLL = path.join(BIN, 'KeepAliveHook.dll');
const CFG = path.join(BIN, 'KeepAliveHook.rules.txt');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) 枚举窗口
  const wins = win32.listWindows();
  console.log('[1] listWindows:', wins.length, '个窗口');
  console.log('    样例:', wins.slice(0, 3).map((w) => `${w.pid} ${w.process} | ${w.title}`).join('  ||  '));

  // 2) 导出表解析
  const u = pe.getExports('user32.dll');
  console.log('[2] user32 导出:', u.names.length, ' 含 GetLastInputInfo:', u.names.includes('GetLastInputInfo'));
  const d = pe.parse(DLL);
  console.log('    KeepAliveHook ReloadHooks RVA:', d.rva['ReloadHooks'] ? '0x' + d.rva['ReloadHooks'].toString(16) : '未找到');

  // 3) 端到端注入
  fs.writeFileSync(CFG, '# test\r\n0|idle|1|user32.dll|GetLastInputInfo||idle\r\n', 'utf8');
  const target = spawn(path.join(BIN, 'inject_target.exe'), [], { cwd: BIN });
  let pid = null; const idles = [];
  target.stdout.on('data', (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line.startsWith('PID=')) pid = parseInt(line.slice(4), 10);
      else if (line.startsWith('idle=')) idles.push(parseInt(line.slice(5), 10));
    }
  });

  await sleep(900);
  console.log('[3] 目标 PID:', pid);
  await sleep(1600);
  const before = idles[idles.length - 1];
  const res = win32.inject(pid, DLL);
  console.log('    inject:', JSON.stringify(res));
  await sleep(2200);
  const after = idles[idles.length - 1];
  console.log(`    idle 注入前=${before}ms  注入后=${after}ms`);
  console.log('    => ' + ((res.ok && after <= 60) ? 'PASS (koffi 注入 + idle hook 生效)' : 'CHECK'));

  const ej = win32.eject(pid, 'KeepAliveHook.dll');
  console.log('[4] eject:', JSON.stringify(ej));

  target.kill();
  await sleep(200);
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
