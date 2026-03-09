import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getLogs, getRuntimeStatus, startProfile, stopAllProfiles, stopProfile } from '../services/api';
import type { LogEntry, LogFilter, ProfileType, TunnelStatus } from '../types';

const MAX_LOG_ENTRIES = 500;

interface ProfileStatusEvent {
  message?: string;
  started_at?: string;
  name?: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  tunnel_id?: string;
  type?: ProfileType;
  target?: string;
  local_endpoint?: string;
}

export function useProfileStatus() {
  const [status, setStatus] = useState<TunnelStatus>({
    running: false,
    running_count: 0,
    tunnels: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const nextStatus = await getRuntimeStatus();
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

    const unlistenPromise = listen<ProfileStatusEvent>('tunnel-status', (event) => {
      if (!active) {
        return;
      }

      const payload = event.payload;
      if (payload.status === 'running' || payload.status === 'stopped' || payload.status === 'starting') {
        void fetchStatus();
      }

      if (payload.status === 'error') {
        setError(payload.message ?? 'Profile returned an error status event.');
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [fetchStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchStatus();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchStatus]);

  const start = useCallback(
    async (profileId: string, _name?: string, _token?: string) => {
      setLoading(true);
      try {
        await startProfile(profileId);
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

  const startMany = useCallback(
    async (items: Array<{ id: string }>) => {
      setLoading(true);
      try {
        for (const item of items) {
          await startProfile(item.id);
        }
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

  const stop = useCallback(async (profileId: string) => {
    setLoading(true);
    try {
      await stopProfile(profileId);
      await fetchStatus();
    } catch (stopError) {
      setError(String(stopError));
      throw stopError;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const stopAll = useCallback(async () => {
    setLoading(true);
    try {
      await stopAllProfiles();
      await fetchStatus();
    } catch (stopError) {
      setError(String(stopError));
      throw stopError;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  return { status, loading, error, start, startMany, stop, stopAll, refresh: fetchStatus };
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
