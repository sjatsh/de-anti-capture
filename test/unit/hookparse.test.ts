import { describe, it, expect } from 'vitest';
import { parseHookLine, ruleHookKey } from '@/lib/hookparse';

describe('parseHookLine', () => {
  it('treats a line without the [ts pid=] prefix as raw', () => {
    const ev = parseHookLine('plain text');
    expect(ev).toEqual({ type: 'raw', pid: null, ts: null, body: 'plain text', raw: 'plain text' });
  });

  it('parses the prefix into ts + pid + body', () => {
    const ev = parseHookLine('[12:34:56.789 pid=42] something happened');
    expect(ev.ts).toBe('12:34:56.789');
    expect(ev.pid).toBe(42);
    expect(ev.body).toBe('something happened');
    expect(ev.type).toBe('log');
  });

  it('detects StartHooking', () => {
    expect(parseHookLine('[12:00:00.000 pid=1] === StartHooking v3').type).toBe('start');
  });

  it('parses a rule line', () => {
    const ev = parseHookLine('[12:00:00.000 pid=1] rule[hook] user32.dll!GetSystemMetrics call=1 ret=0 -> 3 slots');
    expect(ev.type).toBe('rule');
    expect(ev.kind).toBe('hook');
    expect(ev.dll).toBe('user32.dll');
    expect(ev.func).toBe('GetSystemMetrics');
    expect(ev.call).toBe(true);
    expect(ev.ret).toBe(false);
    expect(ev.slots).toBe(3);
  });

  it('parses InstallFromConfig done', () => {
    const ev = parseHookLine('[12:00:00.000 pid=1] InstallFromConfig done: 5 slots');
    expect(ev.type).toBe('done');
    expect(ev.slots).toBe(5);
  });

  it('parses a STAT line and normalizes "-" to empty', () => {
    const ev = parseHookLine('[12:00:00.000 pid=1] STAT kind=obs dll=- func=- hits=7');
    expect(ev.type).toBe('stat');
    expect(ev.kind).toBe('obs');
    expect(ev.dll).toBe('');
    expect(ev.func).toBe('');
    expect(ev.hits).toBe(7);
  });

  it('parses uncapture strip count', () => {
    const ev = parseHookLine('[12:00:00.000 pid=1] uncapture: 剥离 2 个保护');
    expect(ev.type).toBe('uncapture');
    expect(ev.strips).toBe(2);
  });

  it('detects StopHooking and ReloadHooks', () => {
    expect(parseHookLine('[12:00:00.000 pid=1] StopHooking').type).toBe('stop');
    expect(parseHookLine('[12:00:00.000 pid=1] ReloadHooks').type).toBe('reload');
  });

  it('parses an unresolved-function failure', () => {
    const ev = parseHookLine('[12:00:00.000 pid=1] 无法解析 user32.dll!NoSuchFn');
    expect(ev.type).toBe('fail');
    expect(ev.dll).toBe('user32.dll');
    expect(ev.func).toBe('NoSuchFn');
  });
});

describe('ruleHookKey', () => {
  it('lowercases dll + func and joins with the kind', () => {
    expect(ruleHookKey('hook', 'User32.DLL', 'GetSystemMetrics')).toBe('hook|user32.dll|getsystemmetrics');
  });

  it('tolerates undefined dll/func', () => {
    expect(ruleHookKey('idle', undefined, undefined)).toBe('idle||');
  });
});
