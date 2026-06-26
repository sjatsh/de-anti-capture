import { useEffect } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useWindowsStore } from '../store/windowsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import type { Target } from '@shared/types';

export function useInitApp() {
  useEffect(() => {
    let mounted = true;

    async function init() {
      const { setDllPath, setTargets, rebindTargets } = useTargetsStore.getState();
      const { setWindows, setShowAll } = useWindowsStore.getState();
      const { restore: restoreSettings } = useSettingsStore.getState();
      const { setStatus } = useUiStore.getState();

      const dllPath = await api.defaultDll();
      if (!mounted) return;
      setDllPath(dllPath);

      const saved = await api.loadState();
      if (!mounted) return;

      if (!saved) {
        setStatus('就绪。选窗口 → 加入目标 → 给目标加规则；保活即时生效，hook 规则需注入。');
        return;
      }

      restoreSettings({
        kaEnabled: saved.kaEnabled !== false,
        autoInject: !!saved.autoInject,
        autoSec: saved.autoSec || 5,
        logAll: !!saved.logAll,
        stayAwake: !!saved.stayAwake,
        synthBeat: !!saved.synthBeat,
        synthSec: saved.synthSec || 50,
        synthMode: saved.synthMode || 'key',
        pulseMode: !!saved.pulseMode,
        pulseSec: saved.pulseSec || 600,
        pulseMin: saved.pulseMin !== false,
      });
      setShowAll(!!saved.showAll);

      if (saved.stayAwake) {
        api.systemAwake(true).catch(() => {});
      }

      const restoredTargets: Target[] = (saved.targets || []).map((t) => ({
        uid: crypto.randomUUID(),
        hwnd: null,
        pid: t.pid,
        title: t.title,
        process: t.process,
        offline: true,
        rules: t.rules || [],
      }));
      if (!mounted) return;
      setTargets(restoredTargets);

      const windows = await api.listWindows(!!saved.showAll);
      if (!mounted) return;
      const list = Array.isArray(windows) ? windows : [];
      setWindows(list);
      rebindTargets(list);

      const n = restoredTargets.length;
      const offCount = restoredTargets.filter((t) => t.offline).length;
      if (n) {
        setStatus(
          `已恢复 ${n} 个目标` +
            (offCount
              ? `，其中 ${offCount} 个离线（对应程序未运行，刷新或重开后自动重连）`
              : '，配置就绪'),
          offCount ? '' : 'ok',
        );
      } else {
        setStatus('就绪。选窗口 → 加入目标 → 给目标加规则；保活即时生效，hook 规则需注入。');
      }
    }

    init().catch((e) => {
      const { setStatus } = useUiStore.getState();
      setStatus('初始化异常：' + String(e), 'err');
    });

    return () => {
      mounted = false;
    };
  }, []);
}
