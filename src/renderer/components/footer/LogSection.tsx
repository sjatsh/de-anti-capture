import { useRef, useCallback } from 'react';
import { useHookLogStore, type HookLine } from '../../store/hookLogStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore, type LogLine } from '../../store/uiStore';
import { useTargetsStore } from '../../store/targetsStore';
import { api } from '../../lib/api';
import { Icon } from '../icons/Icon';
import { Switch } from '../common/Switch';
import { LogDivider } from '../layout/Divider';

export function LogSection() {
  const logPanelOpen = useUiStore((s) => s.logPanelOpen);
  const logPanelHeight = useUiStore((s) => s.logPanelHeight);
  const statusMsg = useUiStore((s) => s.statusMsg);
  const statusCls = useUiStore((s) => s.statusCls);
  const activityLines = useUiStore((s) => s.activityLines);
  const { setLogPanelOpen, setLogPanelHeight, setStatus } = useUiStore.getState();

  const hookLines = useHookLogStore((s) => s.hookLines);
  const hookUnread = useHookLogStore((s) => s.hookUnread);
  const logView = useHookLogStore((s) => s.view);
  const { setView, clearUnread } = useHookLogStore.getState();

  const logAll = useSettingsStore((s) => s.logAll);
  const set = useSettingsStore((s) => s.set);

  const logPanelRef = useRef<HTMLDivElement | null>(null);

  const handleHeightChange = useCallback(
    (h: number, open: boolean) => {
      setLogPanelHeight(h);
      setLogPanelOpen(open);
    },
    [setLogPanelHeight, setLogPanelOpen],
  );

  function toggleLogPanel() {
    const next = !logPanelOpen;
    setLogPanelOpen(next);
    if (next && logPanelHeight < 24) setLogPanelHeight(170);
  }

  function switchView(view: 'activity' | 'hook') {
    if (!logPanelOpen) setLogPanelOpen(true);
    setView(view);
    if (view === 'hook') clearUnread();
  }

  async function handleLogAll(on: boolean) {
    set('logAll', on);
    const { targets, dllPath } = useTargetsStore.getState();
    const onlineTargets = targets.filter((t) => !t.offline).map((t) => ({ pid: t.pid, rules: t.rules }));
    await api.saveConfig(dllPath, onlineTargets, { logAll: on });
    setStatus(
      on
        ? '已开启「全量 API 日志(透传)」：对已注入窗口点"应用"生效，再点"打开日志"查看（%TEMP%\\KeepAliveHook.log）'
        : '已关闭全量 API 日志：对已注入窗口点"应用"生效',
      'ok',
    );
  }

  async function handleCopyLog() {
    const lines = logView === 'hook' ? hookLines : activityLines;
    if (!lines.length) { setStatus('日志为空，没有可复制的内容', 'err'); return; }
    const text =
      logView === 'hook'
        ? (lines as HookLine[]).map((l) => `${l.ev.ts || ''} ${l.ev.body ?? l.ev.raw}`).join('\r\n')
        : (lines as LogLine[]).map((l) => `${l.ts} ${l.msg}`).join('\r\n');
    const r = await api.copyText(text);
    const which = logView === 'hook' ? '拦截日志' : '活动日志';
    setStatus(
      r?.ok ? `已复制${which} ${lines.length} 行到剪贴板` : `复制失败：${r?.msg || '剪贴板不可用'}`,
      r?.ok ? 'ok' : 'err',
    );
  }

  async function handleOpenLog() {
    const r = await api.openHookLog();
    setStatus(r?.ok ? '已打开日志' : '打开日志失败: ' + r?.msg, r?.ok ? '' : 'err');
  }

  return (
    <>
      <LogDivider logPanelRef={logPanelRef} onHeightChange={handleHeightChange} />

      <div className="logbar">
        <button
          className={`logtoggle${logPanelOpen ? ' open' : ''}`}
          title="展开/收起日志面板"
          onClick={toggleLogPanel}
        >
          <Icon name="chevron" className="chev" />
        </button>

        <div className="logtabs">
          <button
            className={`logtab${logView === 'activity' ? ' active' : ''}`}
            onClick={() => switchView('activity')}
          >
            <Icon name="activity" />活动日志
          </button>
          <button
            className={`logtab${logView === 'hook' ? ' active' : ''}`}
            title="实时跟踪被注入 DLL 写出的拦截日志"
            onClick={() => switchView('hook')}
          >
            <Icon name="eye" />拦截日志
            {hookUnread > 0 && (
              <span className="pill hookbadge">{hookUnread > 99 ? '99+' : hookUnread}</span>
            )}
          </button>
        </div>

        <div className={`status${statusCls ? ' ' + statusCls : ''}`}>{statusMsg}</div>

        <Switch
          small
          checked={logAll}
          onChange={handleLogAll}
          label="全量 API 日志(观察)"
          title={'观察模式：对一组检测类 API 装透传计数钩子，不改行为，只在「拦截日志」里实时显示调用情况。需先对目标注入，再点"应用规则"生效。'}
        />
        <button className="btn ghost small" title="复制当前日志全部内容到剪贴板" onClick={handleCopyLog}>
          <Icon name="copy" />复制
        </button>
        <button
          className="btn ghost small"
          title="用系统默认程序打开拦截日志文件(%TEMP%\KeepAliveHook.log)"
          onClick={handleOpenLog}
        >
          <Icon name="folder" />打开文件
        </button>
      </div>

      <div
        ref={logPanelRef}
        className={`logpanel${logPanelOpen ? ' open' : ''}`}
        style={{ height: logPanelOpen ? logPanelHeight : 0 }}
      >
        <div className={`logview${logView !== 'activity' ? ' hidden' : ''}`}>
          {activityLines.map((l, i) => (
            <div key={i} className={`logline${l.cls ? ' ' + l.cls : ''}`}>
              <span className="ts">{l.ts}</span>
              <span className="msg">{l.msg}</span>
            </div>
          ))}
        </div>
        <div className={`logview${logView !== 'hook' ? ' hidden' : ''}`}>
          {hookLines.map((l, i) => {
            const ev = l.ev;
            let body = ev.body ?? ev.raw;
            if (ev.type === 'stat' && ev.kind === 'obs')
              body = `观察 ${ev.dll}!${ev.func} · 被调用 ${ev.hits} 次`;
            return (
              <div key={i} className={`logline hookline${l.cls ? ' ' + l.cls : ''}`}>
                <span className="ts">{ev.ts || ''}</span>
                <span className="msg">
                  {ev.pid != null ? `[${ev.pid}] ` : ''}
                  {body}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
