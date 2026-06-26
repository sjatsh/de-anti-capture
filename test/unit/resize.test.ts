import { describe, it, expect } from 'vitest';
import { nextFooterHeight } from '@/lib/resize';

// 底部面板高度调节把手的核心计算：往上拖变高、往下拖变矮，并夹在 [0, max]。
describe('nextFooterHeight — 底部面板上下拖动', () => {
  it('往上拖（鼠标 y 由 500 → 400）面板变高 +100', () => {
    expect(nextFooterHeight(300, 500, 400, 800)).toBe(400);
  });

  it('往下拖（鼠标 y 由 500 → 620）面板变矮 -120', () => {
    expect(nextFooterHeight(300, 500, 620, 800)).toBe(180);
  });

  it('原地不动（y 不变）高度不变', () => {
    expect(nextFooterHeight(300, 500, 500, 800)).toBe(300);
  });

  it('往上拖过头夹在上限 max', () => {
    expect(nextFooterHeight(700, 500, 50, 800)).toBe(800);
  });

  it('往下拖过头夹在 0（不为负）', () => {
    expect(nextFooterHeight(80, 500, 900, 800)).toBe(0);
  });

  it('上下拖动是连续可逆的（同一起点，方向相反，结果对称）', () => {
    const up = nextFooterHeight(300, 500, 450, 800); // 上移 50
    const down = nextFooterHeight(300, 500, 550, 800); // 下移 50
    expect(up).toBe(350);
    expect(down).toBe(250);
  });
});
