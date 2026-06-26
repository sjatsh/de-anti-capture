import { memo } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import type { Target, Rule } from '@shared/types';
import type { HookStatsByPid } from '@shared/types';
import type { VerifyResult } from '../../store/targetsStore';
import { kindLabel, ruleDetail } from '../../lib/format';
import { ruleHookKey } from '../../lib/hookparse';
import { Icon } from '../icons/Icon';
import { api } from '../../lib/api';
import { useTargetsStore } from '../../store/targetsStore';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';

interface RuleCardProps {
  target: Target;
  rule: Rule;
  ruleIndex: number;
  selected: boolean;
  hookStats: HookStatsByPid;
  verifyResult: VerifyResult | undefined;
  onSelect: (idx: number) => void;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
}

function hookBadge(t: Target, r: Rule, hookStats: HookStatsByPid): ReactNode {
  if (r.kind === 'keepalive') return null;
  const s = hookStats[t.pid];
  if (!s?.active) return null;
  const key = ruleHookKey(r.kind, r.dll, r.func);
  const slots = s.installs[key];
  if (slots == null) return null;
  if (slots <= 0) {
    return (
      <span className="hookstat off" title="已注入但 0 处命中：目标没在导入表里静态调用此函数(IAT 盲区)，或 DLL/函数名不符">
        ✗ 0 处
      </span>
    );
  }
  const hits = s.hits?.[key] ?? 0;
  const hitTxt = hits > 0 ? ` · 命中 ${hits > 99999 ? Math.floor(hits / 1000) + 'k' : hits}` : '';
  const title = hits > 0
    ? `已在 ${slots} 个模块挂钩；被调用 ${hits} 次（实时计数）`
    : `已在 ${slots} 个模块的导入表挂上此钩子，尚未被调用`;
  return <span className="hookstat on" title={title}>✓ 已挂 {slots}{hitTxt}</span>;
}

export const RuleCard = memo(function RuleCard({
  target: t,
  rule: r,
  ruleIndex: idx,
  selected,
  hookStats,
  verifyResult: vr,
  onSelect,
  onEdit,
  onToggle,
}: RuleCardProps) {
  const setVerifyResult = useTargetsStore((s) => s.setVerifyResult);
  const setStatus = useUiStore((s) => s.setStatus);
  const { dllPath, targets } = useTargetsStore.getState();
  const { logAll } = useSettingsStore.getState();

  async function handleVerify(e: MouseEvent) {
    e.stopPropagation();
    const key = `${t.uid}:${idx}`;
    setVerifyResult(key, { cls: 'run', text: '验证中…（起探针 → 注入该规则 → 对比注入前后）' });
    setStatus(`验证「${r.name}」中…`);
    try {
      const res = await api.verifyRule(r);
      if (!res?.ok) {
        setVerifyResult(key, { cls: 'fail', text: '验证失败：' + (res?.msg || '未知错误') });
        setStatus('验证失败：' + (res?.msg || ''), 'err');
      } else {
        const mark = res.pass === true ? '✓ 通过' : res.pass === false ? '✗ 未生效' : '○ 不确定';
        const cls = res.pass === true ? 'pass' : res.pass === false ? 'fail' : 'neutral';
        const ba = res.before !== '-' || res.after !== '-' ? ` （注入前 ${res.before} → 注入后 ${res.after}）` : '';
        setVerifyResult(key, { cls, text: `${mark} · ${res.detail}${ba}` });
        setStatus(`验证「${r.name}」：${mark} — ${res.detail}`, res.pass === false ? 'err' : 'ok');
      }
    } catch (err) {
      setVerifyResult(key, { cls: 'fail', text: '验证异常：' + String(err) });
      setStatus('验证失败：' + String(err), 'err');
    }

    const onlineTargets = targets.filter((x) => !x.offline).map((x) => ({ pid: x.pid, rules: x.rules }));
    await api.saveConfig(dllPath, onlineTargets, { logAll }).catch(() => {});
  }

  function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    onToggle(!r.enabled);
  }

  return (
    <div
      className={`card${selected ? ' sel' : ''}${r.enabled ? '' : ' rule-off'}`}
      onClick={() => onSelect(idx)}
      onDoubleClick={onEdit}
    >
      <input
        type="checkbox"
        className="rulecheck"
        checked={r.enabled}
        onClick={handleToggle}
        onChange={() => {}}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t1">
          <span className={`badge ${r.kind}`}>{kindLabel(r.kind)}</span>
          <span className="name">{r.name}</span>
          {hookBadge(t, r, hookStats)}
        </div>
        <div className="rule-detail">{ruleDetail(r)}</div>
        {vr && <div className={`verify-result ${vr.cls}`}>{vr.text}</div>}
      </div>
      <button
        className="rule-verify"
        title="验证：起探针、只注入这一条规则，对比注入前后观测值，判定是否真的生效"
        onClick={handleVerify}
      >
        <Icon name="shield" />
      </button>
    </div>
  );
});
