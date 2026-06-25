import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, esc, status } from '../lib/dom.js';
import { avatarHtml } from '../lib/format.js';
import { addTarget, renderTargets } from './targets.js';
import { renderRules } from './rules.js';
import { rebindTargets, saveConfig } from '../features/persistence.js';

export async function refreshWindows() {
  const r = await api.listWindows(state.showAll);
  state.allWindows = Array.isArray(r) ? r : [];
  if (state.targets.length) {
    rebindTargets();
    renderTargets();
    renderRules();
    if (!state._restoring) saveConfig();
  }
  renderWindows();
  status(`已刷新，共 ${state.allWindows.length} 个窗口` + (state.showAll ? '（含隐藏 / 无标题）' : ''));
}

function matchWin(w, f) {
  f = f.toLowerCase();
  const hx = '0x' + BigInt(w.hwnd).toString(16);
  return (
    String(w.pid).includes(f) ||
    (w.process || '').toLowerCase().includes(f) ||
    (w.title || '').toLowerCase().includes(f) ||
    (w.cls || '').toLowerCase().includes(f) ||
    hx.toLowerCase().includes(f)
  );
}

export function renderWindows() {
  const f = $('filter').value.trim();
  const body = $('winBody');
  body.innerHTML = '';
  const frag = document.createDocumentFragment();
  let shown = 0;
  for (const w of state.allWindows) {
    if (f && !matchWin(w, f)) continue;
    shown++;
    const row = document.createElement('div');
    row.className = 'row' + (state.selWin === w.hwnd ? ' sel' : '');
    const hx = '0x' + BigInt(w.hwnd).toString(16).toUpperCase();
    const titleDisp = w.title && w.title.trim() ? esc(w.title) : `<span class="cls">[${esc(w.cls || '无标题')}]</span>`;
    const hiddenTag = w.visible === false ? '<span class="htag">隐藏</span>' : '';
    if (w.cls) row.title = '窗口类名: ' + w.cls;
    row.innerHTML =
      `<div class="c-pid">${w.pid}</div>` +
      `<div class="c-proc">${avatarHtml(w.process)}<span class="pname">${esc(w.process)}</span></div>` +
      `<div class="c-title grow">${titleDisp}${hiddenTag}</div><div class="c-hwnd mono">${hx}</div>`;
    row.onclick = () => {
      state.selWin = w.hwnd;
      renderWindows();
    };
    row.ondblclick = () => addTarget();
    frag.appendChild(row);
  }
  body.appendChild(frag);
  $('winCount').textContent = shown;
}
