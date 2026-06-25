import { state } from '../state.js';
import { $, esc, status } from '../lib/dom.js';
import { kindLabel, ruleDetail } from '../lib/format.js';
import { curTarget, renderTargets } from './targets.js';
import { openEditor } from './editor.js';
import { saveConfig } from '../features/persistence.js';

export function renderRules() {
  const list = $('ruleList');
  list.innerHTML = '';
  const t = curTarget();
  const hint = $('rulesHint');
  if (!t) {
    hint.textContent = '';
    list.innerHTML = '<div class="empty"><svg class="ico"><use href="#i-target"/></svg>选择左侧一个目标窗口</div>';
    return;
  }
  hint.textContent = `${t.process} · ${t.rules.length} 条`;
  if (!t.rules.length) {
    list.innerHTML = '<div class="empty"><svg class="ico"><use href="#i-plus"/></svg>点“添加规则”给该窗口加规则</div>';
    return;
  }
  t.rules.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'card' + (state.selRule === idx ? ' sel' : '') + (r.enabled ? '' : ' rule-off');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'rulecheck';
    cb.checked = r.enabled;
    cb.onclick = (e) => {
      e.stopPropagation();
      r.enabled = cb.checked;
      if (r.kind === 'keepalive') r._cd = r.intervalSec;
      renderRules();
      saveConfig();
    };
    const main = document.createElement('div');
    main.style.flex = '1';
    main.style.minWidth = '0';
    main.innerHTML =
      `<div class="t1"><span class="badge ${r.kind}">${kindLabel(r.kind)}</span><span class="name">${esc(r.name)}</span></div>` +
      `<div class="rule-detail">${esc(ruleDetail(r))}</div>`;
    card.appendChild(cb);
    card.appendChild(main);
    card.onclick = () => {
      state.selRule = idx;
      renderRules();
    };
    card.ondblclick = () => editRule();
    list.appendChild(card);
  });
}

export async function addRule() {
  const t = curTarget();
  if (!t) {
    status('请先选择一个目标窗口', 'err');
    return;
  }
  const r = await openEditor(null);
  if (!r) return;
  t.rules.push(r);
  state.selRule = t.rules.length - 1;
  renderTargets();
  renderRules();
  saveConfig();
  status('已添加规则：' + r.name + (r.kind !== 'keepalive' ? '（hook 规则，记得对该窗口注入/应用）' : ''));
}

export async function editRule() {
  const t = curTarget();
  if (!t || state.selRule < 0) {
    status('请先选中一条规则', 'err');
    return;
  }
  const r = await openEditor(t.rules[state.selRule]);
  if (!r) return;
  t.rules[state.selRule] = r;
  renderRules();
  saveConfig();
  status('已修改规则：' + r.name);
}

export function delRule() {
  const t = curTarget();
  if (!t || state.selRule < 0) {
    status('请先选中一条规则', 'err');
    return;
  }
  t.rules.splice(state.selRule, 1);
  state.selRule = -1;
  renderTargets();
  renderRules();
  saveConfig();
}
