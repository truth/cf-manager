import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getLogs, getTunnelStatus, startTunnel, stopTunnel } from '../services/api';
import type { LogEntry, LogFilter, TunnelStatus } from '../types';

const MAX_LOG_ENTRIES = 500;

interface TunnelStatusEvent {
  message?: string;
  started_at?: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  tunnel_id?: string;
}

export function useTunnelStatus() {
  const [status, setStatus] = useState<TunnelStatus>({
    running: false,
    tunnel_id: undefined,
    started_at: undefined,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const nextStatus = await getTunnelStatus();
      setStatus(nextStatus);
      setError(null);
    } catch (fetchError) {
      setError(String(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchStatus();

    const unlistenPromise = listen<TunnelStatusEvent>('tunnel-status', (event) => {
      if (!active) {
        return;
      }

      const payload = event.payload;
      if (payload.status === 'running') {
        setStatus((prev) => ({
          ...prev,
          running: true,
          started_at: payload.started_at ?? prev.started_at ?? new Date().toISOString(),
          tunnel_id: payload.tunnel_id,
        }));
      }

      if (payload.status === 'stopped') {
        setStatus({
          running: false,
          started_at: undefined,
          tunnel_id: undefined,
        });
      }

      if (payload.status === 'error') {
        setError(payload.message ?? 'Tunnel returned an error status event.');
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [fetchStatus]);

  const start = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        await startTunnel(token);
        await fetchStatus();
      } catch (startError) {
        setError(String(startError));
        throw startError;
      } finally {
        setLoading(false);
      }
    },
    [fetchStatus],
  );

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      await stopTunnel();
      await fetchStatus();
    } catch (stopError) {
      setError(String(stopError));
      throw stopError;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  return { status, loading, error, start, stop, refresh: fetchStatus };
}

export function useTunnelLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');

  const appendLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry].slice(-MAX_LOG_ENTRIES));
  }, []);

  useEffect(() => {
    let active = true;

    void getLogs(MAX_LOG_ENTRIES).then((initialLogs) => {
      if (active) {
        setLogs(initialLogs);
      }
    });

    const unlistenLogPromise = listen<LogEntry>('tunnel-log', (event) => {
      if (active) {
        appendLog(event.payload);
      }
    });

    const unlistenErrorPromise = listen<LogEntry>('tunnel-error', (event) => {
      if (active) {
        appendLog(event.payload);
      }
    });

    return () => {
      active = false;
      void unlistenLogPromise.then((unlisten) => unlisten());
      void unlistenErrorPromise.then((unlisten) => unlisten());
    };
  }, [appendLog]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => filter === 'all' || log.level === filter);
  }, [filter, logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs: filteredLogs, allLogs: logs, filter, setFilter, clearLogs };
}
