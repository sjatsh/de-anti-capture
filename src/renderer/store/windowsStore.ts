import { create } from 'zustand';
import type { WindowInfo } from '@shared/types';

interface WindowsState {
  allWindows: WindowInfo[];
  filterText: string;
  showAll: boolean;
  selWin: string | null;

  setWindows(windows: WindowInfo[]): void;
  setFilter(text: string): void;
  setShowAll(all: boolean): void;
  selectWindow(hwnd: string | null): void;
}

export const useWindowsStore = create<WindowsState>((set) => ({
  allWindows: [],
  filterText: '',
  showAll: false,
  selWin: null,

  setWindows: (allWindows) => set({ allWindows }),
  setFilter: (filterText) => set({ filterText }),
  setShowAll: (showAll) => set({ showAll }),
  selectWindow: (selWin) => set({ selWin }),
}));
