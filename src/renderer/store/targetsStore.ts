import { create } from 'zustand';
import type { Target, Rule, WindowInfo } from '@shared/types';

let _uid = 0;
function newUid() { return 'u' + (++_uid); }

export interface VerifyResult {
  cls: 'run' | 'pass' | 'fail' | 'neutral';
  text: string;
}

interface TargetsState {
  targets: Target[];
  selTargetUid: string | null;
  selRuleIndex: number;
  dllPath: string;
  verifyResults: Record<string, VerifyResult>;

  setDllPath(path: string): void;
  setTargets(targets: Target[]): void;
  selectTarget(uid: string | null): void;
  selectRule(idx: number): void;
  addTarget(w: WindowInfo): void;
  removeTarget(uid: string): void;
  addRule(uid: string, rule: Rule): void;
  updateRule(uid: string, idx: number, rule: Rule): void;
  removeRule(uid: string, idx: number): void;
  rebindTargets(windows: WindowInfo[]): void;
  setVerifyResult(key: string, result: VerifyResult): void;
  clearTargetVerify(uid: string): void;
}

export const useTargetsStore = create<TargetsState>((set) => ({
  targets: [],
  selTargetUid: null,
  selRuleIndex: -1,
  dllPath: '',
  verifyResults: {},

  setDllPath: (dllPath) => set({ dllPath }),

  setTargets: (targets) => set({ targets }),

  selectTarget: (uid) => set({ selTargetUid: uid, selRuleIndex: -1 }),

  selectRule: (idx) => set({ selRuleIndex: idx }),

  addTarget: (w) =>
    set((s) => {
      const exist = s.targets.find((t) => !t.offline && t.hwnd === w.hwnd);
      if (exist) return { selTargetUid: exist.uid };
      const dispTitle = w.title?.trim() ? w.title : `[${w.cls || '无标题'}]`;
      const t: Target = {
        uid: newUid(),
        hwnd: w.hwnd,
        pid: w.pid,
        title: dispTitle,
        process: w.process,
        offline: false,
        rules: [{
          kind: 'keepalive',
          enabled: true,
          intervalSec: 30,
          name: '保活 每30秒',
          args: [null, null, null, null],
          callOriginal: true,
          retOverride: null,
          dll: '',
          func: '',
        }],
      };
      return { targets: [...s.targets, t], selTargetUid: t.uid, selRuleIndex: -1 };
    }),

  removeTarget: (uid) =>
    set((s) => {
      const targets = s.targets.filter((t) => t.uid !== uid);
      const selTargetUid = targets.length
        ? s.selTargetUid === uid ? targets[0].uid : s.selTargetUid
        : null;
      return { targets, selTargetUid, selRuleIndex: -1 };
    }),

  addRule: (uid, rule) =>
    set((s) => {
      const targets = s.targets.map((t) =>
        t.uid === uid ? { ...t, rules: [...t.rules, rule] } : t,
      );
      const target = targets.find((t) => t.uid === uid);
      return { targets, selRuleIndex: target ? target.rules.length - 1 : -1 };
    }),

  updateRule: (uid, idx, rule) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.uid === uid ? { ...t, rules: t.rules.map((r, i) => (i === idx ? rule : r)) } : t,
      ),
    })),

  removeRule: (uid, idx) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.uid === uid ? { ...t, rules: t.rules.filter((_, i) => i !== idx) } : t,
      ),
      selRuleIndex: -1,
    })),

  rebindTargets: (windows) =>
    set((s) => {
      const used = new Set<string>();
      const targets = s.targets.map((t) => {
        if (t.hwnd && windows.some((x) => x.hwnd === t.hwnd)) {
          used.add(t.hwnd);
          return { ...t, offline: false };
        }
        const w =
          windows.find((x) => x.process === t.process && x.title === t.title && !used.has(x.hwnd)) ||
          windows.find((x) => x.process === t.process && !used.has(x.hwnd));
        if (w) {
          used.add(w.hwnd);
          return { ...t, hwnd: w.hwnd, pid: w.pid, title: w.title, offline: false };
        }
        return { ...t, hwnd: null as string | null, offline: true };
      });
      return { targets };
    }),

  setVerifyResult: (key, result) =>
    set((s) => ({ verifyResults: { ...s.verifyResults, [key]: result } })),

  clearTargetVerify: (uid) =>
    set((s) => {
      const verifyResults = { ...s.verifyResults };
      for (const k of Object.keys(verifyResults)) {
        if (k.startsWith(uid + ':')) delete verifyResults[k];
      }
      return { verifyResults };
    }),
}));
