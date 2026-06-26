import { useTargetsStore } from '../../store/targetsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import { Icon } from '../icons/Icon';

export function ActionBar() {
  const setStatus = useUiStore((s) => s.setStatus);

  async function saveConfig() {
    const { targets, dllPath } = useTargetsStore.getState();
    const { logAll } = useSettingsStore.getState();
    const onlineTargets = targets.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules }));
    const r = await api.saveConfig(dllPath, onlineTargets, { logAll });
    if (r && !r.ok) setStatus('保存配置失败: ' + r.msg, 'err');
  }

  function curTarget() {
    const { targets, selTargetUid } = useTargetsStore.getState();
    return targets.find((t) => t.uid === selTargetUid) ?? null;
  }

  async function doInject() {
    const t = curTarget();
    if (!t) { setStatus('请先选择一个目标窗口', 'err'); return; }
    if (t.offline) { setStatus('该目标当前离线（对应程序未运行），无法注入', 'err'); return; }
    await saveConfig();
    setStatus(`正在注入到 PID ${t.pid} …`);
    const r = await api.inject(t.pid, useTargetsStore.getState().dllPath);
    setStatus('[注入] ' + r.msg, r.ok ? 'ok' : 'err');
  }

  async function doEject() {
    const t = curTarget();
    if (!t) { setStatus('请先选择一个目标窗口', 'err'); return; }
    if (t.offline) { setStatus('该目标当前离线，无法卸载', 'err'); return; }
    const dll = useTargetsStore.getState().dllPath;
    const name = (dll || '').split(/[\\/]/).pop();
    const r = await api.eject(t.pid, name);
    setStatus('[卸载] ' + r.msg, r.ok ? 'ok' : 'err');
  }

  async function doApply() {
    await saveConfig();
    const t = curTarget();
    if (!t) { setStatus('配置已保存。选中一个已注入的窗口再点应用即可热生效。'); return; }
    if (t.offline) { setStatus('该目标当前离线，无法应用', 'err'); return; }
    const r = await api.reload(t.pid, useTargetsStore.getState().dllPath);
    setStatus('[应用] ' + r.msg, r.ok ? 'ok' : 'err');
  }

  return (
    <div className="dllrow">
      <span className="lbl"><Icon name="folder" />拦截 DLL</span>
      <span className="dll-badge" title="拦截 DLL 已内置并随程序一起打包，注入时自动使用，无需手动选择">
        内置 ✓
      </span>
      <span className="spacer" />
      <button className="btn primary" onClick={doInject}><Icon name="inject" />注入</button>
      <button className="btn ghost" onClick={doEject}><Icon name="eject" />卸载</button>
      <button className="btn accent" onClick={doApply}><Icon name="zap" />应用规则</button>
    </div>
  );
}
