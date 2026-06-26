import fs from 'node:fs';
import type { AppState, OkResult } from '@shared/types';
import { stateFile } from './paths';

// 应用状态（目标/规则/设置）读写 → userData/state.json。
// 读失败返回 null；写失败返回 {ok:false,msg}，与渲染层 loadState()/persist() 契约一致。
export function loadState(): AppState | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as AppState;
  } catch {
    return null;
  }
}

export function saveState(s: AppState): OkResult {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: String((err as Error)?.message || err) };
  }
}
