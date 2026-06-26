// shared 类型桶文件——其余各层从 '@shared/types' 统一导入。
export type { WindowInfo } from './window';
export type { Rule, RuleKind, RuleArgs } from './rule';
export type { Target, PersistedTarget, ConfigTarget } from './target';
export type { AppState, SynthMode } from './settings';
export type { HookStats, HookStatsByPid, HookEvent, HookEventType, HookLogPayload } from './hook';
export type { VerifyResult } from './verify';
export type {
  NativeResult,
  FocusResult,
  MinimizeResult,
  SynthResult,
  AwakeResult,
  SaveConfigResult,
  OkResult,
  SynthInputOpts,
  NativeCapabilities,
} from './native';
