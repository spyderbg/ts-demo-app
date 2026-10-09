import { useEffect } from 'react';

/** Connect before catalog loading, and release the backend when this page closes. */
export function useBackendLifetime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let pageActive = true;
    let connection: EventSource | undefined;
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (mounted && pageActive && !retry) retry = setTimeout(() => {
        retry = undefined;
        void connect();
      }, 500);
    };
    async function connect() {
      if (!mounted || !pageActive || connection || pending) return;
      const controller = new AbortController();
      pending = controller;
      try {
        // Establish the HttpOnly cookie used by EventSource, including after a restart.
        const response = await fetch('/api/session', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Backend session unavailable');
        const session = await response.json();
        if (!mounted || !pageActive || controller.signal.aborted || !session.autoShutdownOnClose) return;
        const stream = new EventSource('/api/lifecycle');
        connection = stream;
        stream.onerror = () => {
          stream.close();
          if (connection === stream) connection = undefined;
          scheduleRetry();
        };
      } catch {
        if (!controller.signal.aborted) scheduleRetry();
      } finally {
        if (pending === controller) pending = undefined;
      }
    }
    const disconnect = () => {
      clearTimeout(retry); retry = undefined;
      pending?.abort(); pending = undefined;
      connection?.close(); connection = undefined;
    };
    const onHide = () => { pageActive = false; disconnect(); };
    const onShow = () => { pageActive = true; void connect(); };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    void connect();
    return () => {
      mounted = false;
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      disconnect();
    };
  }, [enabled]);
}
