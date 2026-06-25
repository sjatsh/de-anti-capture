import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, validVal, status } from '../lib/dom.js';
import { funcSig, protoText, ARG_REGS } from '../lib/sig.js';

let modalResolve = null;
const KIND_DESC = {
  keepalive: '定时向该窗口投递随机坐标的鼠标移动消息，让程序自己不进入空闲（不动你真实光标）。无需注入。',
  idle: '把某 API 当作 GetLastInputInfo 处理，让系统空闲时间归零。需要先对该窗口注入 DLL。',
  fg: '把 GetForegroundWindow 伪装成“返回本进程自己的主窗口”，让无影云 stream_viewer 以为自己一直在前台，从而持续把你本地输入转发到远端、不空闲掉线。零闪屏。需注入该进程(选 stream_viewer)。副作用：开启后本地输入会被转发进远端会话。',
  uncapture: '防截屏置黑：装上时主动对本进程窗口调 SetWindowDisplayAffinity(NONE) 撕掉已有的“截屏排除”保护，并 hook 住防止重设。对“窗口创建时设一次保护、之后不再调用”的程序(如无影云)有效。需注入该进程(选 stream_viewer)。',
  hook: '通用拦截：可改入参、改返回值、或完全不调用原函数返回 mock 值。什么都不设=透传。需要注入。',
};

// 选中函数 → 原型/作用提示 + 返回值占位 + 重渲染入参行
function applyFuncHints() {
  const kind = $('r_kind').value;
  const sigEl = $('funcSig'),
    retEl = $('r_retval');
  const fn = $('r_func').value.trim();
  const e = funcSig(fn);
  if (e && kind !== 'keepalive') {
    sigEl.innerHTML = '';
    const proto = document.createElement('div');
    proto.className = 'sig-proto';
    proto.textContent = protoText(fn, e);
    const desc = document.createElement('div');
    desc.className = 'sig-desc';
    desc.textContent = `${e.dll}.dll · ${e.d}`;
    sigEl.appendChild(proto);
    sigEl.appendChild(desc);
    sigEl.classList.remove('hide');
  } else {
    sigEl.innerHTML = '';
    sigEl.classList.add('hide');
  }
  retEl.placeholder = e && e.rd ? e.rd : '0 / 1 / 0x1';
  renderArgsRows();
}

// 入参覆盖：按所选函数真实参数逐项渲染（参数名 + 类型）。
function renderArgsRows(prefill) {
  const cont = $('argsRows');
  const cur = prefill || readArgsRows(); // 不给 prefill 时保留当前已输入的值
  const e = funcSig($('r_func').value.trim());
  cont.innerHTML = '';
  if (e && e.p.length === 0) {
    cont.innerHTML = '<div class="args-none">该函数无参数，无需改入参</div>';
    return;
  }
  let rows;
  if (e && e.p.length) {
    rows = e.p.slice(0, 4).map((p, i) => ({ name: p[0], type: p[1], desc: p[2] || '', reg: ARG_REGS[i] }));
  } else {
    rows = ARG_REGS.map((r, i) => ({ name: 'arg' + i, type: 'INT64', desc: '未收录签名，按 x64 调用约定第 ' + (i + 1) + ' 个参数', reg: r }));
  }
  const frag = document.createDocumentFragment();
  rows.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'arg-row';
    const meta = document.createElement('div');
    meta.className = 'arg-meta';
    const nm = document.createElement('span');
    nm.className = 'arg-name';
    nm.textContent = p.name;
    nm.title = p.desc || p.name;
    const ty = document.createElement('span');
    ty.className = 'arg-type';
    ty.textContent = p.type;
    ty.title = p.reg + (p.desc ? ' · ' + p.desc : '');
    meta.appendChild(nm);
    meta.appendChild(ty);
    const inp = document.createElement('input');
    inp.className = 'arg-in';
    inp.dataset.idx = i;
    inp.dataset.name = p.name;
    inp.value = cur && cur[i] != null ? cur[i] : '';
    inp.placeholder = '留空 = 不改';
    inp.autocomplete = 'off';
    if (p.desc) inp.title = p.desc;
    row.appendChild(meta);
    row.appendChild(inp);
    frag.appendChild(row);
  });
  cont.appendChild(frag);
  const total = e ? e.n || e.p.length : 0;
  if (total > 4) {
    const note = document.createElement('div');
    note.className = 'args-note';
    note.textContent = `该函数共 ${total} 个参数；第 5 个起在栈上，当前仅支持覆盖前 4 个（寄存器）参数。`;
    cont.appendChild(note);
  }
}

function readArgsRows() {
  const a = [null, null, null, null];
  $('argsRows')
    .querySelectorAll('.arg-in')
    .forEach((inp) => {
      const v = inp.value.trim();
      if (v) a[+inp.dataset.idx] = v;
    });
  return a;
}

