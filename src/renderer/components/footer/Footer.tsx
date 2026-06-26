import { useRef, useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import { FooterResizer } from '../layout/Divider';
import { ActionBar } from './ActionBar';
import { SettingsRows } from './SettingsRows';
import { LogSection } from './LogSection';

interface FooterProps {
  onPulseNow: () => void;
}

export function Footer({ onPulseNow }: FooterProps) {
  // 底部「拦截DLL + 设置 + 日志」是一个整体面板。高度始终由 footerHeight 显式控制——
  // 把手拖动随时改变它（往上拖变高、往下拖变矮；CSS 的 min-height: min-content 兜底，
  // 保证控制行永不被压没）。日志区在面板内 flex 填充剩余空间。
  const footerHeight = useUiStore((s) => s.footerHeight);
  const { setFooterHeight, setLogPanelOpen } = useUiStore.getState();

  const footerRef = useRef<HTMLElement | null>(null);

  const onResize = useCallback(
    (height: number, open: boolean) => {
      setFooterHeight(height);
      setLogPanelOpen(open);
    },
    [setFooterHeight, setLogPanelOpen],
  );

  return (
    <footer className="footer" ref={footerRef} style={{ height: footerHeight }}>
      <FooterResizer footerRef={footerRef} onResize={onResize} />
      <ActionBar />
      <SettingsRows onPulseNow={onPulseNow} />
      <LogSection />
    </footer>
  );
}
