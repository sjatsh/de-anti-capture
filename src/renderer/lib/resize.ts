/**
 * 底部面板拖拽：根据起始高度 + 鼠标纵向位移算出新的面板总高度。
 * 鼠标往上移（clientY 变小）→ 面板变高；往下移（clientY 变大）→ 面板变矮。
 * 结果夹在 [0, maxHeight]；下限再由 CSS 的 min-height: min-content 兜底（控制行不被压没）。
 */
export function nextFooterHeight(
  startHeight: number,
  startClientY: number,
  clientY: number,
  maxHeight: number,
): number {
  return Math.max(0, Math.min(maxHeight, startHeight + (startClientY - clientY)));
}
