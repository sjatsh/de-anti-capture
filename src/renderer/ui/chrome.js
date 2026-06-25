import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';

// 无边框窗口的自定义标题栏按钮（最小化/最大化-还原/关闭）
export function initTitlebar() {
  $('winMin').onclick = () => api.winMinimize();
  $('winMax').onclick = () => api.winMaximize();
  $('winClose').onclick = () => api.winClose();
  api.onMaximizeChange((max) => {
    const u = $('winMax').querySelector('use');
    u.setAttribute('href', max ? '#i-win-restore' : '#i-win-max');
    $('winMax').title = max ? '还原' : '最大化';
  });
}

// 活动日志展开/收起（按钮）：用显式高度，记住上次拖到的高度
function setLogOpen(open) {
  const log = $('logPanel');
  log.classList.toggle('open', open);
  $('logToggle').classList.toggle('open', open);
  log.style.height = open ? (log._h && log._h > 24 ? log._h : 170) + 'px' : '0px';
}

export function initLogToggle() {
  $('logToggle').onclick = () => setLogOpen(!$('logPanel').classList.contains('open'));
}

// 两条分隔条：上条拖拽改窗口列表高度；下条拖拽改活动日志区高度（上拖加高/展开、下拖收起）
export function initResizers() {
  // 顶部分隔条：拖拽改窗口列表高度
  (() => {
    const divider = $('divider'),
      winpanel = $('winpanel');
    let dragging = false;
    divider.addEventListener('mousedown', (e) => {
      dragging = true;
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const top = winpanel.getBoundingClientRect().top;
      winpanel.style.height = Math.max(130, Math.min(window.innerHeight - 300, e.clientY - top)) + 'px';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  })();

  // 下部分隔条：拖拽改活动日志区高度（上拖加高/展开、下拖收起；下部面板随之让出空间）
  (() => {
    const div = $('vdivider'),
      log = $('logPanel');
    let drag = false,
      sy = 0,
      sh = 0;
    div.addEventListener('mousedown', (e) => {
      drag = true;
      sy = e.clientY;
      sh = log.offsetHeight;
      log.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const h = Math.max(0, Math.min(Math.round(window.innerHeight * 0.6), sh + (sy - e.clientY)));
      log.style.height = h + 'px';
      const op = h > 6;
      log.classList.toggle('open', op);
      $('logToggle').classList.toggle('open', op);
    });
    window.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = false;
      log.classList.remove('dragging');
      document.body.style.cursor = '';
      log._h = log.offsetHeight;
    });
  })();
}
