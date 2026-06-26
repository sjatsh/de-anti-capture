import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// 解析内置拦截 DLL 路径：开发时用项目 bin/（Vite 注入的 APP_ROOT）；打包后 DLL 在只读的
// resources/bin/，复制到可写的 userData/bin/（DLL 要在同目录写规则文件 KeepAliveHook.rules.txt）。
export function resolveDll(): string {
  if (!app.isPackaged) {
    return path.resolve(process.env.APP_ROOT || path.join(__dirname, '..'), 'bin', 'KeepAliveHook.dll');
  }
  const src = path.join(process.resourcesPath, 'bin');
  const dst = path.join(app.getPath('userData'), 'bin');
  try {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['KeepAliveHook.dll', 'inject_target.exe', 'probe.exe']) {
      const s = path.join(src, f);
      const d = path.join(dst, f);
      if (fs.existsSync(s) && (!fs.existsSync(d) || fs.statSync(s).mtimeMs > fs.statSync(d).mtimeMs)) {
        fs.copyFileSync(s, d);
      }
    }
  } catch {
    return path.join(src, 'KeepAliveHook.dll');
  }
  return path.join(dst, 'KeepAliveHook.dll');
}

// DEFAULT_DLL 在 whenReady 内由 resolveDll() 写入；用访问器对外读写，避免导出可变绑定的取值时机问题。
let DEFAULT_DLL = path.resolve(process.env.APP_ROOT || path.join(__dirname, '..'), 'bin', 'KeepAliveHook.dll');
export const getDefaultDll = (): string => DEFAULT_DLL;
export const setDefaultDll = (p: string): void => {
  DEFAULT_DLL = p;
};
