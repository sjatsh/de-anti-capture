import { memo } from 'react';
import type { Target } from '@shared/types';
import { avatarStyle, avatarChar } from '../../lib/format';

interface TargetCardProps {
  target: Target;
  selected: boolean;
  onSelect: (uid: string) => void;
}

export const TargetCard = memo(function TargetCard({ target: t, selected, onSelect }: TargetCardProps) {
  return (
    <div
      className={`card${selected ? ' sel' : ''}${t.offline ? ' offline' : ''}`}
      onClick={() => onSelect(t.uid)}
    >
      <span className="avatar lg" style={avatarStyle(t.process)}>{avatarChar(t.process)}</span>
      <div className="meta">
        <div className="t1">
          <span className="name">{t.process}</span>
          {t.offline && <span className="htag off">离线</span>}
          <span className="pill count">{t.rules.length} 规则</span>
        </div>
        <div className="sub">{t.title} · {t.offline ? '未运行' : 'PID ' + t.pid}</div>
      </div>
    </div>
  );
});
