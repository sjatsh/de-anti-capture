'use strict';
(() => {
const $ = (id) => document.getElementById(id);
const api = window.api;

// dllPath 永远指向内置（随程序打包）的拦截 DLL，由主进程 resolveDll() 解析，界面不暴露任何路径设置。
const state = { allWindows: [], targets: [], selWin: null, selTarget: null, selRule: -1, dllPath: '', showAll: false, logAll: false, funcs: [], _restoring: false };
let _uid = 0;
const newUid = () => 'u' + (++_uid);

// ---------------- helpers ----------------
const VAL_RE = /^(0x[0-9a-fA-F]+|\d+)$/;
function validVal(s) { return VAL_RE.test(String(s).trim()); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtArgs(args) {   // 用于规则卡片详情展示（如 入参[0=0x2B]）
  const p = [];
  for (let i = 0; i < 4; i++) if (args && args[i] != null) p.push(i + '=' + args[i]);
  return p.join(',');
}
function ruleDetail(r) {
  if (r.kind === 'keepalive') return `每 ${r.intervalSec} 秒发随机鼠标移动`;
  if (r.kind === 'idle') return `${r.dll}!${r.func}  空闲→0`;
  if (r.kind === 'fg') return `GetForegroundWindow 伪装成自身窗口（云电脑防掉线）`;
  if (r.kind === 'uncapture') return `主动剥离截屏保护 + 强制 affinity=NONE（防截屏置黑）`;
  let parts = [`${r.dll}!${r.func}`], any = false;
  const a = fmtArgs(r.args); if (a) { parts.push('入参[' + a + ']'); any = true; }
  if (!r.callOriginal) { parts.push('不调原函数'); any = true; }
  if (r.retOverride != null) { parts.push('返回 ' + r.retOverride); any = true; }
  if (!any) parts.push('透传(未设拦截)');
  return parts.join('  ·  ');
}
function kindLabel(k) { return k === 'keepalive' ? '保活' : k === 'idle' ? 'idle' : k === 'fg' ? '前台伪装' : k === 'uncapture' ? '防截屏' : 'hook'; }

// ---- 进程头像（按名字哈希取柔和色调）----
const AV_COLORS = ['#7c8dff', '#38e0c0', '#ffc26b', '#ff6f7d', '#b98cff', '#46d3f0', '#f08bd0', '#7ad17a', '#ff9f6b', '#6bc6ff'];
function avatarColor(name) {
  let h = 0; const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function avatarHtml(name, cls) {
  const c = avatarColor(name);
  const ch = esc((name || '?').trim().charAt(0) || '?');
  return `<span class="avatar ${cls || ''}" style="background:${c}26;color:${c}">${ch}</span>`;
}

// ---- 状态 + 活动日志（status 行 + 历史面板）----
function nowTime() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function status(msg, cls) {
  const s = $('status'); s.textContent = msg; s.className = 'status' + (cls ? ' ' + cls : '');
  const panel = $('logPanel');
  const line = document.createElement('div');
  line.className = 'logline' + (cls ? ' ' + cls : '');
  line.innerHTML = `<span class="ts"></span><span class="msg"></span>`;
  line.querySelector('.ts').textContent = nowTime();
  line.querySelector('.msg').textContent = msg;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
  while (panel.childElementCount > 250) panel.removeChild(panel.firstChild);
}

// ---------------- window list ----------------
async function refreshWindows() {
  const r = await api.listWindows(state.showAll);
  state.allWindows = Array.isArray(r) ? r : [];
  if (state.targets.length) { rebindTargets(); renderTargets(); renderRules(); if (!state._restoring) saveConfig(); }
  renderWindows();
  status(`已刷新，共 ${state.allWindows.length} 个窗口` + (state.showAll ? '（含隐藏 / 无标题）' : ''));
}
function matchWin(w, f) {
  f = f.toLowerCase();
  const hx = '0x' + BigInt(w.hwnd).toString(16);
  return String(w.pid).includes(f) || (w.process || '').toLowerCase().includes(f) ||
    (w.title || '').toLowerCase().includes(f) || (w.cls || '').toLowerCase().includes(f) ||
    hx.toLowerCase().includes(f);
}
function renderWindows() {
  const f = $('filter').value.trim();
  const body = $('winBody'); body.innerHTML = '';
  const frag = document.createDocumentFragment();
  let shown = 0;
  for (const w of state.allWindows) {
    if (f && !matchWin(w, f)) continue;
    shown++;
    const row = document.createElement('div');
    row.className = 'row' + (state.selWin === w.hwnd ? ' sel' : '');
    const hx = '0x' + BigInt(w.hwnd).toString(16).toUpperCase();
    const titleDisp = (w.title && w.title.trim()) ? esc(w.title) : `<span class="cls">[${esc(w.cls || '无标题')}]</span>`;
    const hiddenTag = (w.visible === false) ? '<span class="htag">隐藏</span>' : '';
    if (w.cls) row.title = '窗口类名: ' + w.cls;
    row.innerHTML =
      `<div class="c-pid">${w.pid}</div>` +
      `<div class="c-proc">${avatarHtml(w.process)}<span class="pname">${esc(w.process)}</span></div>` +
      `<div class="c-title grow">${titleDisp}${hiddenTag}</div><div class="c-hwnd mono">${hx}</div>`;
    row.onclick = () => { state.selWin = w.hwnd; renderWindows(); };
    row.ondblclick = () => addTarget();
    frag.appendChild(row);
  }
  body.appendChild(frag);
  $('winCount').textContent = shown;
}


// ---------------- targets ----------------
function addTarget() {
  const w = state.allWindows.find((x) => x.hwnd === state.selWin);
  if (!w) { status('请先在上方窗口列表选择一个窗口', 'err'); return; }
  const exist = state.targets.find((t) => !t.offline && t.hwnd === w.hwnd);
  if (exist) { state.selTarget = exist.uid; renderTargets(); renderRules(); return; }
  const dispTitle = (w.title && w.title.trim()) ? w.title : ('[' + (w.cls || '无标题') + ']');
  const t = { uid: newUid(), hwnd: w.hwnd, pid: w.pid, title: dispTitle, process: w.process, offline: false, rules: [] };
  t.rules.push({ kind: 'keepalive', enabled: true, intervalSec: 30, name: '保活 每30秒', args: [null, null, null, null], callOriginal: true, retOverride: null, _cd: 30 });
  state.targets.push(t);
  state.selTarget = t.uid; state.selRule = -1;
  renderTargets(); renderRules();
  saveConfig();
  status(`已加入目标：${w.process} — ${w.title}`);
}
function delTarget() {
  if (!state.selTarget) { status('请先选择一个目标窗口', 'err'); return; }
  state.targets = state.targets.filter((t) => t.uid !== state.selTarget);
  state.selTarget = state.targets.length ? state.targets[0].uid : null; state.selRule = -1;
  renderTargets(); renderRules(); saveConfig();
}
function renderTargets() {
  const list = $('targetList'); list.innerHTML = '';
  $('targetCount').textContent = state.targets.length;
  if (!state.targets.length) {
    list.innerHTML = '<div class="empty"><svg class="ico"><use href="#i-target"/></svg>从上方“加入目标”开始</div>';
    return;
  }
  for (const t of state.targets) {
    const card = document.createElement('div');
    card.className = 'card' + (state.selTarget === t.uid ? ' sel' : '') + (t.offline ? ' offline' : '');
    const offBadge = t.offline ? '<span class="htag off">离线</span>' : '';
    card.innerHTML = avatarHtml(t.process, 'lg') +
      `<div class="meta">` +
        `<div class="t1"><span class="name">${esc(t.process)}</span>${offBadge}<span class="pill count">${t.rules.length} 规则</span></div>` +
        `<div class="sub">${esc(t.title)} · ${t.offline ? '未运行' : 'PID ' + t.pid}</div>` +
      `</div>`;
    card.onclick = () => { state.selTarget = t.uid; state.selRule = -1; renderTargets(); renderRules(); };
    list.appendChild(card);
  }
}

// ---------------- rules ----------------
function curTarget() { return state.targets.find((t) => t.uid === state.selTarget); }
function renderRules() {
  const list = $('ruleList'); list.innerHTML = '';
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
    cb.type = 'checkbox'; cb.className = 'rulecheck'; cb.checked = r.enabled;
    cb.onclick = (e) => { e.stopPropagation(); r.enabled = cb.checked; if (r.kind === 'keepalive') r._cd = r.intervalSec; renderRules(); saveConfig(); };
    const main = document.createElement('div'); main.style.flex = '1'; main.style.minWidth = '0';
    main.innerHTML = `<div class="t1"><span class="badge ${r.kind}">${kindLabel(r.kind)}</span><span class="name">${esc(r.name)}</span></div>` +
      `<div class="rule-detail">${esc(ruleDetail(r))}</div>`;
    card.appendChild(cb); card.appendChild(main);
    card.onclick = () => { state.selRule = idx; renderRules(); };
    card.ondblclick = () => editRule();
    list.appendChild(card);
  });
}

async function addRule() {
  const t = curTarget(); if (!t) { status('请先选择一个目标窗口', 'err'); return; }
  const r = await openEditor(null);
  if (!r) return;
  t.rules.push(r); state.selRule = t.rules.length - 1;
  renderTargets(); renderRules(); saveConfig();
  status('已添加规则：' + r.name + (r.kind !== 'keepalive' ? '（hook 规则，记得对该窗口注入/应用）' : ''));
}
async function editRule() {
  const t = curTarget(); if (!t || state.selRule < 0) { status('请先选中一条规则', 'err'); return; }
  const r = await openEditor(t.rules[state.selRule]);
  if (!r) return;
  t.rules[state.selRule] = r;
  renderRules(); saveConfig(); status('已修改规则：' + r.name);
}
function delRule() {
  const t = curTarget(); if (!t || state.selRule < 0) { status('请先选中一条规则', 'err'); return; }
  t.rules.splice(state.selRule, 1); state.selRule = -1;
  renderTargets(); renderRules(); saveConfig();
}

// ---------------- modal editor ----------------
let modalResolve = null;
const KIND_DESC = {
  keepalive: '定时向该窗口投递随机坐标的鼠标移动消息，让程序自己不进入空闲（不动你真实光标）。无需注入。',
  idle: '把某 API 当作 GetLastInputInfo 处理，让系统空闲时间归零。需要先对该窗口注入 DLL。',
  fg: '把 GetForegroundWindow 伪装成“返回本进程自己的主窗口”，让无影云 stream_viewer 以为自己一直在前台，从而持续把你本地输入转发到远端、不空闲掉线。零闪屏。需注入该进程(选 stream_viewer)。副作用：开启后本地输入会被转发进远端会话。',
  uncapture: '防截屏置黑：装上时主动对本进程窗口调 SetWindowDisplayAffinity(NONE) 撕掉已有的“截屏排除”保护，并 hook 住防止重设。对“窗口创建时设一次保护、之后不再调用”的程序(如无影云)有效。需注入该进程(选 stream_viewer)。',
  hook: '通用拦截：可改入参、改返回值、或完全不调用原函数返回 mock 值。什么都不设=透传。需要注入。'
};
// 内置 Win32 API 签名库（apidb.js 提供 window.API_DB）：选中函数后显示原型/作用、
// 给入参逐项标「参数名 + 类型」、给返回值输入框按返回类型动态提示。
const API_DB = window.API_DB || {};
const ARG_REGS = ['RCX', 'RDX', 'R8', 'R9'];
// 查签名：先按原名小写，再去掉尾部 A/W 变体后缀。
function funcSig(fn) {
  if (!fn) return null;
  const k = fn.toLowerCase();
  return API_DB[k] || API_DB[k.replace(/[aw]$/, '')] || null;
}
// 用用户输入的真实函数名 + 库里的类型，拼出 C 原型串
function protoText(fn, e) {
  let ps = e.p.length ? e.p.map((p) => `${p[1]} ${p[0]}`).join(', ') : 'void';
  if (e.n && e.n > e.p.length) ps += `, …+${e.n - e.p.length}`;   // 真实参数更多（栈上），标注省略数
  return `${e.r} ${fn}(${ps})`;
}
// 选中函数 → 原型/作用提示 + 返回值占位 + 重渲染入参行
function applyFuncHints() {
  const kind = $('r_kind').value;
  const sigEl = $('funcSig'), retEl = $('r_retval');
  const fn = $('r_func').value.trim();
  const e = funcSig(fn);
  if (e && kind !== 'keepalive') {
    sigEl.innerHTML = '';
    const proto = document.createElement('div'); proto.className = 'sig-proto'; proto.textContent = protoText(fn, e);
    const desc = document.createElement('div'); desc.className = 'sig-desc'; desc.textContent = `${e.dll}.dll · ${e.d}`;
    sigEl.appendChild(proto); sigEl.appendChild(desc);
    sigEl.classList.remove('hide');
  } else {
    sigEl.innerHTML = ''; sigEl.classList.add('hide');
  }
  retEl.placeholder = (e && e.rd) ? e.rd : '0 / 1 / 0x1';
  renderArgsRows();
}
// 入参覆盖：按所选函数真实参数逐项渲染（参数名 + 类型）。
// 已知签名 → 真实参数(最多前 4 个寄存器参数)；未知 → 4 个通用寄存器槽并诚实标注；无参 → 提示无需填。
function renderArgsRows(prefill) {
  const cont = $('argsRows');
  const cur = prefill || readArgsRows();        // 不给 prefill 时保留当前已输入的值
  const e = funcSig($('r_func').value.trim());
  cont.innerHTML = '';
  if (e && e.p.length === 0) { cont.innerHTML = '<div class="args-none">该函数无参数，无需改入参</div>'; return; }
  let rows;
  if (e && e.p.length) {
    rows = e.p.slice(0, 4).map((p, i) => ({ name: p[0], type: p[1], desc: p[2] || '', reg: ARG_REGS[i] }));
  } else {
    rows = ARG_REGS.map((r, i) => ({ name: 'arg' + i, type: 'INT64', desc: '未收录签名，按 x64 调用约定第 ' + (i + 1) + ' 个参数', reg: r }));
  }
  const frag = document.createDocumentFragment();
  rows.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'arg-row';
    const meta = document.createElement('div'); meta.className = 'arg-meta';
    const nm = document.createElement('span'); nm.className = 'arg-name'; nm.textContent = p.name; nm.title = p.desc || p.name;
    const ty = document.createElement('span'); ty.className = 'arg-type'; ty.textContent = p.type; ty.title = p.reg + (p.desc ? ' · ' + p.desc : '');
    meta.appendChild(nm); meta.appendChild(ty);
    const inp = document.createElement('input');
    inp.className = 'arg-in'; inp.dataset.idx = i; inp.dataset.name = p.name;
    inp.value = (cur && cur[i] != null) ? cur[i] : '';
    inp.placeholder = '留空 = 不改'; inp.autocomplete = 'off';
    if (p.desc) inp.title = p.desc;
    row.appendChild(meta); row.appendChild(inp); frag.appendChild(row);
  });
  cont.appendChild(frag);
  const total = e ? (e.n || e.p.length) : 0;
  if (total > 4) {
    const note = document.createElement('div'); note.className = 'args-note';
    note.textContent = `该函数共 ${total} 个参数；第 5 个起在栈上，当前仅支持覆盖前 4 个（寄存器）参数。`;
    cont.appendChild(note);
  }
}
function readArgsRows() {
  const a = [null, null, null, null];
  $('argsRows').querySelectorAll('.arg-in').forEach((inp) => { const v = inp.value.trim(); if (v) a[+inp.dataset.idx] = v; });
  return a;
}
function collectArgs() {
  const args = [null, null, null, null];
  for (const inp of $('argsRows').querySelectorAll('.arg-in')) {
    const v = inp.value.trim(); if (!v) continue;
    if (!validVal(v)) return { error: `入参「${inp.dataset.name}」格式不对（十进制或 0x 十六进制）: ${v}` };
    args[+inp.dataset.idx] = v;
  }
  return { args };
}
// 返回值输入框：未勾「拦截返回」时禁用（视觉上更清晰）
function syncRetEnable() { $('r_retval').disabled = !$('r_reten').checked; }

