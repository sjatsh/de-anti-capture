import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import type { SynthMode } from '@shared/types';
import { Switch } from '../common/Switch';
import { Icon } from '../icons/Icon';

interface SettingsRowsProps {
  onPulseNow: () => void;
}

export function SettingsRows({ onPulseNow }: SettingsRowsProps) {
  const s = useSettingsStore();
  const set = useSettingsStore((x) => x.set);
  const setStatus = useUiStore((st) => st.setStatus);

  async function handleStayAwake(on: boolean) {
    set('stayAwake', on);
    const r = await api.systemAwake(on);
    if (on) {
      setStatus(
        r?.ok
          ? '已开启系统级防休眠：系统与显示器将保持唤醒（不改电源计划、不动光标）'
          : '开启防休眠失败：' + (r?.msg || ''),
        r?.ok ? 'ok' : 'err',
      );
    } else {
      setStatus('已关闭系统级防休眠');
    }
  }

  function handleSynthBeat(on: boolean) {
    set('synthBeat', on);
    if (on) {
      setStatus(`已开启真实输入心跳：每 ${s.synthSec} 秒发一次，重置系统全局空闲、击退屏保/睡眠`, 'ok');
    } else {
      setStatus('已关闭真实输入心跳');
    }
  }

  function handlePulseMode(on: boolean) {
    set('pulseMode', on);
    if (on) {
      setStatus(`已开启前台脉冲：每 ${s.pulseSec} 秒切前台喂真实鼠标`, 'ok');
    } else {
      setStatus('已关闭前台脉冲');
    }
  }

  function handleAutoInject(on: boolean) {
    set('autoInject', on);
    if (on) {
      setStatus(`已开启自动注入：每 ${s.autoSec} 秒巡检；带注入规则的目标若没挂上/换了 PID，会自动重新注入并应用规则。`, 'ok');
    } else {
      setStatus('已关闭自动注入（不再自动维持；已注入的不动，可手动"卸载"还原）');
    }
  }

  return (
    <>
      {/* Auto-inject row */}
      <div className="kbar">
        <Icon name="zap" className="kbar-ico" />
        <Switch
          checked={s.autoInject}
          onChange={handleAutoInject}
          label="自动注入（目标 PID 变动自动重挂）"
          title="保持你的目标窗口处于已注入状态：对带注入规则(idle/hook/前台伪装/防截屏)的目标，持续保证它被注入并应用规则。目标进程重启/重连导致 PID 变化时自动重新绑定并注入。"
        />
        <span className="hint">
          每{' '}
          <input
            type="number" min={2} max={60} className="mini-num"
            value={s.autoSec}
            onChange={(e) => set('autoSec', Math.min(60, Math.max(2, parseInt(e.target.value, 10) || 5)))}
          />{' '}
          秒巡检 · 带注入规则的目标若掉了/换了 PID 自动重新注入并应用规则
        </span>
      </div>

      {/* StayAwake + SynthBeat row */}
      <div className="kbar">
        <Icon name="zap" className="kbar-ico" />
        <Switch
          checked={s.stayAwake}
          onChange={handleStayAwake}
          label="系统级防休眠（不息屏/不睡眠）"
          title={'系统级防休眠：调用 SetThreadExecutionState 声明"系统+显示器持续需要"，阻止整机睡眠/息屏（不改电源计划、不动你的真实光标）。'}
        />
        <span className="kbar-sep" />
        <Switch
          checked={s.synthBeat}
          onChange={handleSynthBeat}
          label="真实输入心跳"
          title={'用 SendInput 周期性发一次真实的无害输入（默认 F15 按键，不移动光标），更新系统全局"最后输入时间"，重置所有程序的空闲并击退屏保/睡眠。'}
        />
        <span className="hint">
          每{' '}
          <input
            type="number" min={5} max={300} className="mini-num"
            value={s.synthSec}
            onChange={(e) => set('synthSec', Math.min(300, Math.max(5, parseInt(e.target.value, 10) || 50)))}
          />{' '}
          秒 ·{' '}
          <select
            className="mini-sel"
            value={s.synthMode}
            onChange={(e) => set('synthMode', e.target.value as SynthMode)}
          >
            <option value="key">F15 按键（不动光标）</option>
            <option value="mouse">鼠标微移 ±1px</option>
            <option value="both">按键 + 微移</option>
          </select>
        </span>
      </div>

      {/* Pulse row */}
      <div className="kbar">
        <Icon name="zap" className="kbar-ico" />
        <Switch
          checked={s.pulseMode}
          onChange={handlePulseMode}
          label="前台脉冲（给窗口内远端喂输入·防云电脑休眠）"
          title="前台脉冲：给「窗口里的远端云电脑」(无影/串流客户端)喂真实输入，防远端会话休眠。开启后每隔 N 秒：把目标切前台→发真实鼠标微移→切回原窗口，焦点只闪几十毫秒。"
        />
        <span className="hint">
          每{' '}
          <input
            type="number" min={30} max={900} className="mini-num"
            value={s.pulseSec}
            onChange={(e) => set('pulseSec', Math.min(900, Math.max(30, parseInt(e.target.value, 10) || 600)))}
          />{' '}
          秒切前台喂一次真实鼠标
        </span>
        <Switch
          small
          checked={s.pulseMin}
          onChange={(v) => set('pulseMin', v)}
          label="喂完即最小化"
          title="喂完输入后立刻把目标窗口最小化回任务栏，不让它一直占着桌面。"
        />
        <button
          className="btn ghost small"
          title="立即手动触发一次前台脉冲（不等间隔）"
          onClick={onPulseNow}
        >
          <Icon name="zap" />立即脉冲
        </button>
      </div>
    </>
  );
}
