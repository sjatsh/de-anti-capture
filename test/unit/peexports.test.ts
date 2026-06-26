import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, getExports } from '../../src/native/peexports';

const isWin = process.platform === 'win32';

describe('parse (PE export table)', () => {
  const tmp = path.join(os.tmpdir(), `dac-pe-${process.pid}.bin`);
  afterEach(() => {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  });

  it('returns an empty table for a missing file', () => {
    expect(parse(path.join(os.tmpdir(), 'definitely-missing-xyz.dll'))).toEqual({ names: [], rva: {} });
  });

  it('returns an empty table for a non-PE file', () => {
    fs.writeFileSync(tmp, Buffer.from('not a real PE file at all'));
    expect(parse(tmp)).toEqual({ names: [], rva: {} });
  });
});

describe('getExports', () => {
  it('returns an empty table for an unresolvable dll name', () => {
    expect(getExports('no-such-library-xyz.dll').names).toEqual([]);
  });

  it.skipIf(!isWin)('parses real exports from user32.dll on Windows', () => {
    const exp = getExports('user32.dll');
    expect(exp.names.length).toBeGreaterThan(0);
    expect(exp.names).toContain('GetLastInputInfo');
    expect(typeof exp.rva['GetLastInputInfo']).toBe('number');
  });

  it('caches repeated lookups (same object reference)', () => {
    const a = getExports('no-such-library-xyz.dll');
    const b = getExports('no-such-library-xyz.dll');
    expect(a).toBe(b);
  });
});
