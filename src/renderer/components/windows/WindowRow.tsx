import { memo } from 'react';
import type { WindowInfo } from '@shared/types';
import { avatarStyle, avatarChar } from '../../lib/format';

interface WindowRowProps {
  win: WindowInfo;
  selected: boolean;
  onSelect: (hwnd: string) => void;
  onAddTarget: () => void;
}

export const WindowRow = memo(function WindowRow({ win, selected, onSelect, onAddTarget }: WindowRowProps) {
  const hx = '0x' + BigInt(win.hwnd).toString(16).toUpperCase();
  const hasTitle = win.title?.trim();

  return (
    <div
      className={`row${selected ? ' sel' : ''}`}
      title={win.cls ? '窗口类名: ' + win.cls : undefined}
      onClick={() => onSelect(win.hwnd)}
      onDoubleClick={onAddTarget}
    >
      <div className="c-pid">{win.pid}</div>
      <div className="c-proc">
        <span className="avatar" style={avatarStyle(win.process)}>{avatarChar(win.process)}</span>
        <span className="pname">{win.process}</span>
      </div>
      <div className="c-title grow">
        {hasTitle ? win.title : <span className="cls">[{win.cls || '无标题'}]</span>}
        {win.visible === false && <span className="htag">隐藏</span>}
      </div>
      <div className="c-hwnd mono">{hx}</div>
    </div>
  );
});
