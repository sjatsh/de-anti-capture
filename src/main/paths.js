import { app } from 'electron';
import path from 'path';

// 主进程文件/数据路径集中点（避免各模块各自拼路径）。
// ICON：dev 走 Vite 注入的 APP_ROOT（项目根）；打包后该路径不存在则窗口回退使用 exe 图标。
export const ICON = path.join(process.env.APP_ROOT || __dirname, 'assets', 'icon.png');

// 应用状态持久化 → %APPDATA%/<productName>/state.json
export const stateFile = () => path.join(app.getPath('userData'), 'state.json');

// DLL 写出的拦截日志 → %TEMP%/KeepAliveHook.log
export const hookLogFile = () =>
  path.join(process.env.TEMP || process.env.TMP || app.getPath('temp'), 'KeepAliveHook.log');

// 规则文件写在 DLL 同目录（DLL 启动时读取它）
export const rulesFileFor = (dllPath) => path.join(path.dirname(dllPath), 'KeepAliveHook.rules.txt');
