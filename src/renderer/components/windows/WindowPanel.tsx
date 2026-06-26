import { useRef } from 'react';
import { useWindowsStore } from '../../store/windowsStore';
import { useTargetsStore } from '../../store/targetsStore';
import { useUiStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import { Icon } from '../icons/Icon';
import { HorizDivider } from '../layout/Divider';
import { WindowRow } from './WindowRow';

interface WindowPanelProps {
  height: number;
  onHeightChange: (h: number) => void;
}

export function WindowPanel({ height, onHeightChange }: WindowPanelProps) {
  const allWindows = useWindowsStore((s) => s.allWindows);
  const filterText = useWindowsStore((s) => s.filterText);
  const showAll = useWindowsStore((s) => s.showAll);
  const selWin = useWindowsStore((s) => s.selWin);
  const { setFilter, setShowAll, selectWindow, setWindows } = useWindowsStore.getState();

  const targets = useTargetsStore((s) => s.targets);
  const rebindTargets = useTargetsStore((s) => s.rebindTargets);
  const addTarget = useTargetsStore((s) => s.addTarget);
  const setStatus = useUiStore((s) => s.setStatus);

  const panelRef = useRef<HTMLElement>(null);

  async function refreshWindows() {
    try {
      const { showAll: sa } = useWindowsStore.getState();
      const r = await api.listWindows(sa);
      const list = Array.isArray(r) ? r : [];
      setWindows(list);
      if (targets.length) rebindTargets(list);
      setStatus(`已刷新，共 ${list.length} 个窗口` + (sa ? '（含隐藏 / 无标题）' : ''));
    } catch (e) {
      setStatus('刷新窗口失败：' + String(e), 'err');
    }
  }

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    refreshWindows();
  }

  function handleAddTarget() {
    const { selWin: hw, allWindows: ws } = useWindowsStore.getState();
    const w = ws.find((x) => x.hwnd === hw);
    if (!w) { setStatus('请先在上方窗口列表选择一个窗口', 'err'); return; }
    addTarget(w);
    setStatus(`已加入目标：${w.process} — ${w.title}`);
  }

  const filtered = filterText
    ? allWindows.filter((w) => {
        const f = filterText.toLowerCase();
        const hx = '0x' + BigInt(w.hwnd).toString(16);
        return (
          String(w.pid).includes(f) ||
          (w.process || '').toLowerCase().includes(f) ||
          (w.title || '').toLowerCase().includes(f) ||
          (w.cls || '').toLowerCase().includes(f) ||
          hx.toLowerCase().includes(f)
        );
      })
    : allWindows;

  return (
    <>
      <section
        ref={panelRef}
        className="panel winpanel"
        style={{ height, flexShrink: 0 }}
      >
        <div className="panel-head">
          <Icon name="monitor" className="head-ico" />
          <span className="panel-title">所有可见窗口</span>
          <span className="pill count">{filtered.length}</span>
          <div className="searchbox">
            <Icon name="search" />
            <input
              placeholder="筛选 PID / 进程 / 标题 / 句柄…"
              value={filterText}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button
            className={`btn ghost${showAll ? ' active' : ''}`}
            title="把隐藏窗口/无标题窗口也列出来（如全屏云电脑的投屏窗口）"
            onClick={toggleShowAll}
          >
            <Icon name="eye" />显示隐藏
          </button>
          <button className="btn ghost" onClick={refreshWindows}>
            <Icon name="refresh" />刷新
          </button>
          <button className="btn primary" onClick={handleAddTarget}>
            <Icon name="plus" />加入目标
          </button>
        </div>

        <div className="table">
          <div className="thead">
            <div className="c-pid">PID</div>
            <div className="c-proc">进程</div>
            <div className="c-title grow">窗口标题</div>
            <div className="c-hwnd">句柄</div>
          </div>
          <div className="tbody">
            {filtered.map((w) => (
              <WindowRow
                key={w.hwnd}
                win={w}
                selected={selWin === w.hwnd}
                onSelect={selectWindow}
                onAddTarget={handleAddTarget}
              />
            ))}
          </div>
        </div>
      </section>

      <HorizDivider
        panelRef={panelRef}
        onResize={onHeightChange}
        minH={130}
        maxH={window.innerHeight - 300}
      />
    </>
  );
}
