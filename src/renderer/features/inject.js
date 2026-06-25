import { state } from '../state.js';
import { api } from '../lib/api.js';
import { status } from '../lib/dom.js';
import { curTarget } from '../ui/targets.js';
import { saveConfig, baseName } from './persistence.js';

export async function doInject() {
  const t = curTarget();
  if (!t) {
    status('请先选择一个目标窗口', 'err');
    return;
  }
  if (t.offline) {
    status('该目标当前离线（对应程序未运行），无法注入', 'err');
    return;
  }
  await saveConfig();
  status(`正在注入到 PID ${t.pid} …`);
  const r = await api.inject(t.pid, state.dllPath);
  status('[注入] ' + r.msg, r.ok ? 'ok' : 'err');
}

export async function doEject() {
  const t = curTarget();
  if (!t) {
    status('请先选择一个目标窗口', 'err');
    return;
  }
  if (t.offline) {
    status('该目标当前离线，无法卸载', 'err');
    return;
  }
  const r = await api.eject(t.pid, baseName(state.dllPath));
  status('[卸载] ' + r.msg, r.ok ? 'ok' : 'err');
}

export async function doApply() {
  await saveConfig();
  const t = curTarget();
  if (!t) {
    status('配置已保存。选中一个已注入的窗口再点应用即可热生效。');
    return;
  }
  if (t.offline) {
    status('该目标当前离线，无法应用', 'err');
    return;
  }
  const r = await api.reload(t.pid, state.dllPath);
  status('[应用] ' + r.msg, r.ok ? 'ok' : 'err');
}
