import { create } from 'zustand';

export interface LogLine {
  ts: string;
  msg: string;
  cls: string;
}

function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface UiState {
  statusMsg: string;
  statusCls: '' | 'ok' | 'err';
  activityLines: LogLine[];
  logPanelOpen: boolean;
  /** 底部面板（拦截DLL + 设置 + 日志）展开时的总高度；拖动把手调整，日志区在内部自适应填充。 */
  footerHeight: number;
  winPanelHeight: number;

  setStatus(msg: string, cls?: '' | 'ok' | 'err'): void;
  setLogPanelOpen(open: boolean): void;
  setFooterHeight(h: number): void;
  setWinPanelHeight(h: number): void;
}

export const useUiStore = create<UiState>((set) => ({
  statusMsg: '就绪',
  statusCls: '',
  activityLines: [],
  // 默认：日志区很矮（约几行），让上方「目标/规则」区占大头；
  // 把手是「规则区 ↔ 底部」的分界，往下拖 = 规则区变大、日志收缩，往上拖 = 日志变大。
  logPanelOpen: true,
  footerHeight: 400,
  winPanelHeight: 252,

  setStatus: (msg, cls = '') =>
    set((s) => {
      const lines = [...s.activityLines, { ts: nowTime(), msg, cls }];
      if (lines.length > 250) lines.splice(0, lines.length - 250);
      return { statusMsg: msg, statusCls: cls as UiState['statusCls'], activityLines: lines };
    }),

  setLogPanelOpen: (logPanelOpen) => set({ logPanelOpen }),
  setFooterHeight: (footerHeight) => set({ footerHeight }),
  setWinPanelHeight: (winPanelHeight) => set({ winPanelHeight }),
}));
