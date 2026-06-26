import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSettingsStore } from '../../store/settingsStore';
import { Icon } from '../icons/Icon';
import { Switch } from '../common/Switch';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const kaEnabled = useSettingsStore((s) => s.kaEnabled);
  const setSetting = useSettingsStore((s) => s.set);

  useEffect(() => {
    api.winIsMaximized().then(setMaximized).catch(() => {});
    const unsub = api.onMaximizeChange(setMaximized);
    return unsub;
  }, []);

  return (
    <header className="titlebar">
      <div className="tb-brand">
        <svg className="logo-mark" viewBox="0 0 256 256" aria-hidden="true">
          <use href="#i-logo" />
        </svg>
        <span className="tb-title">窗口保活 / API 拦截工具</span>
      </div>
      <div className="tb-right">
        <Switch
          checked={kaEnabled}
          onChange={(v) => setSetting('kaEnabled', v)}
          label="保活定时器"
          title="定时给保活规则的窗口发随机鼠标移动（不动你真实光标）"
        />
        <div className="win-ctrls">
          <button className="wbtn" title="最小化" onClick={() => api.winMinimize()}>
            <Icon name="win-min" />
          </button>
          <button
            className="wbtn"
            title={maximized ? '还原' : '最大化'}
            onClick={() => api.winMaximize()}
          >
            <Icon name={maximized ? 'win-restore' : 'win-max'} />
          </button>
          <button className="wbtn close" title="关闭" onClick={() => api.winClose()}>
            <Icon name="win-close" />
          </button>
        </div>
      </div>
    </header>
  );
}
