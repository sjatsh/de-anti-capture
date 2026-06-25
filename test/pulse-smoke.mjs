// 方案 A 前台脉冲 — 原生层冒烟测试（验证 koffi 新绑定 getForeground/focusWindow 不崩、能真切前台）
// 用法：node test/pulse-smoke.mjs   （会把前台切到另一个窗口再切回，观察控制台输出）
import { create } from '../src/native/win32.js';

const n = create();
const wins = n.listWindows({ all: false });
console.log(`枚举到 ${wins.length} 个窗口`);

const fg = n.getForeground();
console.log('当前前台 hwnd =', fg);

// 找一个“有标题、可见、且不是当前前台”的窗口做切换靶子
const cand = wins.find((w) => w.hwnd !== fg && w.title && w.visible);
if (!cand) {
  console.log('没有合适的切换靶子（需另开一个带标题窗口再测）');
  process.exit(0);
}
console.log(`切换靶子: ${cand.process} / “${cand.title}” / hwnd=${cand.hwnd}`);

const r = n.focusWindow(cand.hwnd);
console.log('focusWindow =>', r);
const fg2 = n.getForeground();
console.log('切换后前台 hwnd =', fg2, '与靶子一致?', fg2 === cand.hwnd);

// 发一次真实鼠标微移（脉冲实际喂的输入）
const si = n.synthInput({ mode: 'mouse' });
console.log('synthInput(mouse) =>', si);

// 切回原前台
if (fg && fg !== '0') {
  const rr = n.focusWindow(fg);
  console.log('切回原前台 =>', rr, '现前台 =', n.getForeground());
}
console.log('OK：原生层未崩，前台切换链路通。');
