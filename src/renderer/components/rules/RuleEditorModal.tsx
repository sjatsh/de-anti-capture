import { useState, useEffect, useRef, useCallback } from 'react';
import type { Rule, RuleKind } from '@shared/types';
import { api } from '../../lib/api';
import { funcSig, protoText, ARG_REGS } from '../../lib/sig';
import { Icon } from '../icons/Icon';

const KIND_DESC: Record<RuleKind, string> = {
  keepalive: '定时向该窗口投递随机坐标的鼠标移动消息，让程序自己不进入空闲（不动你真实光标）。无需注入。',
  idle: '把某 API 当作 GetLastInputInfo 处理，让系统空闲时间归零。需要先对该窗口注入 DLL。',
  fg: '把 GetForegroundWindow 伪装成"返回本进程自己的主窗口"，让无影云 stream_viewer 以为自己一直在前台，从而持续把你本地输入转发到远端、不空闲掉线。零闪屏。需注入该进程(选 stream_viewer)。副作用：开启后本地输入会被转发进远端会话。',
  uncapture: '防截屏置黑：装上时主动对本进程窗口调 SetWindowDisplayAffinity(NONE) 撕掉已有的"截屏排除"保护，并 hook 住防止重设。对"窗口创建时设一次保护、之后不再调用"的程序(如无影云)有效。需注入该进程(选 stream_viewer)。',
  hook: '通用拦截：可改入参、改返回值、或完全不调用原函数返回 mock 值。什么都不设=透传。需要注入。',
};

const KNOWN_DLLS = ['user32.dll','kernel32.dll','ntdll.dll','advapi32.dll','gdi32.dll','winmm.dll','ws2_32.dll','wininet.dll','ole32.dll','shell32.dll'];
const VAL_RE = /^(0x[0-9a-fA-F]+|\d+)$/;
const validVal = (s: string) => VAL_RE.test(s.trim());

interface ComboItem { value: string; known?: boolean; hint?: string }

