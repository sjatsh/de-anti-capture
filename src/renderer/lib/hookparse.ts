import type { HookEvent } from '@shared/types';

const PREFIX = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+pid=(\d+)\]\s*(.*)$/;
const RULE = /^rule\[(\w+)\]\s+(\S+)!(\S+)\s+call=(\d)\s+ret=(\d)\s+->\s+(\d+)\s+slot/;

export function parseHookLine(line: string): HookEvent {
  const m = PREFIX.exec(line);
  if (!m) return { type: 'raw', pid: null, ts: null, body: line, raw: line };
  const ts = m[1], pid = parseInt(m[2], 10), body = m[3];
  const ev: HookEvent = { type: 'log', pid, ts, body, raw: line };
  let r: RegExpExecArray | null;
  if (/^=== StartHooking/.test(body)) ev.type = 'start';
  else if ((r = RULE.exec(body))) {
    ev.type = 'rule';
    ev.kind = r[1];
    ev.dll = r[2];
    ev.func = r[3];
    ev.call = r[4] === '1';
    ev.ret = r[5] === '1';
    ev.slots = parseInt(r[6], 10);
  } else if ((r = /^InstallFromConfig done:\s+(\d+)\s+slot/.exec(body))) {
    ev.type = 'done';
    ev.slots = parseInt(r[1], 10);
  } else if ((r = /^STAT kind=(\w+) dll=(\S+) func=(\S+) hits=(\d+)/.exec(body))) {
    ev.type = 'stat';
    ev.kind = r[1];
    ev.dll = r[2] === '-' ? '' : r[2];
    ev.func = r[3] === '-' ? '' : r[3];
    ev.hits = parseInt(r[4], 10);
  } else if ((r = /^uncapture:.*?(\d+)\s*个/.exec(body))) {
    ev.type = 'uncapture';
    ev.strips = parseInt(r[1], 10);
  } else if (/^StopHooking/.test(body)) ev.type = 'stop';
  else if (/^ReloadHooks/.test(body)) ev.type = 'reload';
  else if ((r = /无法解析\s+(\S+)!(\S+)/.exec(body))) {
    ev.type = 'fail';
    ev.dll = r[1];
    ev.func = r[2];
  }
  return ev;
}

export function ruleHookKey(kind: string, dll: string | undefined, func: string | undefined): string {
  return `${kind}|${(dll || '').toLowerCase()}|${(func || '').toLowerCase()}`;
}
