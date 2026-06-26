import { useRef, useCallback } from 'react';
import type { RefObject, MouseEvent } from 'react';
import { nextFooterHeight } from '../../lib/resize';

interface HorizDividerProps {
  onResize: (newHeight: number) => void;
  panelRef: RefObject<HTMLElement | null>;
  minH?: number;
  maxH?: number;
}

export function HorizDivider({ onResize, panelRef, minH = 130, maxH }: HorizDividerProps) {
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: MouseEvent) => {
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();

    const onMove = (me: globalThis.MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const top = panelRef.current.getBoundingClientRect().top;
      const h = Math.max(minH, Math.min(maxH ?? window.innerHeight - 300, me.clientY - top));
      onResize(h);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onResize, panelRef, minH, maxH]);

  return (
    <div className="divider" title="拖拽调整窗口列表高度" onMouseDown={onMouseDown}>
      <span />
    </div>
  );
}

interface FooterResizerProps {
  /** 指向 <footer>，用于读取它当前的总高度作为拖拽起点。 */
  footerRef: RefObject<HTMLElement | null>;
  /** 拖拽中回调：新的底部面板总高度 + 是否算作展开（太矮则收起，日志区让位给控制行）。 */
  onResize: (height: number, open: boolean) => void;
}

// 把手位于「内容区 ↔ 底部栏」分界线上，拖动调整整个底部面板（拦截DLL + 设置 + 日志）的总高度。
// 日志区在底部面板内部 flex 自适应填充剩余空间，所以拖高=日志变高、拖到很矮=日志收起只留控制行。
export function FooterResizer({ footerRef, onResize }: FooterResizerProps) {
  const drag = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback((e: MouseEvent) => {
    drag.current = true;
    startY.current = e.clientY;
    startH.current = footerRef.current?.offsetHeight ?? 0;
    document.body.style.cursor = 'row-resize';
    footerRef.current?.classList.add('dragging');
    e.preventDefault();

    const onMove = (me: globalThis.MouseEvent) => {
      if (!drag.current) return;
      // 往上拖的上限：最多到「目标窗口 / 规则」标题栏下沿，不盖住标题。
      const head = document.querySelector('.lower .panel-head');
      const limit = head
        ? Math.round(head.getBoundingClientRect().bottom) + 8
        : Math.round(window.innerHeight * 0.3);
      const max = Math.max(160, window.innerHeight - limit);
      const h = nextFooterHeight(startH.current, startY.current, me.clientY, max);
      onResize(h, h > 250);
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = false;
      footerRef.current?.classList.remove('dragging');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [footerRef, onResize]);

  return (
    <div className="divider vdiv" title="拖拽调整底部面板（拦截DLL / 设置 / 日志）的整体高度" onMouseDown={onMouseDown}>
      <span />
    </div>
  );
}
