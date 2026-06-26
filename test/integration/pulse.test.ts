// 前台脉冲原生链路冒烟测试（取代旧的 test/pulse-smoke.mjs）。
// 会真实切换前台窗口，故默认跳过，避免打扰桌面；需手动验证时：
//   Windows PowerShell:  $env:RUN_PULSE=1; npm test
import { describe, it, expect } from 'vitest';
import native from '../../src/native/index';

const enabled = process.platform === 'win32' && !!process.env.RUN_PULSE;

describe.skipIf(!enabled)('focus pulse (win32, opt-in via RUN_PULSE)', () => {
  it('switches a window to the foreground, feeds input, minimizes, and restores', async () => {
    const wins = native.listWindows({ all: false });
    const fg = native.getForeground();
    expect(typeof fg).toBe('string');

    const cand = wins.find((w) => w.hwnd !== fg && w.title && w.visible);
    if (!cand) return; // 没有合适靶子时不强制失败

    const r = native.focusWindow(cand.hwnd);
    expect(r).toHaveProperty('focused');

    const si = native.synthInput({ mode: 'mouse' });
    expect(si.ok).toBe(true);

    const mn = native.minimizeWindow(cand.hwnd);
    expect(mn).toHaveProperty('ok');

    // 还原借用的窗口与原前台，别把用户窗口留在最小化状态
    native.focusWindow(cand.hwnd);
    if (fg && fg !== '0') native.focusWindow(fg);
  });
});
