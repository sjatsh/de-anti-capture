// 原生层集成测试（取代旧的 test/native-test.js）。
// 仅在 Windows 上运行；端到端注入用例还需要先 `npm run build:dll` 产出 bin/ 下的
// KeepAliveHook.dll 与 inject_target.exe，缺失时自动跳过（不报失败）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import native from '../../src/native/index';
import { getExports, parse } from '../../src/native/peexports';

const isWin = process.platform === 'win32';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(root, 'bin');
const DLL = path.join(BIN, 'KeepAliveHook.dll');
const TARGET = path.join(BIN, 'inject_target.exe');
const haveBinaries = isWin && fs.existsSync(DLL) && fs.existsSync(TARGET);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe.skipIf(!isWin)('native (win32)', () => {
  it('enumerates desktop windows', () => {
    const wins = native.listWindows({ all: false });
    expect(Array.isArray(wins)).toBe(true);
    for (const w of wins.slice(0, 5)) {
      expect(typeof w.hwnd).toBe('string');
      expect(typeof w.pid).toBe('number');
    }
  });

  it('resolves user32 exports', () => {
    expect(getExports('user32.dll').names).toContain('GetLastInputInfo');
  });

  it.skipIf(!haveBinaries)(
    'injects the hook DLL and the idle hook zeroes GetLastInputInfo',
    async () => {
      const CFG = path.join(BIN, 'KeepAliveHook.rules.txt');
      fs.writeFileSync(CFG, '# test\r\n0|idle|1|user32.dll|GetLastInputInfo||idle\r\n', 'utf8');
      expect(parse(DLL).rva['ReloadHooks']).toBeTypeOf('number');

      const target = spawn(TARGET, [], { cwd: BIN });
      let pid: number | null = null;
      const idles: number[] = [];
      target.stdout.on('data', (buf: Buffer) => {
        for (const line of buf.toString().split(/\r?\n/)) {
          if (line.startsWith('PID=')) pid = parseInt(line.slice(4), 10);
          else if (line.startsWith('idle=')) idles.push(parseInt(line.slice(5), 10));
        }
      });

      try {
        await sleep(900);
        expect(pid).not.toBeNull();
        await sleep(1600);

        const res = native.inject(pid as unknown as number, DLL);
        expect(res.ok).toBe(true);

        await sleep(2200);
        const after = idles[idles.length - 1];
        expect(after).toBeLessThanOrEqual(60);

        const ej = native.eject(pid as unknown as number, 'KeepAliveHook.dll');
        expect(ej.ok).toBe(true);
      } finally {
        target.kill();
        await sleep(200);
      }
    },
    15000,
  );
});
