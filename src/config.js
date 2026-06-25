import fs from 'fs';

// hook 规则 -> spec: call=1;a0=..;a2=..;ret=..   (idle 无 spec)
function buildSpec(r) {
  if (r.kind !== 'hook') return '';
  const parts = ['call=' + (r.callOriginal ? '1' : '0')];
  for (let i = 0; i < 4; i++) if (r.args && r.args[i] != null) parts.push('a' + i + '=' + r.args[i]);
  if (r.retOverride != null) parts.push('ret=' + r.retOverride);
  return parts.join(';');
}

// 只把 hook 规则(idle/hook)写给 DLL，并按目标窗口的 PID 标注；保活规则是 GUI 行为不写入。
// opts.logAll=true 时追加一行全局开关，DLL 会对常用 API 装观察钩子并打全量日志。
function save(cfgPath, targets, opts) {
  let s = '# 拦截规则配置(Electron 自动生成)  格式: pid|kind|enabled|dll|func|spec|name\r\n';
  s += '# kind: idle=空闲归零  hook=通用拦截(改入参/改返回/完全mock)  logall=全量API透传日志 ; pid=0 表示全局\r\n';
  if (opts && opts.logAll) s += '0|logall|1|||\r\n';
  for (const t of targets) {
    for (const r of t.rules) {
      if (r.kind !== 'idle' && r.kind !== 'hook' && r.kind !== 'fg' && r.kind !== 'uncapture') continue;
      const name = String(r.name || '').replace(/[|\r\n]/g, ' ');
      s += `${t.pid}|${r.kind}|${r.enabled ? 1 : 0}|${r.dll || ''}|${r.func || ''}|${buildSpec(r)}|${name}\r\n`;
    }
  }
  fs.writeFileSync(cfgPath, s, 'utf8'); // Node utf8 = 无 BOM
}

export { save, buildSpec };
