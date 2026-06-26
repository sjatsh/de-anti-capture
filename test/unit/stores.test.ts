import { describe, it, expect, beforeEach } from 'vitest';
import { useTargetsStore } from '@/store/targetsStore';
import { useHookLogStore } from '@/store/hookLogStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { mkWindow, mkRule } from '../helpers';

describe('targetsStore', () => {
  beforeEach(() => {
    useTargetsStore.setState({ targets: [], selTargetUid: null, selRuleIndex: -1, verifyResults: {} });
  });

  it('addTarget creates an online target seeded with a keepalive rule and selects it', () => {
    useTargetsStore.getState().addTarget(mkWindow({ hwnd: '500', pid: 50, process: 'chrome', title: 'X' }));
    const s = useTargetsStore.getState();
    expect(s.targets).toHaveLength(1);
    expect(s.targets[0].offline).toBe(false);
    expect(s.targets[0].rules[0].kind).toBe('keepalive');
    expect(s.selTargetUid).toBe(s.targets[0].uid);
  });

  it('addTarget does not duplicate an already-online window', () => {
    const { addTarget } = useTargetsStore.getState();
    const w = mkWindow({ hwnd: '500', pid: 50 });
    addTarget(w);
    addTarget(w);
    expect(useTargetsStore.getState().targets).toHaveLength(1);
  });

  it('rebindTargets marks missing windows offline, then re-binds by process+title on a new hwnd', () => {
    useTargetsStore.getState().addTarget(mkWindow({ hwnd: '500', pid: 50, process: 'chrome', title: 'X' }));

    useTargetsStore.getState().rebindTargets([]);
    let t = useTargetsStore.getState().targets[0];
    expect(t.offline).toBe(true);
    expect(t.hwnd).toBeNull();

    useTargetsStore.getState().rebindTargets([mkWindow({ hwnd: '777', pid: 51, process: 'chrome', title: 'X' })]);
    t = useTargetsStore.getState().targets[0];
    expect(t.offline).toBe(false);
    expect(t.hwnd).toBe('777');
    expect(t.pid).toBe(51);
  });

  it('addRule / updateRule / removeRule mutate the target rule list immutably', () => {
    useTargetsStore.getState().addTarget(mkWindow({ hwnd: '1', pid: 1 }));
    const uid = useTargetsStore.getState().targets[0].uid;

    useTargetsStore.getState().addRule(uid, mkRule({ kind: 'idle' }));
    expect(useTargetsStore.getState().targets[0].rules).toHaveLength(2);

    useTargetsStore.getState().updateRule(uid, 1, mkRule({ kind: 'hook', name: 'changed' }));
    expect(useTargetsStore.getState().targets[0].rules[1].name).toBe('changed');

    useTargetsStore.getState().removeRule(uid, 0);
    const rules = useTargetsStore.getState().targets[0].rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].kind).toBe('hook');
  });
});

describe('hookLogStore', () => {
  beforeEach(() => {
    useHookLogStore.setState({ hookLines: [], hookStats: {}, hookUnread: 0, view: 'activity' });
  });

  it('ingests a rule line into per-pid install stats and counts it unread', () => {
    useHookLogStore
      .getState()
      .ingestLines(['[12:00:00.000 pid=42] rule[idle] user32.dll!GetLastInputInfo call=1 ret=0 -> 2 slots'], false);
    const s = useHookLogStore.getState();
    expect(s.hookStats[42].active).toBe(true);
    expect(s.hookStats[42].installs['idle|user32.dll|getlastinputinfo']).toBe(2);
    expect(s.hookLines).toHaveLength(1);
    expect(s.hookUnread).toBe(1);
  });

  it('does not raise unread for seed replay', () => {
    useHookLogStore.getState().ingestLines(['[12:00:00.000 pid=1] === StartHooking'], true);
    expect(useHookLogStore.getState().hookUnread).toBe(0);
  });

  it('records non-obs STAT hits without adding a visible line', () => {
    const ingest = useHookLogStore.getState().ingestLines;
    ingest(['[12:00:00.000 pid=7] rule[idle] user32.dll!GetLastInputInfo call=1 ret=0 -> 1 slots'], true);
    ingest(['[12:00:01.000 pid=7] STAT kind=idle dll=user32.dll func=GetLastInputInfo hits=9'], false);
    const s = useHookLogStore.getState();
    expect(s.hookStats[7].hits['idle|user32.dll|getlastinputinfo']).toBe(9);
    // only the rule line is visible; the non-obs STAT line is suppressed
    expect(s.hookLines).toHaveLength(1);
  });

  it('resetLog clears everything', () => {
    useHookLogStore.getState().ingestLines(['[12:00:00.000 pid=1] === StartHooking'], false);
    useHookLogStore.getState().resetLog();
    const s = useHookLogStore.getState();
    expect(s.hookLines).toHaveLength(0);
    expect(s.hookStats).toEqual({});
    expect(s.hookUnread).toBe(0);
  });
});

describe('settingsStore', () => {
  it('set updates a single key; restore merges a partial', () => {
    useSettingsStore.getState().set('autoSec', 12);
    expect(useSettingsStore.getState().autoSec).toBe(12);

    useSettingsStore.getState().restore({ pulseMode: true, synthSec: 99 });
    const s = useSettingsStore.getState();
    expect(s.pulseMode).toBe(true);
    expect(s.synthSec).toBe(99);
  });
});

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ activityLines: [], statusMsg: '', statusCls: '' });
  });

  it('setStatus updates the bar and appends a timestamped activity line', () => {
    useUiStore.getState().setStatus('hello', 'ok');
    const s = useUiStore.getState();
    expect(s.statusMsg).toBe('hello');
    expect(s.statusCls).toBe('ok');
    expect(s.activityLines).toHaveLength(1);
    expect(s.activityLines[0].msg).toBe('hello');
    expect(s.activityLines[0].ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('caps the activity log at 250 lines', () => {
    for (let i = 0; i < 260; i++) useUiStore.getState().setStatus('line ' + i);
    expect(useUiStore.getState().activityLines).toHaveLength(250);
  });
});
