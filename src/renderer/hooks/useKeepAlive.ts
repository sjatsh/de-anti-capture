import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useSettingsStore } from '../store/settingsStore';

// Tracks keepalive countdown per rule: key = `${uid}:${ruleIndex}`
export function useKeepAlive() {
  const cdRef = useRef(new Map<string, number>());

  useEffect(() => {
    const id = setInterval(() => {
      const { kaEnabled } = useSettingsStore.getState();
      const { pulseMode } = useSettingsStore.getState();
      if (!kaEnabled) return;

      const { targets } = useTargetsStore.getState();
      for (const t of targets) {
        if (t.offline || !t.hwnd) continue;
        for (let i = 0; i < t.rules.length; i++) {
          const r = t.rules[i];
          if (r.kind !== 'keepalive' || !r.enabled) continue;
          if (pulseMode) continue; // pulse mode supersedes wiggle for remote scenarios
          const key = `${t.uid}:${i}`;
          const prev = cdRef.current.get(key) ?? r.intervalSec;
          const cd = prev - 1;
          if (cd <= 0) {
            api.wiggle(t.hwnd, t.pid).catch(() => {});
            cdRef.current.set(key, Math.max(1, r.intervalSec));
          } else {
            cdRef.current.set(key, cd);
          }
        }
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);
}
