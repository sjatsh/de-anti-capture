export function SvgSprites() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></symbol>
        <symbol id="i-inject" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></symbol>
        <symbol id="i-eject" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></symbol>
        <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></symbol>
        <symbol id="i-folder" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></symbol>
        <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
        <symbol id="i-monitor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></symbol>
        <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></symbol>
        <symbol id="i-activity" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></symbol>
        <symbol id="i-win-min" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
        <symbol id="i-win-max" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5"/></symbol>
        <symbol id="i-win-restore" viewBox="0 0 24 24"><rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4H18a2 2 0 0 1 2 2v7.5A1.5 1.5 0 0 1 18.5 15H17"/></symbol>
        <symbol id="i-win-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
        <linearGradient id="lgBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1"/><stop offset="1" stopColor="#8B5CF6"/>
        </linearGradient>
        <linearGradient id="lgPulse" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34D399"/><stop offset="1" stopColor="#22D3EE"/>
        </linearGradient>
        <symbol id="i-logo" viewBox="0 0 256 256">
          <rect x="20" y="20" width="216" height="216" rx="52" fill="url(#lgBg)"/>
          <rect x="58" y="68" width="140" height="104" rx="18" fill="#ffffff" fillOpacity="0.12" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="7"/>
          <path d="M58 96 H198" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="7"/>
          <circle cx="78" cy="82" r="4.6" fill="#ffffff"/>
          <circle cx="95" cy="82" r="4.6" fill="#ffffff"/>
          <path d="M70 140 H100 L113 116 L130 162 L145 134 H186" stroke="url(#lgPulse)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </symbol>
      </defs>
    </svg>
  );
}
