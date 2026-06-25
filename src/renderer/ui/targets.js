import { state, newUid } from '../state.js';
import { $, esc, status } from '../lib/dom.js';
import { avatarHtml } from '../lib/format.js';
import { renderRules } from './rules.js';
import { saveConfig } from '../features/persistence.js';

export function curTarget() {
  return state.targets.find((t) => t.uid === state.selTarget);
}

export function addTarget() {
  const w = state.allWindows.find((x) => x.hwnd === state.selWin);
  if (!w) {
    status('请先在上方窗口列表选择一个窗口', 'err');
    return;
  }
  const exist = state.targets.find((t) => !t.offline && t.hwnd === w.hwnd);
  if (exist) {
    state.selTarget = exist.uid;
    renderTargets();
    renderRules();
    return;
  }
  const dispTitle = w.title && w.title.trim() ? w.title : '[' + (w.cls || '无标题') + ']';
  const t = { uid: newUid(), hwnd: w.hwnd, pid: w.pid, title: dispTitle, process: w.process, offline: false, rules: [] };
  t.rules.push({
    kind: 'keepalive',
    enabled: true,
    intervalSec: 30,
    name: '保活 每30秒',
    args: [null, null, null, null],
    callOriginal: true,
    retOverride: null,
    _cd: 30,
  });
  state.targets.push(t);
  state.selTarget = t.uid;
  state.selRule = -1;
  renderTargets();
  renderRules();
  saveConfig();
  status(`已加入目标：${w.process} — ${w.title}`);
}

export function delTarget() {
  if (!state.selTarget) {
    status('请先选择一个目标窗口', 'err');
    return;
  }
  state.targets = state.targets.filter((t) => t.uid !== state.selTarget);
  state.selTarget = state.targets.length ? state.targets[0].uid : null;
  state.selRule = -1;
  renderTargets();
  renderRules();
  saveConfig();
}

export function renderTargets() {
  const list = $('targetList');
  list.innerHTML = '';
  $('targetCount').textContent = state.targets.length;
  if (!state.targets.length) {
    list.innerHTML = '<div class="empty"><svg class="ico"><use href="#i-target"/></svg>从上方“加入目标”开始</div>';
    return;
  }
  for (const t of state.targets) {
    const card = document.createElement('div');
    card.className = 'card' + (state.selTarget === t.uid ? ' sel' : '') + (t.offline ? ' offline' : '');
    const offBadge = t.offline ? '<span class="htag off">离线</span>' : '';
    card.innerHTML =
      avatarHtml(t.process, 'lg') +
      `<div class="meta">` +
      `<div class="t1"><span class="name">${esc(t.process)}</span>${offBadge}<span class="pill count">${t.rules.length} 规则</span></div>` +
      `<div class="sub">${esc(t.title)} · ${t.offline ? '未运行' : 'PID ' + t.pid}</div>` +
      `</div>`;
    card.onclick = () => {
      state.selTarget = t.uid;
      state.selRule = -1;
      renderTargets();
      renderRules();
    };
    list.appendChild(card);
  }
}
