import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, status } from '../lib/dom.js';
import { parseHookLine, ruleHookKey, lineClass } from '../lib/hookparse.js';
import { renderRules } from '../ui/rules.js';

// DLL 拦截日志的实时面板 + 解析出每个 pid 的“挂钩状态”供规则卡徽章使用。
const VIEW_CAP = 400;
let rerenderPending = false;

// 安装/卸载事件会改变 state.hookStats → 节流刷新规则卡（避免高频重绘）
function scheduleRuleRefresh() {
  if (rerenderPending) return;
  rerenderPending = true;
  setTimeout(() => {
    rerenderPending = false;
    renderRules();
  }, 350);
}

// state.hookStats[pid] = { installs:{ 'kind|dll|func': slots }, hits:{ 'kind|dll|func': n }, active, strips, ts }
function applyStat(ev) {
  if (ev.pid == null) return false;
  let s = state.hookStats[ev.pid];
  if (!s) s = state.hookStats[ev.pid] = { installs: {}, hits: {}, active: false, strips: 0, ts: ev.ts };
  s.ts = ev.ts || s.ts;
  if (ev.type === 'start' || ev.type === 'reload') {
    s.installs = {};
    s.hits = {};
    s.active = true;
    s.strips = 0;
    return true;
  }
  if (ev.type === 'rule') {
    s.installs[ruleHookKey(ev.kind, ev.dll, ev.func)] = ev.slots;
    s.active = true;
    return true;
  }
  if (ev.type === 'stat') {
    s.hits[ruleHookKey(ev.kind, ev.dll, ev.func)] = ev.hits;
    return true;
  }
  if (ev.type === 'uncapture') {
    s.strips = ev.strips;
    return true;
  }
  if (ev.type === 'stop') {
    s.active = false;
    s.installs = {};
    s.hits = {};
    return true;
  }
  return false;
}

function appendRow(ev) {
  const view = $('logViewHook');
  if (!view) return;
  const line = document.createElement('div');
  const cls = lineClass(ev);
  line.className = 'logline hookline' + (cls ? ' ' + cls : '');
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = ev.ts || '';
  const msg = document.createElement('span');
  msg.className = 'msg';
  let body = ev.body != null ? ev.body : ev.raw;
  if (ev.type === 'stat' && ev.kind === 'obs') body = `观察 ${ev.dll}!${ev.func} · 被调用 ${ev.hits} 次`;
  msg.textContent = (ev.pid != null ? `[${ev.pid}] ` : '') + body;
  line.appendChild(ts);
  line.appendChild(msg);
  view.appendChild(line);
  const panel = $('logPanel');
  if (panel) panel.scrollTop = panel.scrollHeight;
  while (view.childElementCount > VIEW_CAP) view.removeChild(view.firstChild);
}

function ingest(lines, isSeed) {
  let statsChanged = false,
    shown = 0;
  for (const raw of lines) {
    const ev = parseHookLine(raw);
    // 规则 STAT 行只更新规则卡命中数(不刷屏)；观察模式 obs 行没有规则卡，进实时面板作“全量日志”
    if (ev.type !== 'stat' || ev.kind === 'obs') {
      appendRow(ev);
      shown++;
    }
    if (applyStat(ev)) statsChanged = true;
  }
  if (!isSeed && shown && state.hookView !== 'hook') {
    state.hookUnread += shown;
    updateHookBadge();
  }
  if (statsChanged) scheduleRuleRefresh();
}

// 「拦截日志」标签上的未读小红点（不在该标签时累计新行数）
export function updateHookBadge() {
  const b = $('hookCount');
  if (!b) return;
  if (state.hookUnread > 0) {
    b.textContent = state.hookUnread > 99 ? '99+' : String(state.hookUnread);
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

// 底部日志面板的「活动日志 / 拦截日志」标签切换；点标签时若面板收着则顺手展开。
export function initLogTabs() {
  const setView = (view) => {
    state.hookView = view;
    document.querySelectorAll('.logtab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const a = $('logViewActivity'),
      h = $('logViewHook');
    if (a) a.classList.toggle('hidden', view !== 'activity');
    if (h) h.classList.toggle('hidden', view !== 'hook');
    if (view === 'hook') {
      state.hookUnread = 0;
      updateHookBadge();
    }
    const panel = $('logPanel');
    if (panel) panel.scrollTop = panel.scrollHeight;
  };
  document.querySelectorAll('.logtab').forEach((b) => {
    b.onclick = () => {
      if (!$('logPanel').classList.contains('open')) $('logToggle').click(); // 收起状态下点标签 = 展开
      setView(b.dataset.view);
    };
  });

  // 复制当前可见日志视图（活动/拦截）的全部内容到剪贴板
  const copyBtn = $('copyLog');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const h = $('logViewHook');
      const view = h && !h.classList.contains('hidden') ? h : $('logViewActivity');
      if (!view) return;
      const which = view.id === 'logViewHook' ? '拦截日志' : '活动日志';
      const lines = [...view.querySelectorAll('.logline')].map((l) => {
        const ts = (l.querySelector('.ts') || {}).textContent || '';
        const msg = (l.querySelector('.msg') || {}).textContent || '';
        return (ts ? ts + ' ' : '') + msg;
      });
      if (!lines.length) {
        status(`${which}为空，没有可复制的内容`, 'err');
        return;
      }
      const r = await api.copyText(lines.join('\r\n'));
      status(r && r.ok ? `已复制${which} ${lines.length} 行到剪贴板` : `复制失败：${(r && r.msg) || '剪贴板不可用'}`, r && r.ok ? 'ok' : 'err');
    };
  }
}

export async function initHookLog() {
  try {
    const buf = await api.readHookLog(); // 订阅时先回放最近缓冲
    if (Array.isArray(buf) && buf.length) ingest(buf, true);
  } catch {
    /* ignore */
  }
  api.onHookLog((payload) => {
    if (!payload) return;
    if (payload.reset) {
      const v = $('logViewHook');
      if (v) v.innerHTML = '';
      state.hookStats = {};
    }
    if (payload.lines && payload.lines.length) ingest(payload.lines, false);
  });
}
