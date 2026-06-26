import { create } from 'zustand';
import type { HookEvent, HookStatsByPid, HookStats } from '@shared/types';
import { parseHookLine, ruleHookKey } from '../lib/hookparse';

export interface HookLine {
  ev: HookEvent;
  cls: string;
}

interface HookLogState {
  hookLines: HookLine[];
  hookStats: HookStatsByPid;
  hookUnread: number;
  view: 'activity' | 'hook';

  ingestLines(lines: string[], isSeed: boolean): void;
  resetLog(): void;
  setView(view: 'activity' | 'hook'): void;
  clearUnread(): void;
}

const VIEW_CAP = 400;

function cls(ev: HookEvent): string {
  if (ev.type === 'rule') return (ev.slots ?? 0) > 0 ? 'ok' : 'err';
  if (ev.type === 'fail') return 'err';
  if (ev.type === 'start' || ev.type === 'reload' || ev.type === 'done') return 'info';
  if (ev.type === 'stop') return 'warn';
  if (ev.type === 'uncapture') return 'ok';
  if (ev.type === 'stat') return 'obs';
  return '';
}

function applyEvent(stats: HookStatsByPid, ev: HookEvent): HookStatsByPid {
  const pid = ev.pid;
  if (pid == null) return stats;

  const prev: HookStats = stats[pid] ?? { installs: {}, hits: {}, active: false, strips: 0, ts: null };
  const ts = ev.ts ?? prev.ts;

  if (ev.type === 'start' || ev.type === 'reload') {
    return { ...stats, [pid]: { installs: {}, hits: {}, active: true, strips: 0, ts } };
  }
  if (ev.type === 'rule' && ev.kind && ev.slots != null) {
    const key = ruleHookKey(ev.kind, ev.dll, ev.func);
    return {
      ...stats,
      [pid]: { ...prev, ts, active: true, installs: { ...prev.installs, [key]: ev.slots } },
    };
  }
  if (ev.type === 'stat' && ev.kind) {
    const key = ruleHookKey(ev.kind, ev.dll, ev.func);
    return {
      ...stats,
      [pid]: { ...prev, ts, hits: { ...prev.hits, [key]: ev.hits ?? 0 } },
    };
  }
  if (ev.type === 'uncapture') {
    return { ...stats, [pid]: { ...prev, ts, strips: ev.strips ?? 0 } };
  }
  if (ev.type === 'stop') {
    return { ...stats, [pid]: { installs: {}, hits: {}, active: false, strips: prev.strips, ts } };
  }
  return stats;
}

export const useHookLogStore = create<HookLogState>((set) => ({
  hookLines: [],
  hookStats: {},
  hookUnread: 0,
  view: 'activity',

  ingestLines: (lines, isSeed) =>
    set((s) => {
      const newLines: HookLine[] = [];
      let hookStats = s.hookStats;
      let shownCount = 0;

      for (const raw of lines) {
        const ev = parseHookLine(raw);
        if (ev.type !== 'stat' || ev.kind === 'obs') {
          newLines.push({ ev, cls: cls(ev) });
          shownCount++;
        }
        const next = applyEvent(hookStats, ev);
        if (next !== hookStats) hookStats = next;
      }

      let all = [...s.hookLines, ...newLines];
      if (all.length > VIEW_CAP) all = all.slice(all.length - VIEW_CAP);

      const addUnread = !isSeed && shownCount > 0 && s.view !== 'hook' ? shownCount : 0;

      return { hookLines: all, hookStats, hookUnread: s.hookUnread + addUnread };
    }),

  resetLog: () => set({ hookLines: [], hookStats: {}, hookUnread: 0 }),
  setView: (view) => set({ view }),
  clearUnread: () => set({ hookUnread: 0 }),
}));
