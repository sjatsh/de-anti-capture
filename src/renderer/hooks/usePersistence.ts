import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useWindowsStore } from '../store/windowsStore';

export function usePersistence() {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save when settings or targets change
  useEffect(() => {
    const unsubSettings = useSettingsStore.subscribe(() => scheduleSave());
    const unsubTargets = useTargetsStore.subscribe(() => scheduleSave());
    const unsubWindows = useWindowsStore.subscribe((s, prev) => {
      if (s.showAll !== prev.showAll) scheduleSave();
    });

    return () => {
      unsubSettings();
      unsubTargets();
      unsubWindows();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 300);
  }

  function doSave() {
    const s = useSettingsStore.getState();
    const { targets } = useTargetsStore.getState();
    const { showAll } = useWindowsStore.getState();

    api.saveState({
      showAll,
      logAll: s.logAll,
      kaEnabled: s.kaEnabled,
      autoInject: s.autoInject,
      autoSec: s.autoSec,
      stayAwake: s.stayAwake,
      synthBeat: s.synthBeat,
      synthSec: s.synthSec,
      synthMode: s.synthMode,
      pulseMode: s.pulseMode,
      pulseSec: s.pulseSec,
      pulseMin: s.pulseMin,
      targets: targets.map((t) => ({
        process: t.process,
        title: t.title,
        pid: t.pid,
        rules: t.rules,
      })),
    }).catch(() => {});
  }
}