function setKind(k) {
  $('r_kind').value = k;
  document.querySelectorAll('#r_kind_seg .seg').forEach((b) => b.classList.toggle('active', b.dataset.kind === k));
  $('kindDesc').textContent = KIND_DESC[k] || '';
  updateKindUI();
}
function updateKindUI() {
  const k = $('r_kind').value;
  document.querySelectorAll('.row-ka').forEach((e) => e.classList.toggle('hide', k !== 'keepalive'));
  document.querySelectorAll('.row-hd').forEach((e) => e.classList.toggle('hide', k === 'keepalive'));
  document.querySelectorAll('.row-hook').forEach((e) => e.classList.toggle('hide', k !== 'hook'));
  if (k === 'idle' && !$('r_func').value.trim()) { $('r_dll').value = 'user32.dll'; $('r_func').value = 'GetLastInputInfo'; }
  if (k === 'fg') { $('r_dll').value = 'user32.dll'; $('r_func').value = 'GetForegroundWindow'; }   // 固定靶点
  if (k === 'uncapture') { $('r_dll').value = 'user32.dll'; $('r_func').value = 'SetWindowDisplayAffinity'; }
  if (k !== 'keepalive') loadFuncs($('r_dll').value);
  applyFuncHints();
  syncRetEnable();
}
async function loadFuncs(dll) {
  const names = await api.getExports(dll);
  if (!Array.isArray(names)) { status('无法读取 ' + dll + ' 的导出函数', 'err'); state.funcs = []; return; }
  state.funcs = names;
  if (document.activeElement === $('r_func')) $('r_func').dispatchEvent(new Event('input'));  // 正在选时刷新下拉
}

