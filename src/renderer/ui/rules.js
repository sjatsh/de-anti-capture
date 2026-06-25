import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, esc, status } from '../lib/dom.js';
import { kindLabel, ruleDetail } from '../lib/format.js';
import { ruleHookKey } from '../lib/hookparse.js';
import { curTarget, renderTargets } from './targets.js';
import { openEditor } from './editor.js';
import { saveConfig } from '../features/persistence.js';

// 清掉某目标下所有规则的验证结果（增删改规则会让 idx 错位，直接清空该目标的）
function clearVerify(uid) {
  for (const k of Object.keys(state.verifyResults)) if (k.startsWith(uid + ':')) delete state.verifyResults[k];
}

// 一键验证：起探针注入这一条规则，对比注入前后观测值，结果存到 state.verifyResults 并刷新卡片。
async function doVerify(t, idx, r) {
  const key = t.uid + ':' + idx;
  state.verifyResults[key] = { cls: 'run', text: '验证中…（起探针 → 注入该规则 → 对比注入前后）' };
  renderRules();
  status(`验证「${r.name}」中…`);
  let res;
  try {
    res = await api.verifyRule(r);
  } catch (e) {
    res = { ok: false, msg: (e && e.message) || String(e) };
  }
  if (!res || !res.ok) {
    state.verifyResults[key] = { cls: 'fail', text: '验证失败：' + ((res && res.msg) || '未知错误') };
    status('验证失败：' + ((res && res.msg) || ''), 'err');
  } else {
    const mark = res.pass === true ? '✓ 通过' : res.pass === false ? '✗ 未生效' : '○ 不确定';
    const cls = res.pass === true ? 'pass' : res.pass === false ? 'fail' : 'neutral';
    const ba = res.before !== '-' || res.after !== '-' ? ` （注入前 ${res.before} → 注入后 ${res.after}）` : '';
    state.verifyResults[key] = { cls, text: `${mark} · ${res.detail}${ba}` };
    status(`验证「${r.name}」：${mark} — ${res.detail}`, res.pass === false ? 'err' : 'ok');
  }
  renderRules();
}

// 规则卡“挂钩状态”徽章：来自实时解析的拦截日志（features/hooklog.js 写入 state.hookStats）。
// 已挂 N 处 = 该进程内 N 个模块的导入表被打了钩；0 处 = 已注入但没命中(IAT 盲区/名字不符)。
function hookBadge(t, r) {
  if (!t || r.kind === 'keepalive') return '';
  const s = state.hookStats[t.pid];
  if (!s || !s.active) return '';
  const key = ruleHookKey(r.kind, r.dll, r.func);
  const slots = s.installs[key];
  if (slots == null) return ''; // 已注入但这条没有安装记录（可能还没点“应用规则”）
  if (slots <= 0)
    return `<span class="hookstat off" title="已注入但 0 处命中：目标没在导入表里静态调用此函数(IAT 盲区)，或 DLL/函数名不符">✗ 0 处</span>`;
  const hits = (s.hits && s.hits[key]) || 0;
  const hitTxt = hits > 0 ? ` · 命中 ${hits > 99999 ? Math.floor(hits / 1000) + 'k' : hits}` : '';
  const title = hits > 0 ? `已在 ${slots} 个模块挂钩；被调用 ${hits} 次（实时计数）` : `已在 ${slots} 个模块的导入表挂上此钩子，尚未被调用`;
  return `<span class="hookstat on" title="${title}">✓ 已挂 ${slots}${hitTxt}</span>`;
}

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
    const vr = state.verifyResults[t.uid + ':' + idx];
    const vrHtml = vr ? `<div class="verify-result ${vr.cls}">${esc(vr.text)}</div>` : '';
    main.innerHTML =
      `<div class="t1"><span class="badge ${r.kind}">${kindLabel(r.kind)}</span><span class="name">${esc(r.name)}</span>${hookBadge(t, r)}</div>` +
      `<div class="rule-detail">${esc(ruleDetail(r))}</div>` +
      vrHtml;
    const vbtn = document.createElement('button');
    vbtn.className = 'rule-verify';
    vbtn.title = '验证：起探针、只注入这一条规则，对比注入前后观测值，判定是否真的生效';
    vbtn.innerHTML = '<svg class="ico"><use href="#i-shield"/></svg>';
    vbtn.onclick = (e) => {
      e.stopPropagation();
      doVerify(t, idx, r);
    };
    card.appendChild(cb);
    card.appendChild(main);
    card.appendChild(vbtn);
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
  clearVerify(t.uid);
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
  clearVerify(t.uid);
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
  clearVerify(t.uid);
  state.selRule = -1;
  renderTargets();
  renderRules();
  saveConfig();
}
