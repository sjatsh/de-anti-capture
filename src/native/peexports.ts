import fs from 'node:fs';
import path from 'node:path';

export interface ExportsTable {
  names: string[];
  rva: Record<string, number>;
}

// 解析 PE 导出表：返回 { names: [...], rva: { name: funcRVA } }
// 用于：① 规则编辑器函数名自动补全  ② 取 ReloadHooks 的 RVA 做热重载
export function parse(filePath: string): ExportsTable {
  const out: ExportsTable = { names: [], rva: {} };
  let b: Buffer;
  try {
    b = fs.readFileSync(filePath);
  } catch {
    return out;
  }
  try {
    const e_lfanew = b.readUInt32LE(0x3c);
    if (b.readUInt32LE(e_lfanew) !== 0x00004550) return out;
    const coff = e_lfanew + 4;
    const numSections = b.readUInt16LE(coff + 2);
    const sizeOpt = b.readUInt16LE(coff + 16);
    const opt = coff + 20;
    const magic = b.readUInt16LE(opt);
    const ddOff = opt + (magic === 0x20b ? 112 : 96);
    const expRva = b.readUInt32LE(ddOff);
    if (!expRva) return out;
    const secTable = opt + sizeOpt;

    const rvaToOff = (rva: number): number => {
      for (let i = 0; i < numSections; i++) {
        const s = secTable + i * 40;
        if (s + 40 > b.length) break;
        const vsize = b.readUInt32LE(s + 8);
        const va = b.readUInt32LE(s + 12);
        const rawSize = b.readUInt32LE(s + 16);
        const rawPtr = b.readUInt32LE(s + 20);
        const size = Math.max(vsize, rawSize);
        if (rva >= va && rva < va + size) return rva - va + rawPtr;
      }
      return -1;
    };
    const readCStr = (off: number): string => {
      let e = off;
      while (e < b.length && b[e] !== 0) e++;
      return b.toString('latin1', off, e);
    };

    const expOff = rvaToOff(expRva);
    if (expOff < 0) return out;
    const numberOfNames = b.readUInt32LE(expOff + 24);
    const funcsOff = rvaToOff(b.readUInt32LE(expOff + 28));
    const namesOff = rvaToOff(b.readUInt32LE(expOff + 32));
    const ordsOff = rvaToOff(b.readUInt32LE(expOff + 36));
    if (namesOff < 0 || funcsOff < 0 || ordsOff < 0) return out;

    for (let i = 0; i < numberOfNames && i < 100000; i++) {
      const nameRva = b.readUInt32LE(namesOff + i * 4);
      const so = rvaToOff(nameRva);
      if (so < 0) continue;
      const name = readCStr(so);
      const ord = b.readUInt16LE(ordsOff + i * 2);
      const funcRva = b.readUInt32LE(funcsOff + ord * 4);
      out.names.push(name);
      out.rva[name] = funcRva;
    }
    out.names.sort((a, c) => a.toLowerCase().localeCompare(c.toLowerCase()));
  } catch {
    /* ignore */
  }
  return out;
}

const cache = new Map<string, ExportsTable>();

function resolveSystemDll(dllName: string): string | null {
  if (fs.existsSync(dllName)) return dllName;
  const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  let p = path.join(sys, dllName);
  if (fs.existsSync(p)) return p;
  if (!/\.dll$/i.test(dllName)) {
    p = path.join(sys, dllName + '.dll');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getExports(dllName: string): ExportsTable {
  const cached = cache.get(dllName);
  if (cached) return cached;
  const p = resolveSystemDll(dllName);
  const res = p ? parse(p) : { names: [], rva: {} };
  cache.set(dllName, res);
  return res;
}
