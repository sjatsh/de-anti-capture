import { describe, it, expect } from 'vitest';
import { ruleDetail, kindLabel, avatarChar, avatarStyle } from '@/lib/format';
import { mkRule } from '../helpers';

describe('ruleDetail', () => {
  it('describes a keepalive rule by its interval', () => {
    expect(ruleDetail(mkRule({ kind: 'keepalive', intervalSec: 45 }))).toBe('每 45 秒发随机鼠标移动');
  });

  it('describes an idle rule by dll!func', () => {
    expect(ruleDetail(mkRule({ kind: 'idle', dll: 'user32.dll', func: 'GetLastInputInfo' }))).toBe(
      'user32.dll!GetLastInputInfo  空闲→0',
    );
  });

  it('uses fixed copy for fg and uncapture', () => {
    expect(ruleDetail(mkRule({ kind: 'fg' }))).toContain('GetForegroundWindow');
    expect(ruleDetail(mkRule({ kind: 'uncapture' }))).toContain('affinity=NONE');
  });

  it('renders a hook rule with args / no-call / ret override', () => {
    const d = ruleDetail(
      mkRule({
        kind: 'hook',
        dll: 'user32.dll',
        func: 'GetSystemMetrics',
        args: [null, '0x1', null, null],
        callOriginal: false,
        retOverride: '1',
      }),
    );
    expect(d).toContain('user32.dll!GetSystemMetrics');
    expect(d).toContain('入参[1=0x1]');
    expect(d).toContain('不调原函数');
    expect(d).toContain('返回 1');
  });

  it('marks a hook rule with no interception as passthrough', () => {
    const d = ruleDetail(mkRule({ kind: 'hook', dll: 'd.dll', func: 'F' }));
    expect(d).toBe('d.dll!F  ·  透传(未设拦截)');
  });
});

describe('kindLabel', () => {
  it('maps each kind to its Chinese label', () => {
    expect(kindLabel('keepalive')).toBe('保活');
    expect(kindLabel('idle')).toBe('idle');
    expect(kindLabel('fg')).toBe('前台伪装');
    expect(kindLabel('uncapture')).toBe('防截屏');
    expect(kindLabel('hook')).toBe('hook');
  });
});

describe('avatarChar', () => {
  it('takes the first non-space char, uppercased', () => {
    expect(avatarChar('chrome')).toBe('C');
    expect(avatarChar('  spaced')).toBe('S');
  });

  it('falls back to ? for empty input', () => {
    expect(avatarChar('')).toBe('?');
  });
});

describe('avatarStyle', () => {
  it('returns a deterministic color + translucent background', () => {
    const a = avatarStyle('app');
    const b = avatarStyle('app');
    expect(a).toEqual(b);
    expect(String(a.color)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a.background).toBe(a.color + '26');
  });
});
