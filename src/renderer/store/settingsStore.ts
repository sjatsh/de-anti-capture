import { create } from 'zustand';
import type { SynthMode } from '@shared/types';

interface SettingsState {
  kaEnabled: boolean;
  autoInject: boolean;
  autoSec: number;
  logAll: boolean;
  stayAwake: boolean;
  synthBeat: boolean;
  synthSec: number;
  synthMode: SynthMode;
  pulseMode: boolean;
  pulseSec: number;
  pulseMin: boolean;

  set<K extends keyof Omit<SettingsState, 'set' | 'restore'>>(
    key: K,
    val: SettingsState[K],
  ): void;
  restore(s: Partial<Omit<SettingsState, 'set' | 'restore'>>): void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  kaEnabled: true,
  autoInject: false,
  autoSec: 5,
  logAll: false,
  stayAwake: false,
  synthBeat: false,
  synthSec: 50,
  synthMode: 'key',
  pulseMode: false,
  pulseSec: 600,
  pulseMin: true,

  set: (key, val) => set({ [key]: val } as Partial<SettingsState>),
  restore: (s) => set(s as Partial<SettingsState>),
}));