function collectArgs() {
  const args = [null, null, null, null];
  for (const inp of $('argsRows').querySelectorAll('.arg-in')) {
    const v = inp.value.trim();
    if (!v) continue;
    if (!validVal(v)) return { error: `入参「${inp.dataset.name}」格式不对（十进制或 0x 十六进制）: ${v}` };
    args[+inp.dataset.idx] = v;
  }
  return { args };
}

// 返回值输入框：未勾「拦截返回」时禁用
function syncRetEnable() {
  $('r_retval').disabled = !$('r_reten').checked;
}

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
  if (k === 'idle' && !$('r_func').value.trim()) {
    $('r_dll').value = 'user32.dll';
    $('r_func').value = 'GetLastInputInfo';
  }
  if (k === 'fg') {
    $('r_dll').value = 'user32.dll';
    $('r_func').value = 'GetForegroundWindow';
  } // 固定靶点
  if (k === 'uncapture') {
    $('r_dll').value = 'user32.dll';
    $('r_func').value = 'SetWindowDisplayAffinity';
  }
  if (k !== 'keepalive') loadFuncs($('r_dll').value);
  applyFuncHints();
  syncRetEnable();
}

async function loadFuncs(dll) {
  const names = await api.getExports(dll);
  if (!Array.isArray(names)) {
    status('无法读取 ' + dll + ' 的导出函数', 'err');
    state.funcs = [];
    return;
  }
  state.funcs = names;
  if (document.activeElement === $('r_func')) $('r_func').dispatchEvent(new Event('input')); // 正在选时刷新下拉
}

// —— 自定义下拉（combobox）：支持过滤 / ↑↓ 选择 / 回车确认 / 点击选择 ——
const KNOWN_DLLS = ['user32.dll', 'kernel32.dll', 'ntdll.dll', 'advapi32.dll', 'gdi32.dll', 'winmm.dll', 'ws2_32.dll', 'wininet.dll', 'ole32.dll', 'shell32.dll'];
function dllItems(q) {
  const ql = q.toLowerCase();
  return KNOWN_DLLS.filter((n) => n.toLowerCase().includes(ql)).map((n) => ({ value: n }));
}
function funcItems(q) {
  const all = state.funcs || [];
  const ql = q.toLowerCase();
  let m = ql ? all.filter((n) => n.toLowerCase().includes(ql)) : all.slice();
  // 排序：前缀匹配优先 → 已收录(有签名)优先 → 名字短优先。
  m.sort((a, b) => {
    const ap = a.toLowerCase().startsWith(ql) ? 0 : 1,
      bp = b.toLowerCase().startsWith(ql) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ak = funcSig(a) ? 0 : 1,
      bk = funcSig(b) ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.length - b.length || a.localeCompare(b);
  });
  const CAP = 80,
    more = Math.max(0, m.length - CAP);
  const list = m.slice(0, CAP).map((n) => {
    const e = funcSig(n);
    return { value: n, known: !!e, hint: e ? `${e.r} · ${e.n || e.p.length}参` : '' };
  });
  list._more = more;
  return list;
}
// 把一个 input 变成 combobox：getItems(query)→[{value,known?,hint?}]，选中后调 onPick(value)
function setupCombo(input, getItems, onPick) {
  const pop = document.createElement('div');
  pop.className = 'combo-pop hidden';
  input.parentNode.appendChild(pop);
  let items = [],
    active = -1,
    open = false;
  const close = () => {
    pop.classList.add('hidden');
    open = false;
    active = -1;
  };
  const setActive = (i) => {
    active = i;
    pop.querySelectorAll('.combo-item').forEach((el) => el.classList.toggle('active', +el.dataset.i === active));
    const el = pop.querySelector('.combo-item.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    input.value = it.value;
    close();
    onPick(it.value);
  };
  const render = () => {
    items = getItems(input.value.trim()) || [];
    pop.innerHTML = '';
    if (!items.length) {
      close();
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'combo-item';
      row.dataset.i = i;
      if (it.known) {
        const f = document.createElement('span');
        f.className = 'combo-f';
        f.textContent = 'ƒ';
        row.appendChild(f);
      }
      const nm = document.createElement('span');
      nm.className = 'combo-name';
      nm.textContent = it.value;
      row.appendChild(nm);
      if (it.hint) {
        const h = document.createElement('span');
        h.className = 'combo-hint';
        h.textContent = it.hint;
        row.appendChild(h);
      }
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(i);
      });
      row.addEventListener('mouseenter', () => setActive(i));
      frag.appendChild(row);
    });
    pop.appendChild(frag);
    if (items._more) {
      const m = document.createElement('div');
      m.className = 'combo-more';
      m.textContent = `… 还有 ${items._more} 个，继续输入缩小范围`;
      pop.appendChild(m);
    }
    pop.classList.remove('hidden');
    open = true;
  };
  input.addEventListener('focus', () => {
    active = -1;
    render();
  });
  input.addEventListener('input', () => {
    active = -1;
    render();
  });
  input.addEventListener('blur', () => setTimeout(close, 130)); // 延迟关闭，给点击留时间
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) render();
      setActive(Math.min(active + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && items.length) {
        e.preventDefault();
        e.stopPropagation();
        pick(active >= 0 ? active : 0);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
  });
  return { render, close };
}