// —— 自定义下拉（combobox）：替代原生 datalist，支持过滤 / ↑↓ 选择 / 回车确认 / 点击选择 ——
const KNOWN_DLLS = ['user32.dll', 'kernel32.dll', 'ntdll.dll', 'advapi32.dll', 'gdi32.dll', 'winmm.dll', 'ws2_32.dll', 'wininet.dll', 'ole32.dll', 'shell32.dll'];
function dllItems(q) {
  const ql = q.toLowerCase();
  return KNOWN_DLLS.filter((n) => n.toLowerCase().includes(ql)).map((n) => ({ value: n }));
}
function funcItems(q) {
  const all = state.funcs || [];
  const ql = q.toLowerCase();
  let m = ql ? all.filter((n) => n.toLowerCase().includes(ql)) : all.slice();
  // 排序：前缀匹配优先 → 已收录(有签名)优先 → 名字短优先。让带 ƒ 的常用函数浮到前面。
  m.sort((a, b) => {
    const ap = a.toLowerCase().startsWith(ql) ? 0 : 1, bp = b.toLowerCase().startsWith(ql) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ak = funcSig(a) ? 0 : 1, bk = funcSig(b) ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.length - b.length || a.localeCompare(b);
  });
  const CAP = 80, more = Math.max(0, m.length - CAP);
  const list = m.slice(0, CAP).map((n) => {
    const e = funcSig(n);
    return { value: n, known: !!e, hint: e ? `${e.r} · ${(e.n || e.p.length)}参` : '' };
  });
  list._more = more;
  return list;
}
// 把一个 input 变成 combobox：getItems(query)→[{value,known?,hint?}]，选中后调 onPick(value)
function setupCombo(input, getItems, onPick) {
  const pop = document.createElement('div'); pop.className = 'combo-pop hidden';
  input.parentNode.appendChild(pop);
  let items = [], active = -1, open = false;
  const close = () => { pop.classList.add('hidden'); open = false; active = -1; };
  const setActive = (i) => {
    active = i;
    pop.querySelectorAll('.combo-item').forEach((el) => el.classList.toggle('active', +el.dataset.i === active));
    const el = pop.querySelector('.combo-item.active'); if (el) el.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => { const it = items[i]; if (!it) return; input.value = it.value; close(); onPick(it.value); };
  const render = () => {
    items = getItems(input.value.trim()) || [];
    pop.innerHTML = '';
    if (!items.length) { close(); return; }
    const frag = document.createDocumentFragment();
    items.forEach((it, i) => {
      const row = document.createElement('div'); row.className = 'combo-item'; row.dataset.i = i;
      if (it.known) { const f = document.createElement('span'); f.className = 'combo-f'; f.textContent = 'ƒ'; row.appendChild(f); }
      const nm = document.createElement('span'); nm.className = 'combo-name'; nm.textContent = it.value; row.appendChild(nm);
      if (it.hint) { const h = document.createElement('span'); h.className = 'combo-hint'; h.textContent = it.hint; row.appendChild(h); }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
      row.addEventListener('mouseenter', () => setActive(i));
      frag.appendChild(row);
    });
    pop.appendChild(frag);
    if (items._more) { const m = document.createElement('div'); m.className = 'combo-more'; m.textContent = `… 还有 ${items._more} 个，继续输入缩小范围`; pop.appendChild(m); }
    pop.classList.remove('hidden'); open = true;
  };
  input.addEventListener('focus', () => { active = -1; render(); });
  input.addEventListener('input', () => { active = -1; render(); });
  input.addEventListener('blur', () => setTimeout(close, 130));   // 延迟关闭，给点击留时间
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) render(); setActive(Math.min(active + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (open) setActive(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { if (open && items.length) { e.preventDefault(); e.stopPropagation(); pick(active >= 0 ? active : 0); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
  });
  return { render, close };
}
function openEditor(rule) {
  $('modalTitle').textContent = rule ? '编辑规则' : '添加规则';
  $('r_name').value = rule ? rule.name : '';
  $('r_interval').value = rule ? rule.intervalSec : 30;
  $('r_dll').value = rule && rule.dll ? rule.dll : 'user32.dll';
  $('r_func').value = rule ? (rule.func || '') : '';
  $('r_call').checked = rule ? rule.callOriginal : true;
  $('r_reten').checked = rule ? rule.retOverride != null : false;
  $('r_retval').value = rule && rule.retOverride != null ? rule.retOverride : '';
  $('r_enabled').checked = rule ? rule.enabled : true;
  setKind(rule ? rule.kind : 'keepalive');
  renderArgsRows(rule ? rule.args : null);   // 按规则已有入参回填
  $('overlay').classList.remove('hidden');
  setTimeout(() => $('r_name').focus(), 30);
  return new Promise((res) => { modalResolve = res; });
}
function closeEditor(val) { $('overlay').classList.add('hidden'); if (modalResolve) { modalResolve(val); modalResolve = null; } }
function collectRule() {
  const kind = $('r_kind').value;
  const enabled = $('r_enabled').checked;
  const name0 = $('r_name').value.trim();
  if (kind === 'keepalive') {
    const intervalSec = Math.min(3600, Math.max(1, parseInt($('r_interval').value, 10) || 30));
    return { kind, enabled, intervalSec, name: name0 || `保活 每${intervalSec}秒`, args: [null, null, null, null], callOriginal: true, retOverride: null, dll: '', func: '', _cd: intervalSec };
  }
  const dll = $('r_dll').value.trim(), func = $('r_func').value.trim();
  if (!dll || !func) { status('模块 DLL 和 函数名 不能为空', 'err'); return null; }
  const r = { kind, enabled, dll, func, intervalSec: 30, args: [null, null, null, null], callOriginal: true, retOverride: null, name: name0 || (dll + '!' + func) };
  if (kind === 'hook') {
    const pa = collectArgs();
    if (pa.error) { status(pa.error, 'err'); return null; }
    r.args = pa.args;
    r.callOriginal = $('r_call').checked;
    if ($('r_reten').checked) {
      const v = $('r_retval').value.trim();
      if (!validVal(v)) { status('返回值格式不对（十进制或 0x 十六进制）', 'err'); return null; }
      r.retOverride = v;
    }
  }
  return r;
}

// ---------------- inject / config / 持久化 ----------------
function serialize() { return state.targets.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules })); }
async function saveConfig() {
  const r = await api.saveConfig(state.dllPath, serialize(), { logAll: state.logAll });
  if (r && !r.ok) status('保存配置失败: ' + r.msg, 'err');
  persist();
}
// 把目标/规则/设置存到本地（userData/state.json），重启后恢复
function persist() {
  if (state._restoring) return;
  api.saveState({
    showAll: state.showAll,
    logAll: state.logAll,
    kaEnabled: $('kaToggle').checked,
    autoInject: $('autoInject').checked,
    autoSec: parseInt($('autoSec').value, 10) || 5,
    targets: state.targets.map((t) => ({ process: t.process, title: t.title, pid: t.pid, rules: t.rules }))
  });
}
// 把恢复的/离线的目标按 进程名+标题 重新绑定到当前活动窗口；找不到则标记离线
function rebindTargets() {
  const used = new Set();
  for (const t of state.targets) {
    if (t.hwnd && state.allWindows.some((x) => x.hwnd === t.hwnd)) { used.add(t.hwnd); t.offline = false; continue; }
    let w = state.allWindows.find((x) => x.process === t.process && x.title === t.title && !used.has(x.hwnd))
         || state.allWindows.find((x) => x.process === t.process && !used.has(x.hwnd));
    if (w) { t.hwnd = w.hwnd; t.pid = w.pid; t.title = w.title; t.offline = false; used.add(w.hwnd); }
    else { t.hwnd = null; t.offline = true; }
  }
}
async function doInject() {
  const t = curTarget(); if (!t) { status('请先选择一个目标窗口', 'err'); return; }
  if (t.offline) { status('该目标当前离线（对应程序未运行），无法注入', 'err'); return; }
  await saveConfig();
  status(`正在注入到 PID ${t.pid} …`);
  const r = await api.inject(t.pid, state.dllPath);
  status('[注入] ' + r.msg, r.ok ? 'ok' : 'err');
}
async function doEject() {
  const t = curTarget(); if (!t) { status('请先选择一个目标窗口', 'err'); return; }
  if (t.offline) { status('该目标当前离线，无法卸载', 'err'); return; }
  const r = await api.eject(t.pid, baseName(state.dllPath));
  status('[卸载] ' + r.msg, r.ok ? 'ok' : 'err');
}
async function doApply() {
  await saveConfig();
  const t = curTarget(); if (!t) { status('配置已保存。选中一个已注入的窗口再点应用即可热生效。'); return; }
  if (t.offline) { status('该目标当前离线，无法应用', 'err'); return; }
  const r = await api.reload(t.pid, state.dllPath);
  status('[应用] ' + r.msg, r.ok ? 'ok' : 'err');
}
function baseName(p) { return (p || '').split(/[\\/]/).pop(); }

