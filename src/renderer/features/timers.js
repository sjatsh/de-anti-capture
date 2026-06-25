import { state } from '../state.js';
import { api } from '../lib/api.js';
import { $, status } from '../lib/dom.js';
import { rebindTargets, saveConfig, persist } from './persistence.js';
import { renderTargets } from '../ui/targets.js';

// ---------------- 保活定时器（按窗口 PostMessage）----------------
export function startKeepAlive() {
  setInterval(() => {
    if (!$('kaToggle').checked) return;
    // 前台脉冲接管保活目标时，跳过 PostMessage wiggle：它不经 Raw Input Thread，对“窗口里的远端云电脑”无效，
    // 改由 antisleep 的前台脉冲喂真实输入（见 features/antisleep.js doPulse）。
    const pulse = $('pulseMode').checked;
    for (const t of state.targets) {
      if (t.offline || !t.hwnd) continue;
      for (const r of t.rules) {
        if (r.kind !== 'keepalive' || !r.enabled) continue;
        if (pulse) continue;
        r._cd = (r._cd == null ? r.intervalSec : r._cd) - 1;
        if (r._cd <= 0) {
          api.wiggle(t.hwnd, t.pid);
          r._cd = Math.max(1, r.intervalSec);
        }
      }
    }
  }, 1000);
  $('kaToggle').addEventListener('change', persist);
}

// ---------------- 自动注入：保持目标处于已注入状态(PID 变了自动重挂) ----------------
// 对带「需注入规则」(idle/hook/fg/uncapture)的目标，持续保证它被注入并应用规则；PID 变化自动重绑。
let _autoCd = 0,
  _autoBusy = false;
function autoSec() {
  return Math.min(60, Math.max(2, parseInt($('autoSec').value, 10) || 5));
}
function needsInject(t) {
  return (t.rules || []).some((r) => r.enabled && (r.kind === 'idle' || r.kind === 'hook' || r.kind === 'fg' || r.kind === 'uncapture'));
}
async function autoInjectTick() {
  if (_autoBusy) return;
  _autoBusy = true;
  try {
    const r = await api.listWindows(state.showAll); // 静默重枚举 + 重绑 PID（不刷新大列表）
    state.allWindows = Array.isArray(r) ? r : [];
    rebindTargets();
    renderTargets();
    const need = [];
    for (const t of state.targets) {
      if (t.offline || !t.hwnd || !needsInject(t)) continue;
      if (!(await api.moduleLoaded(t.pid))) need.push(t);
    }
    if (need.length) {
      await saveConfig(); // 把目标规则按当前 PID 写入规则文件，再注入
      for (const t of need) {
        const res = await api.inject(t.pid, state.dllPath);
        status(`自动注入：${res.ok ? '✓' : '✗'} ${t.process}（PID ${t.pid}）${res.ok ? '' : ' — ' + res.msg}`, res.ok ? 'ok' : 'err');
      }
    }
  } catch (e) {
    status('自动注入巡检异常：' + ((e && e.message) || e), 'err');
  } finally {
    _autoBusy = false;
  }
}

export function startAutoInject() {
  setInterval(() => {
    if (!$('autoInject').checked) return;
    if (--_autoCd > 0) return;
    _autoCd = autoSec();
    autoInjectTick();
  }, 1000);
  $('autoInject').addEventListener('change', () => {
    if ($('autoInject').checked) {
      _autoCd = 0;
      status(`已开启自动注入：每 ${autoSec()} 秒巡检；带注入规则的目标若没挂上/换了 PID，会自动重新注入并应用规则。`, 'ok');
    } else {
      status('已关闭自动注入（不再自动维持；已注入的不动，可手动“卸载”还原）');
    }
    persist();
  });
  $('autoSec').addEventListener('change', persist);
}
