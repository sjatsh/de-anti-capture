import { esc } from './dom.js';

// 规则卡片详情展示（如 入参[0=0x2B]）
export function fmtArgs(args) {
  const p = [];
  for (let i = 0; i < 4; i++) if (args && args[i] != null) p.push(i + '=' + args[i]);
  return p.join(',');
}

export function ruleDetail(r) {
  if (r.kind === 'keepalive') return `每 ${r.intervalSec} 秒发随机鼠标移动`;
  if (r.kind === 'idle') return `${r.dll}!${r.func}  空闲→0`;
  if (r.kind === 'fg') return `GetForegroundWindow 伪装成自身窗口（云电脑防掉线）`;
  if (r.kind === 'uncapture') return `主动剥离截屏保护 + 强制 affinity=NONE（防截屏置黑）`;
  let parts = [`${r.dll}!${r.func}`],
    any = false;
  const a = fmtArgs(r.args);
  if (a) {
    parts.push('入参[' + a + ']');
    any = true;
  }
  if (!r.callOriginal) {
    parts.push('不调原函数');
    any = true;
  }
  if (r.retOverride != null) {
    parts.push('返回 ' + r.retOverride);
    any = true;
  }
  if (!any) parts.push('透传(未设拦截)');
  return parts.join('  ·  ');
}

export function kindLabel(k) {
  return k === 'keepalive' ? '保活' : k === 'idle' ? 'idle' : k === 'fg' ? '前台伪装' : k === 'uncapture' ? '防截屏' : 'hook';
}

// ---- 进程头像（按名字哈希取柔和色调）----
const AV_COLORS = ['#7c8dff', '#38e0c0', '#ffc26b', '#ff6f7d', '#b98cff', '#46d3f0', '#f08bd0', '#7ad17a', '#ff9f6b', '#6bc6ff'];
function avatarColor(name) {
  let h = 0;
  const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
export function avatarHtml(name, cls) {
  const c = avatarColor(name);
  const ch = esc((name || '?').trim().charAt(0) || '?');
  return `<span class="avatar ${cls || ''}" style="background:${c}26;color:${c}">${ch}</span>`;
}