// ---------------- keep-alive timer (按窗口 PostMessage) ----------------
setInterval(() => {
  if (!$('kaToggle').checked) return;
  for (const t of state.targets) { if (t.offline || !t.hwnd) continue; for (const r of t.rules) {
    if (r.kind !== 'keepalive' || !r.enabled) continue;
    r._cd = (r._cd == null ? r.intervalSec : r._cd) - 1;
    if (r._cd <= 0) { api.wiggle(t.hwnd, t.pid); r._cd = Math.max(1, r.intervalSec); }
  } }
}, 1000);

// ---------------- 自动注入：保持目标处于已注入状态(PID 变了自动重挂) ----------------
// 通用：对你加入的、且带「需注入规则」(idle/hook/fg/uncapture)的目标，持续保证它被注入并应用规则。
// 目标进程重启/重连导致 PID 变化 → 自动重绑并注入。关闭仅停止自动维持，不卸载已注入的。
let _autoCd = 0, _autoBusy = false;
function autoSec() { return Math.min(60, Math.max(2, parseInt($('autoSec').value, 10) || 5)); }
function needsInject(t) { return (t.rules || []).some((r) => r.enabled && (r.kind === 'idle' || r.kind === 'hook' || r.kind === 'fg' || r.kind === 'uncapture')); }
async function autoInjectTick() {
  if (_autoBusy) return; _autoBusy = true;
  try {
    const r = await api.listWindows(state.showAll);     // 静默重枚举 + 重绑 PID（不刷新大列表）
    state.allWindows = Array.isArray(r) ? r : [];
    rebindTargets(); renderTargets();
    const need = [];
    for (const t of state.targets) {
      if (t.offline || !t.hwnd || !needsInject(t)) continue;
      if (!(await api.moduleLoaded(t.pid))) need.push(t);
    }
    if (need.length) {
      await saveConfig();                                // 把目标规则按当前 PID 写入规则文件，再注入
      for (const t of need) {
        const res = await api.inject(t.pid, state.dllPath);
        status(`自动注入：${res.ok ? '✓' : '✗'} ${t.process}（PID ${t.pid}）${res.ok ? '' : ' — ' + res.msg}`, res.ok ? 'ok' : 'err');
      }
    }
  } catch (e) { status('自动注入巡检异常：' + (e && e.message || e), 'err'); }
  finally { _autoBusy = false; }
}
setInterval(() => { if (!$('autoInject').checked) return; if (--_autoCd > 0) return; _autoCd = autoSec(); autoInjectTick(); }, 1000);
$('autoInject').addEventListener('change', () => {
  if ($('autoInject').checked) { _autoCd = 0; status(`已开启自动注入：每 ${autoSec()} 秒巡检；带注入规则的目标若没挂上/换了 PID，会自动重新注入并应用规则。`, 'ok'); }
  else status('已关闭自动注入（不再自动维持；已注入的不动，可手动“卸载”还原）');
  persist();
});
$('autoSec').addEventListener('change', persist);
$('kaToggle').addEventListener('change', persist);

