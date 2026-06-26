// 一条拦截/保活规则。这是持久化与配置序列化的规范形状（不含运行时字段，
// 旧实现里挂在 keepalive 规则上的 _cd 倒计时已移出，改由渲染层运行时单独跟踪）。
export type RuleKind = 'keepalive' | 'idle' | 'fg' | 'uncapture' | 'cursor' | 'hook';

// hook 入参覆盖：4 个槽（x64 前 4 个寄存器参数 RCX/RDX/R8/R9）；
// 每槽是值字符串（十进制或 0x 十六进制）或 null = 不改。
export type RuleArgs = [string | null, string | null, string | null, string | null];

export interface Rule {
  kind: RuleKind;
  enabled: boolean;
  name: string;
  /** keepalive：发送 WM_MOUSEMOVE 的间隔秒数 */
  intervalSec: number;
  /** idle/fg/cursor/uncapture/hook：被钩函数所在模块，如 user32.dll */
  dll: string;
  /** idle/fg/cursor/uncapture/hook：被钩函数名 */
  func: string;
  /** hook：入参覆盖（前 4 个寄存器参数） */
  args: RuleArgs;
  /** hook：是否调用原函数（false = 完全拦截，直接返回 retOverride） */
  callOriginal: boolean;
  /** hook：覆盖返回值（null = 不改） */
  retOverride: string | null;
}
