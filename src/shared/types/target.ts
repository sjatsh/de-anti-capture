import type { Rule } from './rule';

// 目标窗口（用户加入的、要保活/注入的窗口）。uid 是渲染层运行时身份，
// hwnd/pid/offline 随窗口枚举与重绑动态变化。
export interface Target {
  uid: string;
  hwnd: string | null;
  pid: number;
  title: string;
  process: string;
  offline: boolean;
  rules: Rule[];
}

// 持久化进 state.json 的子集（按 进程名+标题 在重启后重绑窗口）。
export interface PersistedTarget {
  process: string;
  title: string;
  pid: number;
  rules: Rule[];
}

// 序列化进 rules.txt 给 DLL 的子集（仅在线目标，按 PID 标注）。
export interface ConfigTarget {
  pid: number;
  rules: Rule[];
}
