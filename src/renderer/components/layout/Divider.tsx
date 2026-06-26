import { useRef, useCallback } from 'react';
import type { RefObject, MouseEvent } from 'react';

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

interface LogDividerProps {
  logPanelRef: RefObject<HTMLElement | null>;
  onHeightChange: (h: number, open: boolean) => void;
}

export function LogDivider({ logPanelRef, onHeightChange }: LogDividerProps) {
  const drag = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback((e: MouseEvent) => {
    drag.current = true;
    startY.current = e.clientY;
    startH.current = logPanelRef.current?.offsetHeight ?? 0;
    document.body.style.cursor = 'row-resize';
    logPanelRef.current?.classList.add('dragging');
    e.preventDefault();

    const onMove = (me: globalThis.MouseEvent) => {
      if (!drag.current) return;
      const h = Math.max(0, Math.min(Math.round(window.innerHeight * 0.6), startH.current + (startY.current - me.clientY)));
      onHeightChange(h, h > 6);
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = false;
      logPanelRef.current?.classList.remove('dragging');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logPanelRef, onHeightChange]);

  return (
    <div className="divider vdiv" title="拖拽：上调展开/加高活动日志，下调收起" onMouseDown={onMouseDown}>
      <span />
    </div>
  );
}
