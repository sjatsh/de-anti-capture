// 测试夹具：构造完整的 Rule / WindowInfo，省去每个用例重复写全字段。
import type { Rule, RuleKind, WindowInfo } from '@shared/types';

export function mkRule(over: Partial<Rule> & { kind: RuleKind }): Rule {
  return {
    enabled: true,
    name: over.name ?? `${over.kind} 规则`,
    intervalSec: 30,
    dll: '',
    func: '',
    args: [null, null, null, null],
    callOriginal: true,
    retOverride: null,
    ...over,
  };
}

export function mkWindow(over: Partial<WindowInfo> = {}): WindowInfo {
  return {
    hwnd: '1000',
    pid: 100,
    title: '窗口',
    process: 'app',
    cls: 'AppClass',
    visible: true,
    ...over,
  };
}
