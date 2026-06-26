// DLL 拦截日志解析得到的、按 pid 聚合的挂钩状态——供规则卡“挂钩状态”徽章使用。
// key = 'kind|dll|func'（小写），见 domain/hookLog.ruleHookKey。
export interface HookStats {
  installs: Record<string, number>; // 'kind|dll|func' -> 挂上的 IAT 槽位数
  hits: Record<string, number>; // 'kind|dll|func' -> 命中次数
  active: boolean;
  strips: number; // uncapture 剥离的窗口数
  ts: string | null;
}

export type HookStatsByPid = Record<number, HookStats>;

// 一行拦截日志解析出的结构化事件。
export type HookEventType =
  | 'raw'
  | 'log'
  | 'start'
  | 'rule'
  | 'done'
  | 'stat'
  | 'uncapture'
  | 'stop'
  | 'reload'
  | 'fail';

export interface HookEvent {
  type: HookEventType;
  pid: number | null;
  ts: string | null;
  body?: string;
  raw: string;
  kind?: string;
  dll?: string;
  func?: string;
  call?: boolean;
  ret?: boolean;
  slots?: number;
  hits?: number;
  strips?: number;
}

// 主进程 tail 推送给渲染层的增量负载。reset=true 表示日志被截断/轮转，需清空。
export interface HookLogPayload {
  lines?: string[];
  reset?: boolean;
}