// ---------------- wire up ----------------
$('filter').addEventListener('input', renderWindows);
$('refresh').onclick = refreshWindows;
$('toggleAll').onclick = () => {
  state.showAll = !state.showAll;
  $('toggleAll').classList.toggle('active', state.showAll);
  refreshWindows();
  persist();
};
$('addTarget').onclick = addTarget;
$('delTarget').onclick = delTarget;
$('addRule').onclick = addRule;
$('editRule').onclick = editRule;
$('delRule').onclick = delRule;
$('inject').onclick = doInject;
$('eject').onclick = doEject;
$('apply').onclick = doApply;

// 全量 API 透传日志开关：写入配置后，已注入的目标点“应用”即可热生效
$('logAll').addEventListener('change', async () => {
  state.logAll = $('logAll').checked;
  await saveConfig();
  status(state.logAll
    ? '已开启「全量 API 日志(透传)」：对已注入窗口点“应用”生效，再点“打开日志”查看（%TEMP%\\KeepAliveHook.log）'
    : '已关闭全量 API 日志：对已注入窗口点“应用”生效', 'ok');
});
$('openLog').onclick = async () => {
  const r = await api.openHookLog();
  status(r && r.ok ? '已打开日志：' + r.path : '打开日志失败: ' + (r && r.msg), r && r.ok ? '' : 'err');
};

