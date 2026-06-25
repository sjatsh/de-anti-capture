import { API_DB } from '../apidb.js';

// x64 下前 4 个整型/指针参数走寄存器 RCX/RDX/R8/R9（hook 仅能覆盖这 4 个）。
export const ARG_REGS = ['RCX', 'RDX', 'R8', 'R9'];

// 查签名：先按原名小写，再去掉尾部 A/W 变体后缀。
export function funcSig(fn) {
  if (!fn) return null;
  const k = fn.toLowerCase();
  return API_DB[k] || API_DB[k.replace(/[aw]$/, '')] || null;
}

// 用用户输入的真实函数名 + 库里的类型，拼出 C 原型串
export function protoText(fn, e) {
  let ps = e.p.length ? e.p.map((p) => `${p[1]} ${p[0]}`).join(', ') : 'void';
  if (e.n && e.n > e.p.length) ps += `, …+${e.n - e.p.length}`; // 真实参数更多（栈上），标注省略数
  return `${e.r} ${fn}(${ps})`;
}