function Combo({
  value,
  onChange,
  getItems,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  getItems: (q: string) => ComboItem[] & { _more?: number };
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ComboItem[]>([]);
  const [more, setMore] = useState(0);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function refresh(q: string) {
    const res = getItems(q);
    const m = (res as ComboItem[] & { _more?: number })._more ?? 0;
    setItems(res);
    setMore(m);
    setOpen(res.length > 0);
  }

  function pick(i: number) {
    const it = items[i];
    if (!it) return;
    onChange(it.value);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) refresh(value);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && items.length) {
      e.preventDefault(); e.stopPropagation();
      pick(active >= 0 ? active : 0);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation();
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (active < 0 || !popRef.current) return;
    const el = popRef.current.querySelectorAll<HTMLElement>('.combo-item')[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="combo">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { onChange(e.target.value); refresh(e.target.value); }}
        onFocus={() => { setActive(-1); refresh(value); }}
        onBlur={() => setTimeout(() => setOpen(false), 130)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div ref={popRef} className="combo-pop">
          {items.map((it, i) => (
            <div
              key={it.value}
              className={`combo-item${i === active ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setActive(i)}
            >
              {it.known && <span className="combo-f">ƒ</span>}
              <span className="combo-name">{it.value}</span>
              {it.hint && <span className="combo-hint">{it.hint}</span>}
            </div>
          ))}
          {more > 0 && <div className="combo-more">… 还有 {more} 个，继续输入缩小范围</div>}
        </div>
      )}
    </div>
  );
}

interface RuleEditorModalProps {
  open: boolean;
  initialRule: Rule | null;
  onConfirm: (rule: Rule) => void;
  onClose: () => void;
}

export function RuleEditorModal({ open, initialRule, onConfirm, onClose }: RuleEditorModalProps) {
  const [kind, setKind] = useState<RuleKind>('keepalive');
  const [name, setName] = useState('');
  const [intervalSec, setIntervalSec] = useState(30);
  const [dll, setDll] = useState('user32.dll');
  const [func, setFunc] = useState('');
  const [args, setArgs] = useState<[string, string, string, string]>(['', '', '', '']);
  const [callOriginal, setCallOriginal] = useState(true);
  const [retEnabled, setRetEnabled] = useState(false);
  const [retVal, setRetVal] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [funcs, setFuncs] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const sigEntry = kind !== 'keepalive' ? funcSig(func) : null;

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;
    setStatusMsg('');
    const r = initialRule;
    setKind(r ? r.kind : 'keepalive');
    setName(r ? r.name : '');
    setIntervalSec(r ? r.intervalSec : 30);
    setDll(r ? (r.dll || 'user32.dll') : 'user32.dll');
    setFunc(r ? (r.func || '') : '');
    setArgs(r ? [r.args[0] ?? '', r.args[1] ?? '', r.args[2] ?? '', r.args[3] ?? ''] : ['', '', '', '']);
    setCallOriginal(r ? r.callOriginal : true);
    setRetEnabled(r ? r.retOverride != null : false);
    setRetVal(r ? (r.retOverride ?? '') : '');
    setEnabled(r ? r.enabled : true);
    setTimeout(() => nameRef.current?.focus(), 30);
  }, [open, initialRule]);

  // Apply fixed DLL/func based on kind
  useEffect(() => {
    if (kind === 'idle' && !func) { setDll('user32.dll'); setFunc('GetLastInputInfo'); }
    if (kind === 'fg') { setDll('user32.dll'); setFunc('GetForegroundWindow'); }
    if (kind === 'uncapture') { setDll('user32.dll'); setFunc('SetWindowDisplayAffinity'); }
  }, [kind]);

  // Load functions when DLL changes
  useEffect(() => {
    if (kind === 'keepalive' || !dll) { setFuncs([]); return; }
    api.getExports(dll).then((names) => setFuncs(Array.isArray(names) ? names : [])).catch(() => setFuncs([]));
  }, [dll, kind]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); }
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        const rule = collectRule();
        if (rule) onConfirm(rule);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, kind, name, intervalSec, dll, func, args, callOriginal, retEnabled, retVal, enabled]);

  const getDllItems = useCallback((q: string) => {
    const ql = q.toLowerCase();
    return KNOWN_DLLS.filter((n) => n.toLowerCase().includes(ql)).map((n) => ({ value: n }));
  }, []);

  const getFuncItems = useCallback((q: string) => {
    const ql = q.toLowerCase();
    let m = ql ? funcs.filter((n) => n.toLowerCase().includes(ql)) : funcs.slice();
    m.sort((a, b) => {
      const ap = a.toLowerCase().startsWith(ql) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(ql) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ak = funcSig(a) ? 0 : 1, bk = funcSig(b) ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return a.length - b.length || a.localeCompare(b);
    });
    const CAP = 80, more = Math.max(0, m.length - CAP);
    const list = m.slice(0, CAP).map((n) => {
      const e = funcSig(n);
      return { value: n, known: !!e, hint: e ? `${e.r} · ${e.n || e.p.length}参` : '' };
    }) as (ComboItem[] & { _more?: number });
    list._more = more;
    return list;
  }, [funcs]);

  function collectRule(): Rule | null {
    if (kind === 'keepalive') {
      const sec = Math.min(3600, Math.max(1, intervalSec || 30));
      return {
        kind, enabled,
        intervalSec: sec,
        name: name.trim() || `保活 每${sec}秒`,
        args: [null, null, null, null],
        callOriginal: true, retOverride: null, dll: '', func: '',
      };
    }
    if (!dll.trim() || !func.trim()) { setStatusMsg('模块 DLL 和 函数名 不能为空'); return null; }
    const rule: Rule = {
      kind, enabled, dll: dll.trim(), func: func.trim(),
      intervalSec: 30,
      args: [null, null, null, null],
      callOriginal: true, retOverride: null,
      name: name.trim() || `${dll.trim()}!${func.trim()}`,
    };
    if (kind === 'hook') {
      const rawArgs: Rule['args'] = [null, null, null, null];
      for (let i = 0; i < 4; i++) {
        const v = args[i].trim();
        if (v) {
          if (!validVal(v)) { setStatusMsg(`入参 ${i} 格式不对（十进制或 0x 十六进制）: ${v}`); return null; }
          rawArgs[i] = v;
        }
      }
      rule.args = rawArgs;
      rule.callOriginal = callOriginal;
      if (retEnabled) {
        const v = retVal.trim();
        if (!validVal(v)) { setStatusMsg('返回值格式不对（十进制或 0x 十六进制）'); return null; }
        rule.retOverride = v;
      }
      if (!callOriginal && !retEnabled) {
        setRetEnabled(true);
        setStatusMsg('取消"调用原函数"时须设返回值');
        return null;
      }
    }
    return rule;
  }

  function handleConfirm() {
    const rule = collectRule();
    if (rule) onConfirm(rule);
  }

  if (!open) return null;

  const showKa = kind === 'keepalive';
  const showHd = kind !== 'keepalive';
  const showHook = kind === 'hook';
  const argParams = sigEntry?.p.slice(0, 4) ?? null;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <Icon name="edit" />
          <span>{initialRule ? '编辑规则' : '添加规则'}</span>
        </div>

        <div className="modal-body">
          {statusMsg && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{statusMsg}</div>}

          <div className="field">
            <label>名称</label>
            <input ref={nameRef} placeholder="（可留空，自动命名）" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label>类型</label>
            <div className="segmented">
              {(['keepalive','idle','fg','uncapture','hook'] as RuleKind[]).map((k) => (
                <button key={k} type="button" className={`seg${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
                  {k === 'keepalive' ? '保活' : k === 'idle' ? 'idle 归零' : k === 'fg' ? '前台伪装' : k === 'uncapture' ? '防截屏' : 'hook 拦截'}
                </button>
              ))}
            </div>
          </div>
          <div className="kind-desc">{KIND_DESC[kind]}</div>

          {showKa && (
            <div className="field">
              <label>间隔(秒)</label>
              <input type="number" min={1} max={3600} value={intervalSec} onChange={(e) => setIntervalSec(parseInt(e.target.value, 10) || 30)} />
            </div>
          )}

          {showHd && (
            <>
              <div className="field">
                <label>模块 DLL</label>
                <Combo value={dll} onChange={setDll} getItems={getDllItems} />
              </div>
              <div className="field">
                <label>函数名</label>
                <Combo
                  value={func}
                  onChange={setFunc}
                  getItems={getFuncItems}
                  placeholder="输入即筛选导出函数 · ↑↓ 选择 · 回车确认"
                />
              </div>
              {sigEntry && (
                <div className="func-sig">
                  <div className="sig-proto">{protoText(func, sigEntry)}</div>
                  <div className="sig-desc">{sigEntry.dll}.dll · {sigEntry.d}</div>
                </div>
              )}
            </>
          )}

          {showHook && (
            <>
              <div className="row-hook group-sep">
                <span className="gt">拦截动作</span>
                <span className="gh">改入参 · 调原函数 · 改返回；都不设 = 透传</span>
              </div>
              <div className="field args-field">
                <label>入参覆盖</label>
                <div className="args-rows">
                  {argParams === null || argParams.length === 0 ? (
                    sigEntry
                      ? <div className="args-none">该函数无参数，无需改入参</div>
                      : ARG_REGS.map((reg, i) => (
                          <ArgRow key={i} name={`arg${i}`} type="INT64" reg={reg}
                            desc={`未收录签名，按 x64 调用约定第 ${i+1} 个参数`}
                            value={args[i]} onChange={(v) => setArgs((a) => { const n = [...a] as typeof a; n[i] = v; return n; })} />
                        ))
                  ) : (
                    argParams.map((p, i) => (
                      <ArgRow key={i} name={p[0]} type={p[1]} reg={ARG_REGS[i]}
                        desc={p[2] || ''}
                        value={args[i]} onChange={(v) => setArgs((a) => { const n = [...a] as typeof a; n[i] = v; return n; })} />
                    ))
                  )}
                  {sigEntry && (sigEntry.n ?? sigEntry.p.length) > 4 && (
                    <div className="args-note">该函数共 {sigEntry.n ?? sigEntry.p.length} 个参数；第 5 个起在栈上，当前仅支持覆盖前 4 个（寄存器）参数。</div>
                  )}
                </div>
              </div>

              <label className="opt-row">
                <input type="checkbox" checked={callOriginal} onChange={(e) => {
                  setCallOriginal(e.target.checked);
                  if (!e.target.checked && !retEnabled) setRetEnabled(true);
                }} />
                <span className="opt-text">
                  <b>调用原函数</b>
                  <small>取消 = 完全拦截，直接返回下方 mock 值</small>
                </span>
              </label>

              <div className="field">
                <label>返回值</label>
                <div className="retrow">
                  <label className="chk">
                    <input type="checkbox" checked={retEnabled} onChange={(e) => setRetEnabled(e.target.checked)} />
                    <span>拦截返回 / mock</span>
                  </label>
                  <input
                    disabled={!retEnabled}
                    placeholder={sigEntry?.rd ?? '0 / 1 / 0x1'}
                    value={retVal}
                    onChange={(e) => setRetVal(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <label className="opt-row">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="opt-text"><b>启用此规则</b></span>
          </label>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={handleConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}

function ArgRow({
  name, type, reg, desc, value, onChange,
}: {
  name: string; type: string; reg: string; desc: string;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="arg-row">
      <div className="arg-meta">
        <span className="arg-name" title={desc || name}>{name}</span>
        <span className="arg-type" title={`${reg}${desc ? ' · ' + desc : ''}`}>{type}</span>
      </div>
      <input
        className="arg-in"
        value={value}
        placeholder="留空 = 不改"
        autoComplete="off"
        title={desc}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