// 规则类型分段控件
document.querySelectorAll('#r_kind_seg .seg').forEach((b) => { b.onclick = () => setKind(b.dataset.kind); });
$('r_func').addEventListener('input', applyFuncHints);     // 输入即更新原型/入参提示
setupCombo($('r_dll'), dllItems, (v) => { loadFuncs(v); applyFuncHints(); });
setupCombo($('r_func'), funcItems, () => applyFuncHints());
$('r_dll').addEventListener('change', () => { loadFuncs($('r_dll').value); applyFuncHints(); });  // 手输自定义 DLL 失焦也刷新
$('r_reten').addEventListener('change', syncRetEnable);
$('r_call').addEventListener('change', () => {
  // 取消「调用原函数」=完全拦截，此时必须给个 mock 返回值 → 自动勾上「拦截返回」并聚焦
  if (!$('r_call').checked && !$('r_reten').checked) { $('r_reten').checked = true; syncRetEnable(); $('r_retval').focus(); }
});
$('r_ok').onclick = () => { const r = collectRule(); if (r) closeEditor(r); };
$('r_cancel').onclick = () => closeEditor(null);
$('overlay').addEventListener('mousedown', (e) => { if (e.target === $('overlay')) closeEditor(null); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('overlay').classList.contains('hidden')) closeEditor(null);
  if (e.key === 'Enter' && !$('overlay').classList.contains('hidden') && e.target.tagName !== 'BUTTON') { const r = collectRule(); if (r) closeEditor(r); }
});

