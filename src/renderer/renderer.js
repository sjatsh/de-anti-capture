// 渲染层入口（组合根）：导入各模块，接线按钮/编辑器/标题栏/分隔条，启动两个定时器，最后做状态恢复。
// 行为与原单体 IIFE 逐字一致——仅按依赖拆分为模块。
import { state, newUid } from './state.js';
import { api } from './lib/api.js';
import { $, status } from './lib/dom.js';
import { refreshWindows, renderWindows } from './ui/windowList.js';
import { addTarget, delTarget, renderTargets } from './ui/targets.js';
import { addRule, editRule, delRule, renderRules } from './ui/rules.js';
import { setupEditorWiring } from './ui/editor.js';
import { doInject, doEject, doApply } from './features/inject.js';
import { saveConfig, persist } from './features/persistence.js';
import { startKeepAlive, startAutoInject } from './features/timers.js';
import { startAntiSleep, applyStayAwake } from './features/antisleep.js';
import { initHookLog, initLogTabs } from './features/hooklog.js';
import { initTitlebar, initLogToggle, initResizers } from './ui/chrome.js';

// ---------------- 主区按钮接线 ----------------
function wireUp() {
  $('filter').addEventListener('input', renderWindows);
  $('refresh').onclick = refreshWindows;
  $('toggleAll').onclick = () => {
    state.showAll = !state.showAll;
    $('toggleAll').classList.toggle('active', state.showAll);
    refreshWindows();
    persist();
  };
  $('addTarget').onclick = addTarget;
  $('delTarget').onclick = delTarget;
  $('addRule').onclick = addRule;
  $('editRule').onclick = editRule;
  $('delRule').onclick = delRule;
  $('inject').onclick = doInject;
  $('eject').onclick = doEject;
  $('apply').onclick = doApply;

  // 全量 API 透传日志开关：写入配置后，已注入的目标点“应用”即可热生效
  $('logAll').addEventListener('change', async () => {
    state.logAll = $('logAll').checked;
    await saveConfig();
    status(
      state.logAll
        ? '已开启「全量 API 日志(透传)」：对已注入窗口点“应用”生效，再点“打开日志”查看（%TEMP%\\KeepAliveHook.log）'
        : '已关闭全量 API 日志：对已注入窗口点“应用”生效',
      'ok'
    );
  });
  $('openLog').onclick = async () => {
    const r = await api.openHookLog();
    status(r && r.ok ? '已打开日志：' + r.path : '打开日志失败: ' + (r && r.msg), r && r.ok ? '' : 'err');
  };
}

// ---------------- 启动恢复 ----------------
async function init() {
  state._restoring = true;
  state.dllPath = await api.defaultDll(); // 内置拦截 DLL，随程序打包；界面不提供路径设置
  const saved = await api.loadState();
  if (saved) {
    state.showAll = !!saved.showAll;
    state.logAll = !!saved.logAll;
    $('toggleAll').classList.toggle('active', state.showAll);
    $('logAll').checked = state.logAll;
    $('kaToggle').checked = saved.kaEnabled !== false;
    $('autoInject').checked = !!saved.autoInject;
    if (saved.autoSec) $('autoSec').value = saved.autoSec;
    $('stayAwake').checked = !!saved.stayAwake;
    $('synthBeat').checked = !!saved.synthBeat;
    if (saved.synthSec) $('synthSec').value = saved.synthSec;
    if (saved.synthMode) $('synthMode').value = saved.synthMode;
    $('pulseMode').checked = !!saved.pulseMode;
    if (saved.pulseSec) $('pulseSec').value = saved.pulseSec;
    $('pulseMin').checked = saved.pulseMin !== false; // 默认开启（喂完即最小化）
    if (saved.stayAwake) applyStayAwake(); // 恢复时若之前开启，补发系统级防休眠断言
    state.targets = (saved.targets || []).map((t) => ({
      uid: newUid(),
      hwnd: null,
      pid: t.pid,
      title: t.title,
      process: t.process,
      offline: true,
      rules: (t.rules || []).map((r) => (r.kind === 'keepalive' ? { ...r, _cd: r.intervalSec } : { ...r })),
    }));
  }
  renderTargets();
  renderRules();
  state._restoring = false;
  await refreshWindows(); // 枚举窗口 + 重绑目标
  const n = state.targets.length,
    off = state.targets.filter((t) => t.offline).length;
  if (n)
    status(`已恢复 ${n} 个目标` + (off ? `，其中 ${off} 个离线（对应程序未运行，刷新或重开后自动重连）` : '，配置就绪'), off ? '' : 'ok');
  else status('就绪。选窗口 → 加入目标 → 给目标加规则；保活即时生效，hook 规则需注入。');
}

// ---------------- 组合启动（init 必须最后）----------------
wireUp();
setupEditorWiring();
initTitlebar();
initLogToggle();
initResizers();
initLogTabs();
initHookLog();
startKeepAlive();
startAutoInject();
startAntiSleep();
init();
