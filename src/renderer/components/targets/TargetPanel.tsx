import { useTargetsStore } from '../../store/targetsStore';
import { useUiStore } from '../../store/uiStore';
import { Icon } from '../icons/Icon';
import { TargetCard } from './TargetCard';
import { api } from '../../lib/api';
import { useSettingsStore } from '../../store/settingsStore';

export function TargetPanel() {
  const targets = useTargetsStore((s) => s.targets);
  const selTargetUid = useTargetsStore((s) => s.selTargetUid);
  const { selectTarget, removeTarget } = useTargetsStore.getState();
  const setStatus = useUiStore((s) => s.setStatus);

  async function handleDeleteTarget() {
    const { selTargetUid: uid } = useTargetsStore.getState();
    if (!uid) { setStatus('请先选择一个目标窗口', 'err'); return; }
    const { logAll } = useSettingsStore.getState();
    removeTarget(uid);
    // Update DLL config after removal
    const { targets: remaining, dllPath: dll } = useTargetsStore.getState();
    const onlineTargets = remaining.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules }));
    await api.saveConfig(dll, onlineTargets, { logAll }).catch(() => {});
  }

  return (
    <div className="panel targets">
      <div className="panel-head">
        <Icon name="target" className="head-ico" />
        <span className="panel-title">目标窗口</span>
        <span className="pill count">{targets.length}</span>
        <span className="spacer" />
        <button
          className="btn ghost danger icononly"
          title="移除选中窗口"
          onClick={handleDeleteTarget}
        >
          <Icon name="trash" />
        </button>
      </div>
      <div className="list">
        {targets.length === 0 ? (
          <div className="empty">
            <Icon name="target" />
            从上方"加入目标"开始
          </div>
        ) : (
          targets.map((t) => (
            <TargetCard
              key={t.uid}
              target={t}
              selected={selTargetUid === t.uid}
              onSelect={selectTarget}
            />
          ))
        )}
      </div>
    </div>
  );
}
