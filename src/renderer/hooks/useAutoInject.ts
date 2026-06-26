import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useWindowsStore } from '../store/windowsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import type { Target, Rule } from '@shared/types';

function needsInject(t: Target): boolean {
  return (t.rules || []).some(
    (r: Rule) =>
      r.enabled && (r.kind === 'idle' || r.kind === 'hook' || r.kind === 'fg' || r.kind === 'uncapture' || r.kind === 'cursor'),
  );
}

export function useAutoInject() {
  const cdRef = useRef(0);
  const busyRef = useRef(false);

  // Reset countdown to trigger immediately when autoInject is toggled on
  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state, prev) => {
      if (state.autoInject && !prev.autoInject) cdRef.current = 0;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const { autoInject, autoSec } = useSettingsStore.getState();
      if (!autoInject) return;
      if (--cdRef.current > 0) return;
      cdRef.current = Math.min(60, Math.max(2, autoSec));

      if (busyRef.current) return;
      busyRef.current = true;

      try {
        const { showAll } = useWindowsStore.getState();
        const windows = await api.listWindows(showAll);
        const list = Array.isArray(windows) ? windows : [];
        useWindowsStore.getState().setWindows(list);
        useTargetsStore.getState().rebindTargets(list);

        const { targets, dllPath } = useTargetsStore.getState();
        const { logAll } = useSettingsStore.getState();
        const { setStatus } = useUiStore.getState();

        const need: Target[] = [];
        for (const t of targets) {
          if (t.offline || !t.hwnd || !needsInject(t)) continue;
          if (!(await api.moduleLoaded(t.pid))) need.push(t);
        }

        if (need.length) {
          const onlineTargets = targets
            .filter((t) => !t.offline)
            .map((t) => ({ pid: t.pid, rules: t.rules }));
          await api.saveConfig(dllPath, onlineTargets, { logAll });

          for (const t of need) {
            const res = await api.inject(t.pid, dllPath);
            setStatus(
              `自动注入：${res.ok ? '✓' : '✗'} ${t.process}（PID ${t.pid}）${res.ok ? '' : ' — ' + res.msg}`,
              res.ok ? 'ok' : 'err',
            );
          }
        }
      } catch (e) {
        useUiStore.getState().setStatus('自动注入巡检异常：' + String(e), 'err');
      } finally {
        busyRef.current = false;
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);
}
