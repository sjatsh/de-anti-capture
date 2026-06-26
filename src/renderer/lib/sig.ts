import { API_DB, type ApiEntry } from '../apidb';

export type { ApiEntry };

export const ARG_REGS = ['RCX', 'RDX', 'R8', 'R9'];

export function funcSig(fn: string): ApiEntry | null {
  if (!fn) return null;
  const k = fn.toLowerCase();
  return API_DB[k] || API_DB[k.replace(/[aw]$/, '')] || null;
}

export function protoText(fn: string, e: ApiEntry): string {
  let ps = e.p.length ? e.p.map((p) => `${p[1]} ${p[0]}`).join(', ') : 'void';
  if (e.n && e.n > e.p.length) ps += `, …+${e.n - e.p.length}`;
  return `${e.r} ${fn}(${ps})`;
}
