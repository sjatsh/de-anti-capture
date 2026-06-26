// 实时跟踪 DLL 写出的拦截日志 %TEMP%\KeepAliveHook.log，增量读取后推送到渲染层。
// 所有被注入进程的 DLL 都往这同一个文件追加（行内带 pid=），这里统一 tail。
// 用轮询而非 fs.watch：目标文件由别的进程(被注入的 DLL)追加写，watch 在 Windows 上不稳。
import fs from 'node:fs';
import type { BrowserWindow } from 'electron';
import { hookLogFile } from './paths';

const CAP = 600;
const POLL_MS = 500;
const SEED_BYTES = 64 * 1024;

let buffer: string[] = [];
let offset = 0;
let residual = '';
let timer: NodeJS.Timeout | null = null;
let getWin: (() => BrowserWindow | null) | null = null;

function pushLines(lines: string[]): void {
  if (!lines.length) return;
  buffer.push(...lines);
  if (buffer.length > CAP) buffer.splice(0, buffer.length - CAP);
}

function send(lines: string[], reset: boolean): void {
  const w = getWin?.();
  if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
    w.webContents.send('hook-log-line', { lines, reset });
  }
}

function readChunk(from: number, to: number): string {
  const fd = fs.openSync(hookLogFile(), 'r');
  try {
    const len = to - from;
    const buf = Buffer.allocUnsafe(len);
    const n = fs.readSync(fd, buf, 0, len, from);
    return buf.toString('utf8', 0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function splitComplete(text: string): string[] {
  residual += text;
  const parts = residual.split('\n');
  residual = parts.pop() ?? '';
  return parts.map((l) => l.replace(/\r$/, '')).filter((l) => l.length);
}

function poll(): void {
  let st: fs.Stats;
  try {
    st = fs.statSync(hookLogFile());
  } catch {
    return;
  }
  const size = st.size;
  if (size === offset) return;
  if (size < offset) {
    offset = 0;
    residual = '';
    buffer = [];
    send([], true);
  }
  const text = readChunk(offset, size);
  offset = size;
  const lines = splitComplete(text);
  if (lines.length) {
    pushLines(lines);
    send(lines, false);
  }
}

export function startHookLogTail(winGetter: () => BrowserWindow | null): void {
  getWin = winGetter;
  try {
    const st = fs.statSync(hookLogFile());
    const from = Math.max(0, st.size - SEED_BYTES);
    const text = readChunk(from, st.size);
    let lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    if (from > 0) lines = lines.slice(1);
    pushLines(lines.filter((l) => l.length));
    offset = st.size;
    residual = '';
  } catch {
    offset = 0;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
}

export function readHookLogBuffer(): string[] {
  return buffer;
}
