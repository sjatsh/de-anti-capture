import { useEffect } from 'react';
import { api } from '../lib/api';
import { useHookLogStore } from '../store/hookLogStore';

export function useHookLog() {
  const ingestLines = useHookLogStore((s) => s.ingestLines);
  const resetLog = useHookLogStore((s) => s.resetLog);

  useEffect(() => {
    let mounted = true;

    // Replay buffered lines first
    api.readHookLog().then((buf) => {
      if (!mounted || !Array.isArray(buf) || !buf.length) return;
      ingestLines(buf, true);
    }).catch(() => {});

    // Subscribe to real-time events
    const unsub = api.onHookLog((payload) => {
      if (!mounted || !payload) return;
      if (payload.reset) resetLog();
      if (payload.lines?.length) ingestLines(payload.lines, false);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [ingestLines, resetLog]);
}
