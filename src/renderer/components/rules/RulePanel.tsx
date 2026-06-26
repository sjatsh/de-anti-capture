import { useState } from 'react';
import { useTargetsStore } from '../../store/targetsStore';
import { useHookLogStore } from '../../store/hookLogStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import type { Rule } from '@shared/types';
import { Icon } from '../icons/Icon';
import { RuleCard } from './RuleCard';
import { RuleEditorModal } from './RuleEditorModal';

export function RulePanel() {
  const targets = useTargetsStore((s) => s.targets);
  const selTargetUid = useTargetsStore((s) => s.selTargetUid);
  const selRuleIndex = useTargetsStore((s) => s.selRuleIndex);
  const verifyResults = useTargetsStore((s) => s.verifyResults);
  const hookStats = useHookLogStore((s) => s.hookStats);
  const { selectRule, addRule, updateRule, removeRule, clearTargetVerify } = useTargetsStore.getState();
  const setStatus = useUiStore((s) => s.setStatus);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const target = targets.find((t) => t.uid === selTargetUid) ?? null;

  async function saveConfigNow() {
    const { targets: ts, dllPath } = useTargetsStore.getState();
    const { logAll } = useSettingsStore.getState();
    const onlineTargets = ts.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules }));
    const r = await api.saveConfig(dllPath, onlineTargets, { logAll });
    if (r && !r.ok) setStatus('保存配置失败: ' + r.msg, 'err');
  }

  function openNewRule() {
    if (!target) { setStatus('请先选择一个目标窗口', 'err'); return; }
    setEditingRule(null);
    setEditingIdx(null);
    setEditorOpen(true);
  }

  function openEditRule() {
    if (!target || selRuleIndex < 0) { setStatus('请先选中一条规则', 'err'); return; }
    setEditingRule(target.rules[selRuleIndex]);
    setEditingIdx(selRuleIndex);
    setEditorOpen(true);
  }

  async function handleConfirm(rule: Rule) {
    if (!target) return;
    setEditorOpen(false);
    clearTargetVerify(target.uid);
    if (editingIdx != null) {
      updateRule(target.uid, editingIdx, rule);
      setStatus('已修改规则：' + rule.name);
    } else {
      addRule(target.uid, rule);
      setStatus('已添加规则：' + rule.name + (rule.kind !== 'keepalive' ? '（hook 规则，记得对该窗口注入/应用）' : ''));
    }
    await saveConfigNow();
  }

  async function handleDeleteRule() {
    if (!target || selRuleIndex < 0) { setStatus('请先选中一条规则', 'err'); return; }
    clearTargetVerify(target.uid);
    removeRule(target.uid, selRuleIndex);
    await saveConfigNow();
  }

  async function handleToggle(uid: string, idx: number, enabled: boolean) {
    const { targets: ts } = useTargetsStore.getState();
    const t = ts.find((x) => x.uid === uid);
    if (!t) return;
    const rule = { ...t.rules[idx], enabled };
    updateRule(uid, idx, rule);
    await saveConfigNow();
  }

  return (
    <>
      <div className="panel rules">
        <div className="panel-head">
          <Icon name="layers" className="head-ico" />
          <span className="panel-title">选中窗口的规则</span>
          {target && <span className="hint">{target.process} · {target.rules.length} 条</span>}
          <span className="spacer" />
          <button className="btn primary" onClick={openNewRule}><Icon name="plus" />添加规则</button>
          <button className="btn ghost icononly" title="编辑" onClick={openEditRule}><Icon name="edit" /></button>
          <button className="btn ghost danger icononly" title="删除" onClick={handleDeleteRule}><Icon name="trash" /></button>
        </div>

        <div className="list rulelist">
          {!target ? (
            <div className="empty"><Icon name="target" />选择左侧一个目标窗口</div>
          ) : target.rules.length === 0 ? (
            <div className="empty"><Icon name="plus" />点"添加规则"给该窗口加规则</div>
          ) : (
            target.rules.map((r, i) => (
              <RuleCard
                key={i}
                target={target}
                rule={r}
                ruleIndex={i}
                selected={selRuleIndex === i}
                hookStats={hookStats}
                verifyResult={verifyResults[`${target.uid}:${i}`]}
                onSelect={selectRule}
                onEdit={() => { setEditingRule(r); setEditingIdx(i); setEditorOpen(true); }}
                onToggle={(en) => handleToggle(target.uid, i, en)}
              />
            ))
          )}
        </div>
      </div>

      <RuleEditorModal
        open={editorOpen}
        initialRule={editingRule}
        onConfirm={handleConfirm}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}
