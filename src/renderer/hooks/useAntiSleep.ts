import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTargetsStore } from '../store/targetsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 前台脉冲喂给「窗口内远端」的输入。无影 stream_viewer 实测靠轮询 GetCursorPos 读鼠标，
// 所以必须让光标「真正走位」并停留足够长，横跨多次轮询采样才会被读到、转发到远端——
// 单次 ±1px 瞬时净零微移会在两次轮询之间回到原点而被整体漏掉（这是“喂了没用”的根因）。
// 这里让光标沿一个小方块走一圈（净零回到原点），约 240ms；末尾再补一记无害 F15 按键，
// 同时覆盖「键盘走窗口消息」的客户端（双保险，按实测鼠标其实已足够）。
const PULSE_STEPS: ReadonlyArray<readonly [number, number]> = [
  [14, 0],
  [0, 14],
  [-14, 0],
  [0, -14],
  [10, 10],
  [-10, -10],
];

async function feedRemoteInput(): Promise<void> {
  for (const [dx, dy] of PULSE_STEPS) {
    await api.synthInput({ mode: 'mouse', dx, dy });
    await sleep(40);
  }
  await api.synthInput({ mode: 'key' });
}

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
          await feedRemoteInput();
          setStatus(`前台脉冲：${label} 已在前台，直接喂真实输入（光标走位+F15，零闪烁、不最小化）`, 'ok');
          pulsed++;
          continue;
        }

        const r = await api.focusWindow(hwnd);
        if (r?.focused) {
          await sleep(140); // 等 Qt 激活稳定，之后再喂输入
          await feedRemoteInput(); // 约 240ms 持续走位，横跨远端多次 GetCursorPos 轮询
          let minTxt = '';
          if (pulseMin) {
            const m = await api.minimizeWindow(hwnd);
            minTxt = m?.ok ? ' · 最小化✓' : ' · 最小化✗';
          }
          setStatus(`前台脉冲：${label} 切前台✓ · 喂真实输入✓（光标走位+F15）${minTxt}`, 'ok');
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
