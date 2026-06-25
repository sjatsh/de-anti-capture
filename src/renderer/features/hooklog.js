import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
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

// state.hookStats[pid] = { installs:{ 'kind|dll|func': slots }, active, strips, ts }
function applyStat(ev) {
  if (ev.pid == null) return false;
  let s = state.hookStats[ev.pid];
  if (!s) s = state.hookStats[ev.pid] = { installs: {}, active: false, strips: 0, ts: ev.ts };
  s.ts = ev.ts || s.ts;
  if (ev.type === 'start' || ev.type === 'reload') {
    s.installs = {};
    s.active = true;
    s.strips = 0;
    return true;
  }
  if (ev.type === 'rule') {
    s.installs[ruleHookKey(ev.kind, ev.dll, ev.func)] = ev.slots;
    s.active = true;
    return true;
  }
  if (ev.type === 'uncapture') {
    s.strips = ev.strips;
    return true;
  }
  if (ev.type === 'stop') {
    s.active = false;
    s.installs = {};
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
  msg.textContent = (ev.pid != null ? `[${ev.pid}] ` : '') + (ev.body != null ? ev.body : ev.raw);
  line.appendChild(ts);
  line.appendChild(msg);
  view.appendChild(line);
  const panel = $('logPanel');
  if (panel) panel.scrollTop = panel.scrollHeight;
  while (view.childElementCount > VIEW_CAP) view.removeChild(view.firstChild);
}

function ingest(lines, isSeed) {
  let statsChanged = false,
    n = 0;
  for (const raw of lines) {
    const ev = parseHookLine(raw);
    appendRow(ev);
    if (applyStat(ev)) statsChanged = true;
    n++;
  }
  if (!isSeed && n && state.hookView !== 'hook') {
    state.hookUnread += n;
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
