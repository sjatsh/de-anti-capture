// 一键验证：起探针 probe.exe → 取基线观测 → 只把这一条规则(指向探针 pid)写进配置并注入 →
// 取注入后观测 → 判定 → eject → 还原原配置文件。供 GUI 每条规则的「验证」按钮调用。
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import native from '../native/index';
import type { Rule, VerifyResult } from '@shared/types';
import { getDefaultDll } from './dll';
import { rulesFileFor } from './paths';
import { buildSpec } from '../config';

interface ProbeSample {
  idle: number;
  fgself: number;
  aff: number;
  sm0: number;
  dbg: number;
}

function parseProbe(l: string): ProbeSample | null {
  const m = /idle=(\d+)\s+fgself=(\d)\s+aff=0x([0-9a-fA-F]+)\s+sm0=(-?\d+)\s+dbg=(\d)/.exec(l);
  if (!m) return null;
  return { idle: +m[1], fgself: +m[2], aff: parseInt(m[3], 16), sm0: +m[4], dbg: +m[5] };
}

function waitFor(cond: () => boolean, ms: number): Promise<void> {
  return new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond() || Date.now() - t0 > ms) {
        clearInterval(iv);
        res();
      }
    }, 100);
  });
}

function writeSingleRule(cfg: string, pid: number, r: Rule): void {
  const spec = r.kind === 'hook' ? buildSpec(r) : '';
  fs.writeFileSync(
    cfg,
    '# verify (临时，验证完自动还原)\r\n' + `${pid}|${r.kind}|1|${r.dll || ''}|${r.func || ''}|${spec}|verify\r\n`,
    'utf8',
  );
}

const hex = (n: number): string => '0x' + (n >>> 0).toString(16);

type Verdict = { pass: boolean | null; before: string; after: string; detail: string };

// 据注入前后观测判定。pass: true=通过 / false=未生效 / null=无法自动判定
function judge(rule: Rule, b: ProbeSample, a: ProbeSample): Verdict {
  switch (rule.kind) {
    case 'idle':
      return {
        pass: a.idle <= 250,
        before: `空闲 ${b.idle}ms`,
        after: `空闲 ${a.idle}ms`,
        detail: a.idle <= 250 ? '空闲时间被归零' : '空闲未归零（检查注入/规则）',
      };
    case 'fg':
      if (b.fgself !== 0)
        return {
          pass: null,
          before: `前台自认=${b.fgself}`,
          after: `前台自认=${a.fgself}`,
          detail: '基线探针正好在前台，无法判定，重试即可',
        };
      return {
        pass: a.fgself === 1,
        before: `前台自认=${b.fgself}`,
        after: `前台自认=${a.fgself}`,
        detail: a.fgself === 1 ? 'GetForegroundWindow 被伪装成自身窗口' : '未伪装成前台',
      };
    case 'uncapture':
      return {
        pass: b.aff !== 0 && a.aff === 0,
        before: `affinity=${hex(b.aff)}`,
        after: `affinity=${hex(a.aff)}`,
        detail: b.aff !== 0 && a.aff === 0 ? '截屏保护已被剥离为 NONE' : '未变化（检查注入）',
      };
    case 'hook': {
      const f = (rule.func || '').toLowerCase();
      if (f === 'getsystemmetrics') {
        const ch = a.sm0 !== b.sm0;
        return {
          pass: ch ? true : null,
          before: `SM_CXSCREEN=${b.sm0}`,
          after: `SM_CXSCREEN=${a.sm0}`,
          detail: ch ? '入参/返回值已被改' : '值未变（透传或未设 a0/ret；可用命中计数确认已挂）',
        };
      }
      if (f === 'isdebuggerpresent') {
        const ch = a.dbg !== b.dbg;
        return {
          pass: ch ? true : null,
          before: `dbg=${b.dbg}`,
          after: `dbg=${a.dbg}`,
          detail: ch ? 'IsDebuggerPresent 返回被改' : '值未变（透传；可用命中计数确认已挂）',
        };
      }
      return {
        pass: null,
        before: '-',
        after: '-',
        detail: `探针未调用 ${rule.dll}!${rule.func}，无法自动对比；改用「拦截日志」命中计数/观察确认`,
      };
    }
    case 'cursor':
      return {
        pass: null,
        before: '-',
        after: '-',
        detail: '光标伪动只在后台静止时微抖保活，探针无法自动对比坐标；注入目标后看「拦截日志」里 GetCursorPos 的命中计数确认已挂上。',
      };
    default:
      return { pass: null, before: '-', after: '-', detail: '该类型不支持自动验证' };
  }
}

export async function verifyRule(rule: Rule): Promise<VerifyResult> {
  if (!rule || !rule.kind) return { ok: false, msg: '无效规则' };
  if (rule.kind === 'keepalive')
    return {
      ok: true,
      pass: null,
      before: '-',
      after: '-',
      detail: '保活无需注入：开启“保活定时器”后目标窗口会定时收到随机 WM_MOUSEMOVE。',
    };

  const dll = getDefaultDll();
  const dir = path.dirname(dll);
  const probe = path.join(dir, 'probe.exe');
  if (!fs.existsSync(probe)) return { ok: false, msg: '缺少探针 probe.exe（运行 npm run build:dll 生成）' };

  const cfg = rulesFileFor(dll);
  let backup: Buffer | null = null;
  let child: ChildProcess | null = null;
  let pid: number | null = null;
  const samples: ProbeSample[] = [];
  try {
    backup = fs.existsSync(cfg) ? fs.readFileSync(cfg) : null;
  } catch {
    backup = null;
  }
  try {
    child = spawn(probe, [], { cwd: dir });
    child.stdout?.on('data', (buf: Buffer) => {
      for (const l of buf.toString().split(/\r?\n/)) {
        if (l.startsWith('PID=')) pid = +l.slice(4);
        else if (l.startsWith('PROBE ')) {
          const p = parseProbe(l);
          if (p) samples.push(p);
        }
      }
    });
    await waitFor(() => pid !== null && samples.length >= 2, 4000);
    if (!pid) return { ok: false, msg: '探针未启动或无输出' };
    const before = samples[samples.length - 1];

    writeSingleRule(cfg, pid, rule);
    const ir = native.inject(pid, dll);
    if (!ir.ok) return { ok: false, msg: '注入失败：' + ir.msg };

    const base = samples.length;
    await waitFor(() => samples.length >= base + 3, 4000);
    const after = samples[samples.length - 1];
    try {
      native.eject(pid, 'KeepAliveHook.dll');
    } catch {
      /* ignore */
    }
    return { ok: true, ...judge(rule, before, after) };
  } catch (e) {
    return { ok: false, msg: String((e as Error)?.message || e) };
  } finally {
    try {
      if (child && child.pid) process.kill(child.pid);
    } catch {
      /* ignore */
    }
    try {
      if (backup != null) fs.writeFileSync(cfg, backup);
      else if (fs.existsSync(cfg)) fs.unlinkSync(cfg);
    } catch {
      /* ignore */
    }
  }
}
