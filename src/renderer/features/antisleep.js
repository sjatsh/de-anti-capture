import { api } from '../lib/api.js';
import { $, status } from '../lib/dom.js';
import { persist } from './persistence.js';

// 防休眠增强：两条都走 host 侧原生、无需注入，与「保活定时器(wiggle)」「注入 idle hook」互补。
//   ① 系统级防休眠 stayAwake —— SetThreadExecutionState：阻止整机睡眠/息屏（开关即时生效）。
//   ② 真实输入心跳 synthBeat —— SendInput：定时发真实无害输入，重置系统全局空闲、击退屏保。
// 关键区别：wiggle 的 PostMessage(WM_MOUSEMOVE) 不经内核 Raw Input Thread，更新不了全局空闲，多数无效。
let _synthCd = 0;
function synthSec() {
  return Math.min(300, Math.max(5, parseInt($('synthSec').value, 10) || 50));
}
function modeLabel() {
  const m = $('synthMode').value;
  return m === 'mouse' ? '鼠标微移' : m === 'both' ? '按键+微移' : 'F15 按键';
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

  // 真实输入心跳：1s 计时器，按间隔发一次 SendInput
  setInterval(() => {
    if (!$('synthBeat').checked) return;
    if (--_synthCd > 0) return;
    _synthCd = synthSec();
    api.synthInput({ mode: $('synthMode').value || 'key' });
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
}
