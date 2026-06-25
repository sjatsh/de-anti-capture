// DOM 微助手 + 状态行/活动日志写入。
export const $ = (id) => document.getElementById(id);

export const VAL_RE = /^(0x[0-9a-fA-F]+|\d+)$/;
export function validVal(s) {
  return VAL_RE.test(String(s).trim());
}
export function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

function nowTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 状态行 + 「活动日志」历史视图（最多保留 250 行）。拦截日志是另一个视图，见 features/hooklog.js。
export function status(msg, cls) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status' + (cls ? ' ' + cls : '');
  const view = $('logViewActivity') || $('logPanel');
  const line = document.createElement('div');
  line.className = 'logline' + (cls ? ' ' + cls : '');
  line.innerHTML = `<span class="ts"></span><span class="msg"></span>`;
  line.querySelector('.ts').textContent = nowTime();
  line.querySelector('.msg').textContent = msg;
  view.appendChild(line);
  const panel = $('logPanel');
  if (panel) panel.scrollTop = panel.scrollHeight;
  while (view.childElementCount > 250) view.removeChild(view.firstChild);
}
