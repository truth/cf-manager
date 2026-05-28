import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import { useTunnelLogs } from '../hooks/useTunnel';
import { useI18n } from '../i18n/I18nProvider';
import { clearLogsApi } from '../services/api';
import type { LogFilter } from '../types';

const LOG_FILTER_OPTIONS: LogFilter[] = ['all', 'debug', 'info', 'warn', 'error'];

function isLogFilter(value: string): value is LogFilter {
  return LOG_FILTER_OPTIONS.includes(value as LogFilter);
}

export default function LogsPage() {
  const { t } = useI18n();
  const { clearLogs, filter, logs, setFilter } = useTunnelLogs();
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const visibleLogs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return logs;
    }

    return logs.filter((log) => {
      const message = log.message.toLowerCase();
      const source = log.source.toLowerCase();
      return message.includes(keyword) || source.includes(keyword);
    });
  }, [logs, search]);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll, visibleLogs]);

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextFilter = event.target.value;
    if (isLogFilter(nextFilter)) {
      setFilter(nextFilter);
    }
  };

  const handleClear = async () => {
    try {
      await clearLogsApi();
      clearLogs();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(t('logs.clearFailed', { details: String(error) }));
    }
  };

  return (
    <div className="page-stack">
      <section className="panel panel--hero">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">{t('logs.title')}</h2>
            <p className="panel__subtitle">{t('logs.subtitle')}</p>
          </div>
          <StatusBadge tone="info">{t('status.lines', { count: visibleLogs.length })}</StatusBadge>
        </div>

        <div className="log-toolbar">
          <input
            className="input log-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('logs.search')}
            type="text"
            value={search}
          />

          <select className="select" onChange={handleFilterChange} value={filter}>
            {LOG_FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>

          <Button onClick={() => void handleClear()} variant="secondary">
            <Icon name="trash" size={15} />
            {t('logs.clear')}
          </Button>
        </div>

        <label className="checkbox-row text-muted">
          <input
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
            type="checkbox"
          />
          {t('logs.autoScroll')}
        </label>

        {errorMessage ? <div className="alert alert--danger">{errorMessage}</div> : null}
      </section>

      <section className="panel">
        <div className="log-view">
          {visibleLogs.length === 0 ? (
            <p className="log-empty">{t('logs.empty')}</p>
          ) : (
            <>
              {visibleLogs.map((log) => (
                <article className="log-row" key={log.id}>
                  <time className="log-row__time">{new Date(log.timestamp).toLocaleTimeString()}</time>
                  <span className={`log-row__level log-row__level--${log.level}`}>{log.level.toUpperCase()}</span>
                  <p className="log-row__message">[{log.source}] {log.message}</p>
                </article>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
