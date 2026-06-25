// 把一行 DLL 拦截日志解析成结构化事件。安装期事件(start/rule/stop/reload)用于规则卡“挂钩状态”徽章；
// 其余作为普通行进实时面板。日志前缀格式： [HH:MM:SS.mmm pid=N] <body>
const PREFIX = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+pid=(\d+)\]\s*(.*)$/;
const RULE = /^rule\[(\w+)\]\s+(\S+)!(\S+)\s+call=(\d)\s+ret=(\d)\s+->\s+(\d+)\s+slot/;

export function parseHookLine(line) {
  const m = PREFIX.exec(line);
  if (!m) return { type: 'raw', pid: null, ts: null, body: line, raw: line };
  const ts = m[1],
    pid = parseInt(m[2], 10),
    body = m[3];
  const ev = { type: 'log', pid, ts, body, raw: line };
  let r;
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

// 规则 → 用于匹配安装记录的键（kind|dll|func，全小写）。与 DLL 日志里 rule[kind] dll!func 对齐。
export function ruleHookKey(kind, dll, func) {
  return `${kind}|${(dll || '').toLowerCase()}|${(func || '').toLowerCase()}`;
}

// 行的视觉分级：ok=已挂上 / err=0处或失败 / info=生命周期事件 / 其它普通
export function lineClass(ev) {
  if (ev.type === 'rule') return ev.slots > 0 ? 'ok' : 'err';
  if (ev.type === 'fail') return 'err';
  if (ev.type === 'start' || ev.type === 'reload' || ev.type === 'done') return 'info';
  if (ev.type === 'stop') return 'warn';
  if (ev.type === 'uncapture') return 'ok';
  return '';
}