export function openEditor(rule) {
  $('modalTitle').textContent = rule ? '编辑规则' : '添加规则';
  $('r_name').value = rule ? rule.name : '';
  $('r_interval').value = rule ? rule.intervalSec : 30;
  $('r_dll').value = rule && rule.dll ? rule.dll : 'user32.dll';
  $('r_func').value = rule ? rule.func || '' : '';
  $('r_call').checked = rule ? rule.callOriginal : true;
  $('r_reten').checked = rule ? rule.retOverride != null : false;
  $('r_retval').value = rule && rule.retOverride != null ? rule.retOverride : '';
  $('r_enabled').checked = rule ? rule.enabled : true;
  setKind(rule ? rule.kind : 'keepalive');
  renderArgsRows(rule ? rule.args : null); // 按规则已有入参回填
  $('overlay').classList.remove('hidden');
  setTimeout(() => $('r_name').focus(), 30);
  return new Promise((res) => {
    modalResolve = res;
  });
}

function closeEditor(val) {
  $('overlay').classList.add('hidden');
  if (modalResolve) {
    modalResolve(val);
    modalResolve = null;
  }
}

function collectRule() {
  const kind = $('r_kind').value;
  const enabled = $('r_enabled').checked;
  const name0 = $('r_name').value.trim();
  if (kind === 'keepalive') {
    const intervalSec = Math.min(3600, Math.max(1, parseInt($('r_interval').value, 10) || 30));
    return {
      kind,
      enabled,
      intervalSec,
      name: name0 || `保活 每${intervalSec}秒`,
      args: [null, null, null, null],
      callOriginal: true,
      retOverride: null,
      dll: '',
      func: '',
      _cd: intervalSec,
    };
  }
  const dll = $('r_dll').value.trim(),
    func = $('r_func').value.trim();
  if (!dll || !func) {
    status('模块 DLL 和 函数名 不能为空', 'err');
    return null;
  }
  const r = { kind, enabled, dll, func, intervalSec: 30, args: [null, null, null, null], callOriginal: true, retOverride: null, name: name0 || dll + '!' + func };
  if (kind === 'hook') {
    const pa = collectArgs();
    if (pa.error) {
      status(pa.error, 'err');
      return null;
    }
    r.args = pa.args;
    r.callOriginal = $('r_call').checked;
    if ($('r_reten').checked) {
      const v = $('r_retval').value.trim();
      if (!validVal(v)) {
        status('返回值格式不对（十进制或 0x 十六进制）', 'err');
        return null;
      }
      r.retOverride = v;
    }
  }
  return r;
}

// 规则编辑弹窗的全部接线（分段控件 / combobox / 返回值联动 / 确定取消 / 遮罩与键盘）
export function setupEditorWiring() {
  document.querySelectorAll('#r_kind_seg .seg').forEach((b) => {
    b.onclick = () => setKind(b.dataset.kind);
  });
  $('r_func').addEventListener('input', applyFuncHints); // 输入即更新原型/入参提示
  setupCombo($('r_dll'), dllItems, (v) => {
    loadFuncs(v);
    applyFuncHints();
  });
  setupCombo($('r_func'), funcItems, () => applyFuncHints());
  $('r_dll').addEventListener('change', () => {
    loadFuncs($('r_dll').value);
    applyFuncHints();
  }); // 手输自定义 DLL 失焦也刷新
  $('r_reten').addEventListener('change', syncRetEnable);
  $('r_call').addEventListener('change', () => {
    // 取消「调用原函数」=完全拦截，此时必须给个 mock 返回值 → 自动勾上「拦截返回」并聚焦
    if (!$('r_call').checked && !$('r_reten').checked) {
      $('r_reten').checked = true;
      syncRetEnable();
      $('r_retval').focus();
    }
  });
  $('r_ok').onclick = () => {
    const r = collectRule();
    if (r) closeEditor(r);
  };
  $('r_cancel').onclick = () => closeEditor(null);
  $('overlay').addEventListener('mousedown', (e) => {
    if (e.target === $('overlay')) closeEditor(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('overlay').classList.contains('hidden')) closeEditor(null);
    if (e.key === 'Enter' && !$('overlay').classList.contains('hidden') && e.target.tagName !== 'BUTTON') {
      const r = collectRule();
      if (r) closeEditor(r);
    }
  });
}
