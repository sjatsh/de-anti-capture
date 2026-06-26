import { describe, it, expect } from 'vitest';
import { funcSig, protoText, ARG_REGS } from '@/lib/sig';
import type { ApiEntry } from '@/lib/sig';

describe('ARG_REGS', () => {
  it('lists the four x64 register params in order', () => {
    expect(ARG_REGS).toEqual(['RCX', 'RDX', 'R8', 'R9']);
  });
});

describe('funcSig', () => {
  it('looks up a known function (case-insensitive)', () => {
    const e = funcSig('GetLastInputInfo');
    expect(e).not.toBeNull();
    expect(e?.dll).toBe('user32');
    expect(e?.r).toBe('BOOL');
    expect(funcSig('getlastinputinfo')).toBe(funcSig('GETLASTINPUTINFO'));
  });

  it('falls back by stripping a trailing A/W variant suffix', () => {
    // 'MessageBoxW' is not a key, but the base 'messagebox' is
    const w = funcSig('MessageBoxW');
    expect(w).not.toBeNull();
    expect(w).toBe(funcSig('messagebox'));
  });

  it('returns null for empty / unknown names', () => {
    expect(funcSig('')).toBeNull();
    expect(funcSig('totally_made_up_fn')).toBeNull();
  });
});

describe('protoText', () => {
  it('renders a C-like prototype from params', () => {
    const e = funcSig('GetLastInputInfo') as ApiEntry;
    expect(protoText('GetLastInputInfo', e)).toBe('BOOL GetLastInputInfo(PLASTINPUTINFO plii)');
  });

  it('renders (void) when there are no params', () => {
    const e = funcSig('IsDebuggerPresent') as ApiEntry;
    expect(protoText('IsDebuggerPresent', e)).toBe('BOOL IsDebuggerPresent(void)');
  });

  it('appends …+N when the real arg count exceeds the listed params', () => {
    const e = funcSig('NtQueryInformationProcess') as ApiEntry;
    // n=5 but only 4 params are listed
    expect(protoText('NtQueryInformationProcess', e)).toContain('…+1');
  });
});
