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
  logPanelHeight: number;
  winPanelHeight: number;

  setStatus(msg: string, cls?: '' | 'ok' | 'err'): void;
  setLogPanelOpen(open: boolean): void;
  setLogPanelHeight(h: number): void;
  setWinPanelHeight(h: number): void;
}

export const useUiStore = create<UiState>((set) => ({
  statusMsg: '就绪',
  statusCls: '',
  activityLines: [],
  logPanelOpen: false,
  logPanelHeight: 170,
  winPanelHeight: 252,

  setStatus: (msg, cls = '') =>
    set((s) => {
      const lines = [...s.activityLines, { ts: nowTime(), msg, cls }];
      if (lines.length > 250) lines.splice(0, lines.length - 250);
      return { statusMsg: msg, statusCls: cls as UiState['statusCls'], activityLines: lines };
    }),

  setLogPanelOpen: (logPanelOpen) => set({ logPanelOpen }),
  setLogPanelHeight: (logPanelHeight) => set({ logPanelHeight }),
  setWinPanelHeight: (winPanelHeight) => set({ winPanelHeight }),
}));
