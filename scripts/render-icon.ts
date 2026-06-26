// 用一个离屏 Electron 窗口把 assets/icon.svg 栅格化成 assets/icon.png。
// 运行：npm run icon  （= electron -r tsx/cjs scripts/render-icon.ts）
// 路径基于 process.cwd()（npm 脚本始终在项目根执行），不依赖 __dirname / import.meta（tsx 下二者形态不定）。
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const SIZE = 256;
app.disableHardwareAcceleration();

app
  .whenReady()
  .then(async () => {
    const svgPath = path.join(process.cwd(), 'assets', 'icon.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'html,body{margin:0;padding:0;background:transparent}' +
      `svg{display:block;width:${SIZE}px;height:${SIZE}px}` +
      '</style></head><body>' +
      svg +
      '</body></html>';

    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      useContentSize: true,
      webPreferences: { offscreen: false },
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise<void>((r) => setTimeout(r, 250));
    const img = await win.webContents.capturePage();
    const out = path.join(process.cwd(), 'assets', 'icon.png');
    fs.writeFileSync(out, img.toPNG());
    const s = img.getSize();
    console.log(`wrote ${out} (${s.width}x${s.height})`);
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
