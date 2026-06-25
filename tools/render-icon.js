'use strict';
// Rasterize assets/icon.svg -> assets/icon.png using an offscreen Electron window.
// Run:  npx electron tools/render-icon.js   (or:  npm run icon)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZE = 256;
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;padding:0;background:transparent}' +
    'svg{display:block;width:' + SIZE + 'px;height:' + SIZE + 'px}' +
    '</style></head><body>' + svg + '</body></html>';

  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    useContentSize: true, webPreferences: { offscreen: false }
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'assets', 'icon.png');
  fs.writeFileSync(out, img.toPNG());
  const s = img.getSize();
  console.log('wrote ' + out + ' (' + s.width + 'x' + s.height + ')');
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
