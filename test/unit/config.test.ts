import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSpec, save } from '../../src/config';
import { mkRule } from '../helpers';

describe('buildSpec', () => {
  it('returns empty for non-hook rules', () => {
    expect(buildSpec(mkRule({ kind: 'idle' }))).toBe('');
    expect(buildSpec(mkRule({ kind: 'keepalive' }))).toBe('');
  });

  it('encodes call flag + per-slot args + ret override', () => {
    const spec = buildSpec(
      mkRule({ kind: 'hook', args: [null, '5', null, '0x7'], callOriginal: false, retOverride: '0' }),
    );
    expect(spec).toBe('call=0;a1=5;a3=0x7;ret=0');
  });

  it('omits args and ret when unset, keeping call', () => {
    expect(buildSpec(mkRule({ kind: 'hook', callOriginal: true }))).toBe('call=1');
  });
});

describe('save', () => {
  const tmp = path.join(os.tmpdir(), `dac-cfg-${process.pid}.txt`);
  afterEach(() => {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  });

  it('writes only idle/hook/fg/uncapture rules, skips keepalive, tags by pid', () => {
    save(
      tmp,
      [
        {
          pid: 1234,
          rules: [
            mkRule({ kind: 'keepalive' }),
            mkRule({ kind: 'idle', dll: 'user32.dll', func: 'GetLastInputInfo', name: 'idle归零' }),
          ],
        },
      ],
      {},
    );
    const txt = fs.readFileSync(tmp, 'utf8');
    expect(txt).toContain('# 拦截规则配置');
    expect(txt).toContain('1234|idle|1|user32.dll|GetLastInputInfo||idle归零');
    expect(txt).not.toContain('keepalive');
  });

  it('emits a global logall line when opts.logAll is set', () => {
    save(tmp, [], { logAll: true });
    expect(fs.readFileSync(tmp, 'utf8')).toContain('0|logall|1|||');
  });

  it('sanitizes pipe/newline chars out of the rule name', () => {
    save(tmp, [{ pid: 1, rules: [mkRule({ kind: 'hook', dll: 'd', func: 'F', name: 'a|b\nc' })] }], {});
    const line = fs.readFileSync(tmp, 'utf8').split(/\r?\n/).find((l) => l.startsWith('1|hook'));
    expect(line).toBeDefined();
    expect(line).toContain('a b c');
  });
});
