import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useAntiSleep() {
  const synthCdRef = useRef(0);
  const pulseCdRef = useRef(0);
  const pulseBusyRef = useRef(false);

  // Reset countdowns immediately when toggles are switched on
  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state, prev) => {
      if (state.synthBeat && !prev.synthBeat) synthCdRef.current = 0;
      if (state.pulseMode && !prev.pulseMode) pulseCdRef.current = 0;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const s = useSettingsStore.getState();

      if (s.synthBeat && --synthCdRef.current <= 0) {
        synthCdRef.current = Math.min(300, Math.max(5, s.synthSec));
        api.synthInput({ mode: s.synthMode }).catch(() => {});
      }

      if (s.pulseMode && --pulseCdRef.current <= 0) {
        pulseCdRef.current = Math.min(900, Math.max(30, s.pulseSec));
        runPulse(false);
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  async function runPulse(manual: boolean) {
    const { setStatus } = useUiStore.getState();

    if (pulseBusyRef.current) {
      if (manual) setStatus('前台脉冲正忙，稍候…', 'err');
      return;
    }

    const { targets } = useTargetsStore.getState();
    const pulseTargets = targets.filter((t) => !t.offline && t.hwnd);
    if (!pulseTargets.length) {
      if (manual) setStatus('前台脉冲：当前没有在线目标窗口 —— 先在顶部选中无影/串流窗口点「加入目标」', 'err');
      return;
    }

    pulseBusyRef.current = true;
    try {
      const prev = await api.getForeground();
      const prevIsTarget = pulseTargets.some((t) => String(t.hwnd) === prev);
      const { pulseMin } = useSettingsStore.getState();
      let pulsed = 0, failed = 0;

      for (const t of pulseTargets) {
        const hwnd = String(t.hwnd);
        const label = `${t.process}（hwnd ${hwnd}）`;

        if (prev === hwnd) {
          await api.synthInput({ mode: 'mouse' });
          setStatus(`前台脉冲：${label} 已在前台，直接喂真实鼠标（零闪烁、不最小化）`, 'ok');
          pulsed++;
          continue;
        }

        const r = await api.focusWindow(hwnd);
        if (r?.focused) {
          await sleep(140);
          await api.synthInput({ mode: 'mouse' });
          await sleep(40);
          let minTxt = '';
          if (pulseMin) {
            const m = await api.minimizeWindow(hwnd);
            minTxt = m?.ok ? ' · 最小化✓' : ' · 最小化✗';
          }
          setStatus(`前台脉冲：${label} 切前台✓ · 喂真实鼠标✓${minTxt}`, 'ok');
          pulsed++;
        } else {
          setStatus(
            `前台脉冲：${label} 切前台失败（被系统前台锁拦截或窗口已失效）${r?.msg ? ' — ' + r.msg : ''}`,
            'err',
          );
          failed++;
        }
      }

      if (prev && prev !== '0' && !prevIsTarget) {
        api.focusWindow(prev).catch(() => {});
      }
      if (manual) {
        setStatus(
          `前台脉冲：本轮完成 — 成功 ${pulsed} 个${failed ? `，失败 ${failed} 个` : ''}`,
          failed ? 'err' : 'ok',
        );
      }
    } catch (e) {
      useUiStore.getState().setStatus('前台脉冲异常：' + String(e), 'err');
    } finally {
      pulseBusyRef.current = false;
    }
  }

  return {
    doPulseNow: () => runPulse(true),
  };
}
