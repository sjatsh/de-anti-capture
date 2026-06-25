// 实时跟踪 DLL 写出的拦截日志 %TEMP%\KeepAliveHook.log，增量读取后推送到渲染层。
// 所有被注入进程的 DLL 都往这同一个文件追加（行内带 pid=），这里统一 tail。
// 用轮询而非 fs.watch：目标文件由别的进程(被注入的 DLL)追加写，watch 在 Windows 上不稳。
import fs from 'fs';
import { hookLogFile } from './paths.js';

const CAP = 600; // 环形缓冲保留的最近行数（供渲染层订阅时回放）
const POLL_MS = 500;
const SEED_BYTES = 64 * 1024; // 播种时最多回看的尾部字节

let buffer = [];
let offset = 0; // 已读到的字节位置
let residual = ''; // 跨次读取未完成的尾行
let timer = null;
let getWin = null;

function pushLines(lines) {
  if (!lines.length) return;
  buffer.push(...lines);
  if (buffer.length > CAP) buffer.splice(0, buffer.length - CAP);
}

function send(lines, reset) {
  const w = getWin && getWin();
  if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
    w.webContents.send('hook-log-line', { lines, reset });
  }
}

function readChunk(from, to) {
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

function splitComplete(text) {
  residual += text;
  const parts = residual.split('\n');
  residual = parts.pop(); // 末尾不完整行留到下次
  return parts.map((l) => l.replace(/\r$/, '')).filter((l) => l.length);
}

function poll() {
  let st;
  try {
    st = fs.statSync(hookLogFile());
  } catch {
    return; // 文件还没生成（尚无注入）
  }
  const size = st.size;
  if (size === offset) return;
  if (size < offset) {
    // 文件被截断/轮转 → 从头开始并通知清空
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

export function startHookLogTail(winGetter) {
  getWin = winGetter;
  // 播种：只读尾部 SEED_BYTES 填充缓冲，offset 设到文件尾（不把历史当“新行”重复推）
  try {
    const st = fs.statSync(hookLogFile());
    const from = Math.max(0, st.size - SEED_BYTES);
    const text = readChunk(from, st.size);
    let lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    if (from > 0) lines = lines.slice(1); // 丢掉可能被截断的首行
    pushLines(lines.filter((l) => l.length));
    offset = st.size;
    residual = '';
  } catch {
    offset = 0;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
}

export function stopHookLogTail() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function readHookLogBuffer() {
  return buffer;
}
