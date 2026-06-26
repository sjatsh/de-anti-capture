import type { PersistedTarget } from './target';

// 真实输入心跳的发送方式。
export type SynthMode = 'key' | 'mouse' | 'both';

// 持久化到 userData/state.json 的完整应用状态。
// 旧文件可能缺字段，读取侧用默认值/防御式读取兜底（见 settingsSlice.hydrate）。
export interface AppState {
  showAll: boolean;
  logAll: boolean;
  kaEnabled: boolean;
  autoInject: boolean;
  autoSec: number;
  stayAwake: boolean;
  synthBeat: boolean;
  synthSec: number;
  synthMode: SynthMode;
  pulseMode: boolean;
  pulseSec: number;
  pulseMin: boolean;
  targets: PersistedTarget[];
}
