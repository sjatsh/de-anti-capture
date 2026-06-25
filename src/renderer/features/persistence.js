import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, status } from '../lib/dom.js';

// 只把活动目标(pid + rules)序列化给主进程写规则文件
export function serialize() {
  return state.targets.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules }));
}

export async function saveConfig() {
  const r = await api.saveConfig(state.dllPath, serialize(), { logAll: state.logAll });
  if (r && !r.ok) status('保存配置失败: ' + r.msg, 'err');
  persist();
}

// 把目标/规则/设置存到本地（userData/state.json），重启后恢复
export function persist() {
  if (state._restoring) return;
  api.saveState({
    showAll: state.showAll,
    logAll: state.logAll,
    kaEnabled: $('kaToggle').checked,
    autoInject: $('autoInject').checked,
    autoSec: parseInt($('autoSec').value, 10) || 5,
    stayAwake: $('stayAwake').checked,
    synthBeat: $('synthBeat').checked,
    synthSec: parseInt($('synthSec').value, 10) || 50,
    synthMode: $('synthMode').value || 'key',
    targets: state.targets.map((t) => ({ process: t.process, title: t.title, pid: t.pid, rules: t.rules })),
  });
}

// 把恢复的/离线的目标按 进程名+标题 重新绑定到当前活动窗口；找不到则标记离线
export function rebindTargets() {
  const used = new Set();
  for (const t of state.targets) {
    if (t.hwnd && state.allWindows.some((x) => x.hwnd === t.hwnd)) {
      used.add(t.hwnd);
      t.offline = false;
      continue;
    }
    let w =
      state.allWindows.find((x) => x.process === t.process && x.title === t.title && !used.has(x.hwnd)) ||
      state.allWindows.find((x) => x.process === t.process && !used.has(x.hwnd));
    if (w) {
      t.hwnd = w.hwnd;
      t.pid = w.pid;
      t.title = w.title;
      t.offline = false;
      used.add(w.hwnd);
    } else {
      t.hwnd = null;
      t.offline = true;
    }
  }
}

export function baseName(p) {
  return (p || '').split(/[\\/]/).pop();
}