// 窗口控制
$('winMin').onclick = () => api.winMinimize();
$('winMax').onclick = () => api.winMaximize();
$('winClose').onclick = () => api.winClose();
api.onMaximizeChange((max) => {
  const u = $('winMax').querySelector('use');
  u.setAttribute('href', max ? '#i-win-restore' : '#i-win-max');
  $('winMax').title = max ? '还原' : '最大化';
});

// 活动日志展开/收起（按钮）：用显式高度，记住上次拖到的高度
function setLogOpen(open) {
  const log = $('logPanel');
  log.classList.toggle('open', open);
  $('logToggle').classList.toggle('open', open);
  log.style.height = open ? ((log._h && log._h > 24 ? log._h : 170) + 'px') : '0px';
}
$('logToggle').onclick = () => setLogOpen(!$('logPanel').classList.contains('open'));

// 顶部分隔条：拖拽改窗口列表高度
(() => {
  const divider = $('divider'), winpanel = $('winpanel'); let dragging = false;
  divider.addEventListener('mousedown', (e) => { dragging = true; document.body.style.cursor = 'row-resize'; e.preventDefault(); });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const top = winpanel.getBoundingClientRect().top;
    winpanel.style.height = Math.max(130, Math.min(window.innerHeight - 300, e.clientY - top)) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
})();

