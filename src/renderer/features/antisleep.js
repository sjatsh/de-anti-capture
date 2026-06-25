import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, status } from '../lib/dom.js';
import { persist } from './persistence.js';

// 防休眠增强：三条都走 host 侧原生、无需注入，与「保活定时器(wiggle)」「注入 idle hook」互补。
//   ① 系统级防休眠 stayAwake —— SetThreadExecutionState：阻止整机睡眠/息屏（开关即时生效）。
//   ② 真实输入心跳 synthBeat —— SendInput：定时发真实无害输入，重置系统全局空闲、击退屏保（对“本机”）。
//   ③ 前台脉冲 pulseMode  —— 瞬时切前台 + SendInput + 切回：给“窗口里的远端云电脑”喂真实输入防其休眠。
// 关键区别：wiggle 的 PostMessage(WM_MOUSEMOVE) 不经内核 Raw Input Thread，远端客户端后台根本不读，无效；
// 远端只认“它在前台时真正捕获到”的输入，所以③必须真把目标切前台再发真输入（实测 stream_viewer 走 GetCursorPos）。
let _synthCd = 0;
function synthSec() {
  return Math.min(300, Math.max(5, parseInt($('synthSec').value, 10) || 50));
}
function modeLabel() {
  const m = $('synthMode').value;
  return m === 'mouse' ? '鼠标微移' : m === 'both' ? '按键+微移' : 'F15 按键';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _pulseCd = 0,
  _pulseBusy = false;
function pulseSec() {
  return Math.min(900, Math.max(30, parseInt($('pulseSec').value, 10) || 600));
}
// 脉冲对象 = 勾了「保活」规则、且在线有 hwnd 的目标窗口
function pulseTargets() {
  return state.targets.filter((t) => !t.offline && t.hwnd && (t.rules || []).some((r) => r.kind === 'keepalive' && r.enabled));
}
// 一轮脉冲：记下当前前台 → 逐个把目标切前台发真实鼠标微移 →（可选最小化）→ 切回原前台。
// manual=true 时（点「立即脉冲」）输出更详细的诊断到活动日志，方便确认每一步是否生效。_pulseBusy 防重入。
async function doPulse(manual) {
  if (_pulseBusy) {
    if (manual) status('前台脉冲正忙，稍候…', 'err');
    return;
  }
  const targets = pulseTargets();
  if (!targets.length) {
    // 没目标时静默(定时)/明确报错(手动)，避免“感觉没生效”却不知为何
    if (manual) status('前台脉冲：没有“勾了保活规则”的在线目标 —— 先把无影/串流窗口加入目标，再给它加一条「保活」规则', 'err');
    return;
  }
  _pulseBusy = true;
  try {
    const prev = await api.getForeground(); // 脉冲前的前台窗口，喂完切回它
    const prevIsTarget = targets.some((t) => String(t.hwnd) === prev);
    const minimize = $('pulseMin').checked; // 喂完即最小化：不让目标一直占着桌面
    let pulsed = 0,
      failed = 0;
    for (const t of targets) {
      const hwnd = String(t.hwnd);
      const label = `${t.process}（hwnd ${hwnd}）`;
      if (prev === hwnd) {
        await api.synthInput({ mode: 'mouse' }); // 目标已在前台(你正在用)：直接发，零闪烁、不最小化
        status(`前台脉冲：${label} 已在前台，直接喂真实鼠标（零闪烁、不最小化）`, 'ok');
        pulsed++;
        continue;
      }
      const r = await api.focusWindow(hwnd);
      if (r && r.focused) {
        await sleep(140); // 等前台切换稳定、Qt 处理激活后采集循环复活
        await api.synthInput({ mode: 'mouse' });
        await sleep(40);
        let minTxt = '';
        if (minimize) {
          const m = await api.minimizeWindow(hwnd); // 瞬时弹起→喂输入→立刻最小化回任务栏
          minTxt = m && m.ok ? ' · 最小化✓' : ' · 最小化✗';
        }
        status(`前台脉冲：${label} 切前台✓ · 喂真实鼠标✓${minTxt}`, 'ok');
        pulsed++;
      } else {
        // 切前台失败：通常是系统“前台锁”拦了 SetForegroundWindow，或窗口已不在
        status(`前台脉冲：${label} 切前台失败（被系统前台锁拦截或窗口已失效）${r && r.msg ? ' — ' + r.msg : ''}`, 'err');
        failed++;
      }
    }
    if (prev && prev !== '0' && !prevIsTarget) await api.focusWindow(prev); // 切回原前台（最小化已让焦点回落，这里再确保确定性）
    if (manual) status(`前台脉冲：本轮完成 — 成功 ${pulsed} 个${failed ? `，失败 ${failed} 个` : ''}`, failed ? 'err' : 'ok');
  } catch (e) {
    status('前台脉冲异常：' + ((e && e.message) || e), 'err');
  } finally {
    _pulseBusy = false;
  }
}

// 把 stayAwake 复选框的当前状态同步给原生（恢复启动 / 切换时都调它）
export async function applyStayAwake() {
  const on = $('stayAwake').checked;
  const r = await api.systemAwake(on);
  if (on) status(r && r.ok ? '已开启系统级防休眠：系统与显示器将保持唤醒（不改电源计划、不动光标）' : '开启防休眠失败：' + ((r && r.msg) || ''), r && r.ok ? 'ok' : 'err');
  else status('已关闭系统级防休眠');
  return r;
}

export function startAntiSleep() {
  $('stayAwake').addEventListener('change', () => {
    applyStayAwake();
    persist();
  });

  // 真实输入心跳 + 前台脉冲：共用一个 1s 计时器，各自按间隔触发
  setInterval(() => {
    if ($('synthBeat').checked && --_synthCd <= 0) {
      _synthCd = synthSec();
      api.synthInput({ mode: $('synthMode').value || 'key' });
    }
    if ($('pulseMode').checked && --_pulseCd <= 0) {
      _pulseCd = pulseSec();
      doPulse(); // 异步、_pulseBusy 防重入
    }
  }, 1000);
  $('synthBeat').addEventListener('change', () => {
    if ($('synthBeat').checked) {
      _synthCd = 0; // 立即发一拍
      status(`已开启真实输入心跳：每 ${synthSec()} 秒发一次「${modeLabel()}」，重置系统全局空闲、击退屏保/睡眠`, 'ok');
    } else {
      status('已关闭真实输入心跳');
    }
    persist();
  });
  $('synthSec').addEventListener('change', persist);
  $('synthMode').addEventListener('change', () => {
    _synthCd = 0;
    persist();
  });

  // 前台脉冲：开启即先脉冲一拍验证；脉冲对象取“勾了保活规则的目标”
  $('pulseMode').addEventListener('change', () => {
    if ($('pulseMode').checked) {
      const n = pulseTargets().length;
      _pulseCd = 0; // 立即来一拍
      const tail = $('pulseMin').checked ? '喂完即最小化回任务栏' : '随后切回原窗口';
      if (n) status(`已开启前台脉冲：每 ${pulseSec()} 秒把 ${n} 个保活目标瞬时切前台喂一次真实鼠标（给窗口里的远端云电脑续空闲），${tail}`, 'ok');
      else status('已开启前台脉冲，但当前没有“勾了保活规则”的在线目标——请先给无影/串流窗口加一条“保活”规则', 'err');
    } else {
      status('已关闭前台脉冲');
    }
    persist();
  });
  $('pulseSec').addEventListener('change', persist);
  $('pulseMin').addEventListener('change', persist);
  $('pulseNow').addEventListener('click', () => doPulse(true)); // 手动立即脉冲一次（带详细诊断日志）
}
