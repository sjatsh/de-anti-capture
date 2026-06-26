import type { CSSProperties } from 'react';
import type { Rule } from '@shared/types';

function fmtArgs(args: Rule['args']): string {
  const p: string[] = [];
  for (let i = 0; i < 4; i++) if (args[i] != null) p.push(i + '=' + args[i]);
  return p.join(',');
}

export function ruleDetail(r: Rule): string {
  if (r.kind === 'keepalive') return `每 ${r.intervalSec} 秒发随机鼠标移动`;
  if (r.kind === 'idle') return `${r.dll}!${r.func}  空闲→0`;
  if (r.kind === 'fg') return `GetForegroundWindow 伪装成自身窗口（云电脑防掉线）`;
  if (r.kind === 'cursor') return `GetCursorPos 空闲时叠加净零微抖（后台保活，不动真实光标）`;
  if (r.kind === 'uncapture') return `主动剥离截屏保护 + 强制 affinity=NONE（防截屏置黑）`;
  const parts = [`${r.dll}!${r.func}`];
  let any = false;
  const a = fmtArgs(r.args);
  if (a) { parts.push('入参[' + a + ']'); any = true; }
  if (!r.callOriginal) { parts.push('不调原函数'); any = true; }
  if (r.retOverride != null) { parts.push('返回 ' + r.retOverride); any = true; }
  if (!any) parts.push('透传(未设拦截)');
  return parts.join('  ·  ');
}

export function kindLabel(k: Rule['kind']): string {
  return k === 'keepalive' ? '保活' : k === 'idle' ? 'idle' : k === 'fg' ? '前台伪装' : k === 'cursor' ? '光标伪动' : k === 'uncapture' ? '防截屏' : 'hook';
}

const AV_COLORS = ['#7c8dff','#38e0c0','#ffc26b','#ff6f7d','#b98cff','#46d3f0','#f08bd0','#7ad17a','#ff9f6b','#6bc6ff'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export function avatarStyle(name: string): CSSProperties {
  const c = avatarColor(name);
  return { background: c + '26', color: c };
}

export function avatarChar(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}