// 下部分隔条：拖拽改活动日志区高度（上拖加高/展开、下拖收起；下部面板随之让出空间）
(() => {
  const div = $('vdivider'), log = $('logPanel'); let drag = false, sy = 0, sh = 0;
  div.addEventListener('mousedown', (e) => {
    drag = true; sy = e.clientY; sh = log.offsetHeight;
    log.classList.add('dragging'); document.body.style.cursor = 'row-resize'; e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const h = Math.max(0, Math.min(Math.round(window.innerHeight * 0.6), sh + (sy - e.clientY)));
    log.style.height = h + 'px';
    const op = h > 6; log.classList.toggle('open', op); $('logToggle').classList.toggle('open', op);
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return; drag = false; log.classList.remove('dragging'); document.body.style.cursor = '';
    log._h = log.offsetHeight;
  });
})();

// init
(async () => {
  state._restoring = true;
  state.dllPath = await api.defaultDll();   // 内置拦截 DLL，随程序打包；界面不提供路径设置
  const saved = await api.loadState();
  if (saved) {
    state.showAll = !!saved.showAll;
    state.logAll = !!saved.logAll;
    $('toggleAll').classList.toggle('active', state.showAll);
    $('logAll').checked = state.logAll;
    $('kaToggle').checked = saved.kaEnabled !== false;
    $('autoInject').checked = !!saved.autoInject;
    if (saved.autoSec) $('autoSec').value = saved.autoSec;
    state.targets = (saved.targets || []).map((t) => ({
      uid: newUid(), hwnd: null, pid: t.pid, title: t.title, process: t.process, offline: true,
      rules: (t.rules || []).map((r) => (r.kind === 'keepalive' ? { ...r, _cd: r.intervalSec } : { ...r }))
    }));
  }
  renderTargets(); renderRules();
  state._restoring = false;
  await refreshWindows();   // 枚举窗口 + 重绑目标
  const n = state.targets.length, off = state.targets.filter((t) => t.offline).length;
  if (n) status(`已恢复 ${n} 个目标` + (off ? `，其中 ${off} 个离线（对应程序未运行，刷新或重开后自动重连）` : '，配置就绪'), off ? '' : 'ok');
  else status('就绪。选窗口 → 加入目标 → 给目标加规则；保活即时生效，hook 规则需注入。');
})();
})();
