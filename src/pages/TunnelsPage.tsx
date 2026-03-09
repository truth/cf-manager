import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import StatusBadge from '../components/ui/StatusBadge';
import { useTunnelStatus } from '../hooks/useTunnel';
import { useI18n } from '../i18n/I18nProvider';
import { deleteConfig, listTunnels, saveConfig } from '../services/api';
import type { ProfileType, PublishProfile, TunnelConfig } from '../types';

type DialogMode = 'create' | 'edit';

interface TunnelFormState {
  type: ProfileType;
  name: string;
  notes: string;
  tags: string;
  token: string;
  hostname: string;
  originUrl: string;
  targetHostname: string;
  localBindHost: string;
  localBindPort: string;
}

function isPublishConfig(config: TunnelConfig): config is PublishProfile {
  return config.type === 'publish';
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'Unknown';
  }
  return new Date(timestamp).toLocaleString();
}

function maskToken(token: string) {
  if (token.length <= 16) {
    return token;
  }
  return `${token.slice(0, 12)}...${token.slice(-4)}`;
}

function parseTags(input: string): string[] {
  const deduped = new Set(
    input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  return [...deduped];
}

function summarizeNotes(notes?: string) {
  const trimmed = (notes ?? '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 90) {
    return trimmed;
  }
  return `${trimmed.slice(0, 90)}...`;
}

function normalizeConfig(configs: TunnelConfig[]) {
  return [...configs].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function getConfigPreview(config: TunnelConfig) {
  if (config.type === 'publish') {
    return maskToken(config.token);
  }

  return `${config.local_bind_host}:${config.local_bind_port} → ${config.target_hostname}`;
}

function getTypeLabel(type: ProfileType, t: ReturnType<typeof useI18n>['t']) {
  return type === 'publish' ? t('profile.type.publish') : t('profile.type.forward');
}

function toFriendlyStartError(rawError: string, type: ProfileType, t: ReturnType<typeof useI18n>['t']) {
  const normalized = rawError.toLowerCase();

  if (type === 'publish' && normalized.includes('token') && normalized.includes('empty')) {
    return t('errors.start.tokenEmpty');
  }

  if (normalized.includes('already running')) {
    return t('errors.start.alreadyRunning');
  }

  if (normalized.includes('cloudflared') && (normalized.includes('not found') || normalized.includes('unable to launch'))) {
    return t('errors.start.cloudflaredMissing');
  }

  if (normalized.includes('bind') || normalized.includes('address already in use')) {
    return t('errors.start.portInUse', { details: rawError });
  }

  if (type === 'forward' && normalized.includes('hostname')) {
    return t('errors.start.hostnameInvalid', { details: rawError });
  }

  if (type === 'forward' && normalized.includes('access')) {
    return t('errors.start.accessAuthRequired', { details: rawError });
  }

  return t('errors.start.generic', { details: rawError });
}

function configToForm(config: TunnelConfig): TunnelFormState {
  if (isPublishConfig(config)) {
    return {
      type: 'publish',
      name: config.name,
      notes: config.notes ?? '',
      tags: (config.tags ?? []).join(', '),
      token: config.token,
      hostname: config.hostname ?? '',
      originUrl: config.origin_url ?? '',
      targetHostname: '',
      localBindHost: '127.0.0.1',
      localBindPort: '3000',
    };
  }

  return {
    type: 'forward',
    name: config.name,
    notes: config.notes ?? '',
    tags: (config.tags ?? []).join(', '),
    token: '',
    hostname: '',
    originUrl: '',
    targetHostname: config.target_hostname,
    localBindHost: config.local_bind_host,
    localBindPort: String(config.local_bind_port),
  };
}

function createEmptyForm(): TunnelFormState {
  return {
    type: 'publish',
    name: '',
    notes: '',
    tags: '',
    token: '',
    hostname: '',
    originUrl: '',
    targetHostname: '',
    localBindHost: '127.0.0.1',
    localBindPort: '3000',
  };
}

export default function TunnelsPage() {
  const { t } = useI18n();
  const { status, loading, error, refresh, start, startMany, stop, stopAll } = useTunnelStatus();
  const [configs, setConfigs] = useState<TunnelConfig[]>([]);
  const [isFetchingConfigs, setIsFetchingConfigs] = useState(false);
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null);
  const [checkedTunnelIds, setCheckedTunnelIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TunnelFormState>(createEmptyForm());
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setIsFetchingConfigs(true);
    try {
      const result = await listTunnels();
      setConfigs(normalizeConfig(result));
      setPageError(null);
    } catch (loadError) {
      setPageError(t('tunnels.alert.loadFailed', { details: String(loadError) }));
    } finally {
      setIsFetchingConfigs(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (configs.length === 0) {
      setSelectedTunnelId(null);
      setCheckedTunnelIds([]);
      return;
    }

    setSelectedTunnelId((prev) => {
      if (prev && configs.some((config) => config.id === prev)) {
        return prev;
      }
      return configs[0].id;
    });

    setCheckedTunnelIds((prev) => prev.filter((id) => configs.some((config) => config.id === id)));
  }, [configs]);

  const selectedConfig = useMemo(() => {
    if (!selectedTunnelId) {
      return null;
    }
    return configs.find((config) => config.id === selectedTunnelId) ?? null;
  }, [configs, selectedTunnelId]);

  const checkedConfigs = useMemo(
    () => configs.filter((config) => checkedTunnelIds.includes(config.id)),
    [checkedTunnelIds, configs],
  );

  const runningTunnelIds = useMemo(() => new Set(status.tunnels.map((item) => item.tunnel_id)), [status.tunnels]);

  const selectedRuntime = useMemo(() => {
    if (!selectedConfig) {
      return undefined;
    }
    return status.tunnels.find((item) => item.tunnel_id === selectedConfig.id);
  }, [selectedConfig, status.tunnels]);

  const resetDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogMode('create');
    setEditingId(null);
    setForm(createEmptyForm());
  }, []);

  const openCreateDialog = useCallback(() => {
    setDialogMode('create');
    setEditingId(null);
    setForm(createEmptyForm());
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((config: TunnelConfig) => {
    setDialogMode('edit');
    setEditingId(config.id);
    setForm(configToForm(config));
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    const name = form.name.trim();
    const notes = form.notes.trim();
    const tags = parseTags(form.tags);
    const now = new Date().toISOString();

    if (!name) {
      setPageError(t('tunnels.alert.requiredName'));
      return;
    }

    const baseConfig =
      dialogMode === 'edit' && editingId
        ? configs.find((config) => config.id === editingId)
        : undefined;

    let config: TunnelConfig;

    if (form.type === 'publish') {
      const token = form.token.trim();
      if (!token) {
        setPageError(t('tunnels.alert.requiredPublish'));
        return;
      }

      config = {
        type: 'publish',
        id: baseConfig?.id ?? crypto.randomUUID(),
        name,
        token,
        hostname: form.hostname.trim() || undefined,
        origin_url: form.originUrl.trim() || undefined,
        notes: notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
        created_at: baseConfig?.created_at ?? now,
        updated_at: now,
      };
    } else {
      const targetHostname = form.targetHostname.trim();
      const localBindHost = form.localBindHost.trim();
      const localBindPort = Number(form.localBindPort.trim());

      if (!targetHostname || !localBindHost || !Number.isInteger(localBindPort) || localBindPort < 1 || localBindPort > 65535) {
        setPageError(t('tunnels.alert.requiredForward'));
        return;
      }

      config = {
        type: 'forward',
        id: baseConfig?.id ?? crypto.randomUUID(),
        name,
        target_hostname: targetHostname,
        local_bind_host: localBindHost,
        local_bind_port: localBindPort,
        notes: notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
        created_at: baseConfig?.created_at ?? now,
        updated_at: now,
      };
    }

    try {
      await saveConfig(config);
      setConfigs((prev) => {
        const next = dialogMode === 'edit' ? prev.map((item) => (item.id === config.id ? config : item)) : [config, ...prev];
        return normalizeConfig(next);
      });
      setSelectedTunnelId(config.id);
      setPageSuccess(dialogMode === 'edit' ? t('tunnels.alert.updated') : t('tunnels.alert.saved'));
      setPageError(null);
      resetDialog();
    } catch (saveError) {
      setPageError(t('tunnels.alert.saveFailed', { details: String(saveError) }));
    }
  }, [configs, dialogMode, editingId, form, resetDialog, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConfig(id);
        setConfigs((prev) => prev.filter((config) => config.id !== id));
        setCheckedTunnelIds((prev) => prev.filter((value) => value !== id));
        setPageSuccess(t('tunnels.alert.deleted'));
        setPageError(null);
      } catch (deleteError) {
        setPageError(t('tunnels.alert.deleteFailed', { details: String(deleteError) }));
      }
    },
    [t],
  );

  const handleStart = useCallback(async () => {
    if (!selectedConfig) {
      setPageError(t('tunnels.alert.selectBeforeStart'));
      return;
    }

    try {
      await start(selectedConfig.id);
      setPageSuccess(t('tunnels.alert.started', { name: selectedConfig.name }));
      setPageError(null);
    } catch (startError) {
      const friendly = toFriendlyStartError(String(startError), selectedConfig.type, t);
      setPageError(t('tunnels.alert.startFailed', { details: friendly }));
    }
  }, [selectedConfig, start, t]);

  const handleStop = useCallback(async () => {
    if (!selectedConfig) {
      setPageError(t('tunnels.alert.selectBeforeStart'));
      return;
    }

    try {
      await stop(selectedConfig.id);
      setPageSuccess(t('tunnels.alert.stopped', { name: selectedConfig.name }));
      setPageError(null);
    } catch (stopError) {
      setPageError(t('tunnels.alert.stopFailed', { details: String(stopError) }));
    }
  }, [selectedConfig, stop, t]);

  const handleStartChecked = useCallback(async () => {
    if (checkedConfigs.length === 0) {
      setPageError(t('tunnels.alert.selectBeforeStart'));
      return;
    }

    try {
      await startMany(checkedConfigs.map((config) => ({ id: config.id })));
      setPageSuccess(t('tunnels.alert.batchStarted', { count: checkedConfigs.length }));
      setPageError(null);
    } catch (startError) {
      const type = checkedConfigs[0]?.type ?? 'publish';
      const friendly = toFriendlyStartError(String(startError), type, t);
      setPageError(t('tunnels.alert.startFailed', { details: friendly }));
    }
  }, [checkedConfigs, startMany, t]);

  const handleStopChecked = useCallback(async () => {
    const runningChecked = checkedConfigs.filter((config) => runningTunnelIds.has(config.id));
    if (runningChecked.length === 0) {
      setPageError(t('tunnels.alert.noneRunningSelected'));
      return;
    }

    try {
      for (const config of runningChecked) {
        await stop(config.id);
      }
      setPageSuccess(t('tunnels.alert.batchStopped', { count: runningChecked.length }));
      setPageError(null);
    } catch (stopError) {
      setPageError(t('tunnels.alert.stopFailed', { details: String(stopError) }));
    }
  }, [checkedConfigs, runningTunnelIds, stop, t]);

  const handleStopAll = useCallback(async () => {
    try {
      await stopAll();
      setPageSuccess(t('tunnels.alert.batchStopped', { count: status.running_count }));
      setPageError(null);
    } catch (stopError) {
      setPageError(t('tunnels.alert.stopFailed', { details: String(stopError) }));
    }
  }, [status.running_count, stopAll, t]);

  const dialogTitle = dialogMode === 'edit' ? t('tunnels.dialog.editTitle') : t('tunnels.dialog.createTitle');
  const dialogAction = dialogMode === 'edit' ? t('tunnels.dialog.update') : t('tunnels.dialog.save');

  return (
    <div className="page-stack">
      <section className="panel panel--hero">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">{t('tunnels.title')}</h2>
            <p className="panel__subtitle">{t('tunnels.subtitle')}</p>
          </div>
          <Button onClick={openCreateDialog} variant="primary">
            {t('tunnels.new')}
          </Button>
        </div>

        <div className="info-row">
          <StatusBadge tone={status.running ? 'success' : 'neutral'}>
            {status.running ? t('status.runningCount', { count: status.running_count }) : t('status.stopped')}
          </StatusBadge>
          <StatusBadge tone={selectedConfig ? 'info' : 'neutral'}>
            {selectedConfig ? t('status.selected', { name: selectedConfig.name }) : t('status.noneSelected')}
          </StatusBadge>
          <StatusBadge tone={checkedConfigs.length > 0 ? 'info' : 'neutral'}>
            {t('tunnels.checkedCount', { count: checkedConfigs.length })}
          </StatusBadge>
          {selectedRuntime?.started_at ? (
            <span className="text-muted">{t('tunnels.startedAt', { time: formatDate(selectedRuntime.started_at) })}</span>
          ) : null}
        </div>

        {error && selectedConfig ? <div className="alert alert--danger">{toFriendlyStartError(error, selectedConfig.type, t)}</div> : null}
        {pageError ? <div className="alert alert--danger">{pageError}</div> : null}
        {pageSuccess ? <div className="alert alert--success">{pageSuccess}</div> : null}

        <div className="action-row">
          <Button disabled={loading || !selectedConfig} onClick={handleStart} variant="primary">
            {t('tunnels.startSelected')}
          </Button>
          <Button disabled={loading || !selectedConfig || !runningTunnelIds.has(selectedConfig.id)} onClick={handleStop} variant="danger">
            {t('tunnels.stopTunnel')}
          </Button>
          <Button disabled={loading || checkedConfigs.length === 0} onClick={handleStartChecked} variant="primary">
            {t('tunnels.startChecked')}
          </Button>
          <Button disabled={loading || checkedConfigs.every((config) => !runningTunnelIds.has(config.id))} onClick={handleStopChecked} variant="danger">
            {t('tunnels.stopChecked')}
          </Button>
          <Button disabled={loading || status.running_count === 0} onClick={handleStopAll} variant="ghost">
            {t('tunnels.stopAll')}
          </Button>
          <Button disabled={isFetchingConfigs} onClick={() => void loadConfigs()} variant="secondary">
            {t('tunnels.refreshList')}
          </Button>
          <Button disabled={loading} onClick={() => void refresh()} variant="ghost">
            {t('tunnels.refreshStatus')}
          </Button>
        </div>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3 className="panel__title">{t('tunnels.selectedSection')}</h3>
          {selectedConfig ? (
            <div className="field-grid" style={{ marginTop: '14px' }}>
              <p className="text-muted">{t('tunnels.field.name')}</p>
              <p>{selectedConfig.name}</p>

              <p className="text-muted">{t('tunnels.field.type')}</p>
              <p>{getTypeLabel(selectedConfig.type, t)}</p>

              {isPublishConfig(selectedConfig) ? (
                <>
                  <p className="text-muted">{t('tunnels.field.tokenPreview')}</p>
                  <p className="token-preview">{maskToken(selectedConfig.token)}</p>
                  <p className="text-muted">{t('tunnels.field.hostname')}</p>
                  <p>{selectedConfig.hostname || t('tunnels.emptyValue')}</p>
                  <p className="text-muted">{t('tunnels.field.originUrl')}</p>
                  <p>{selectedConfig.origin_url || t('tunnels.emptyValue')}</p>
                </>
              ) : (
                <>
                  <p className="text-muted">{t('tunnels.field.targetHostname')}</p>
                  <p>{selectedConfig.target_hostname}</p>
                  <p className="text-muted">{t('tunnels.field.localBindHost')}</p>
                  <p>{selectedConfig.local_bind_host}</p>
                  <p className="text-muted">{t('tunnels.field.localBindPort')}</p>
                  <p>{selectedConfig.local_bind_port}</p>
                  <p className="text-muted">{t('tunnels.field.localAccessUrl')}</p>
                  <p>{`http://${selectedConfig.local_bind_host}:${selectedConfig.local_bind_port}`}</p>
                </>
              )}

              {selectedRuntime?.target ? (
                <>
                  <p className="text-muted">{t('tunnels.field.runtimeTarget')}</p>
                  <p>{selectedRuntime.target}</p>
                </>
              ) : null}
              {selectedRuntime?.local_endpoint ? (
                <>
                  <p className="text-muted">{t('tunnels.field.runtimeLocalEndpoint')}</p>
                  <p>{selectedRuntime.local_endpoint}</p>
                </>
              ) : null}

              <p className="text-muted">{t('tunnels.field.notes')}</p>
              <p className="notes-preview">{(selectedConfig.notes ?? '').trim() || t('tunnels.noNotes')}</p>
              <p className="text-muted">{t('tunnels.field.tags')}</p>
              <div className="tag-list">
                {(selectedConfig.tags ?? []).length > 0 ? (
                  (selectedConfig.tags ?? []).map((tag) => (
                    <span className="tag-chip" key={tag}>
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-muted">{t('tunnels.noTags')}</span>
                )}
              </div>
              <p className="text-muted">{t('tunnels.field.updated')}</p>
              <p>{formatDate(selectedConfig.updated_at)}</p>
            </div>
          ) : (
            <p className="empty-state">{t('tunnels.emptySelected')}</p>
          )}
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h3 className="panel__title">{t('tunnels.savedSection')}</h3>
              <p className="panel__subtitle">{t('tunnels.savedCount', { count: configs.length })}</p>
            </div>
          </div>

          {configs.length === 0 ? (
            <p className="empty-state">{t('tunnels.emptyList')}</p>
          ) : (
            <div className="tunnel-list">
              {configs.map((config) => {
                const isSelected = config.id === selectedTunnelId;
                const isChecked = checkedTunnelIds.includes(config.id);
                const isRunning = runningTunnelIds.has(config.id);
                const summary = summarizeNotes(config.notes);
                return (
                  <button
                    key={config.id}
                    className={`tunnel-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedTunnelId(config.id)}
                    type="button"
                  >
                    <div className="tunnel-card__top">
                      <input
                        checked={isChecked}
                        onChange={(event) => {
                          event.stopPropagation();
                          setCheckedTunnelIds((prev) => {
                            if (event.target.checked) {
                              if (prev.includes(config.id)) {
                                return prev;
                              }
                              return [...prev, config.id];
                            }
                            return prev.filter((id) => id !== config.id);
                          });
                        }}
                        onClick={(event) => event.stopPropagation()}
                        type="checkbox"
                      />
                      <h4 className="tunnel-card__title">{config.name}</h4>
                      <StatusBadge tone={isRunning ? 'success' : isSelected ? 'info' : 'neutral'}>
                        {isRunning ? t('status.running') : isSelected ? t('status.active') : t('status.saved')}
                      </StatusBadge>
                    </div>
                    <p className="text-muted">{getTypeLabel(config.type, t)}</p>
                    <p className="token-preview">{getConfigPreview(config)}</p>
                    {summary ? <p className="notes-preview">{summary}</p> : null}
                    {(config.tags ?? []).length > 0 ? (
                      <div className="tag-list">
                        {(config.tags ?? []).map((tag) => (
                          <span className="tag-chip" key={tag}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="tunnel-card__meta">{t('tunnels.field.created', { time: formatDate(config.created_at) })}</p>
                    <div className="row-actions">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDialog(config);
                        }}
                        variant="ghost"
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(config.id);
                        }}
                        variant="ghost"
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <Dialog
        description={t(form.type === 'publish' ? 'tunnels.dialog.publishSubtitle' : 'tunnels.dialog.forwardSubtitle')}
        footer={
          <div className="dialog-actions">
            <Button onClick={resetDialog} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSubmit()} variant="primary">
              {dialogAction}
            </Button>
          </div>
        }
        onClose={resetDialog}
        open={dialogOpen}
        title={dialogTitle}
      >
        <div className="field-grid">
          <div className="field-group">
            <label htmlFor="profile-type">{t('tunnels.dialog.type')}</label>
            <select
              className="select"
              id="profile-type"
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ProfileType }))}
              value={form.type}
            >
              <option value="publish">{t('profile.type.publish')}</option>
              <option value="forward">{t('profile.type.forward')}</option>
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="new-tunnel-name">{t('tunnels.dialog.name')}</label>
            <input
              className="input"
              id="new-tunnel-name"
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('tunnels.dialog.namePlaceholder')}
              type="text"
              value={form.name}
            />
          </div>

          {form.type === 'publish' ? (
            <>
              <div className="field-group">
                <label htmlFor="new-tunnel-token">{t('tunnels.dialog.token')}</label>
                <textarea
                  className="textarea"
                  id="new-tunnel-token"
                  onChange={(event) => setForm((prev) => ({ ...prev, token: event.target.value }))}
                  placeholder={t('tunnels.dialog.tokenPlaceholder')}
                  value={form.token}
                />
              </div>
              <div className="field-group">
                <label htmlFor="publish-hostname">{t('tunnels.dialog.hostname')}</label>
                <input
                  className="input"
                  id="publish-hostname"
                  onChange={(event) => setForm((prev) => ({ ...prev, hostname: event.target.value }))}
                  placeholder={t('tunnels.dialog.hostnamePlaceholder')}
                  type="text"
                  value={form.hostname}
                />
              </div>
              <div className="field-group">
                <label htmlFor="publish-origin-url">{t('tunnels.dialog.originUrl')}</label>
                <input
                  className="input"
                  id="publish-origin-url"
                  onChange={(event) => setForm((prev) => ({ ...prev, originUrl: event.target.value }))}
                  placeholder={t('tunnels.dialog.originUrlPlaceholder')}
                  type="text"
                  value={form.originUrl}
                />
              </div>
            </>
          ) : (
            <>
              <div className="field-group">
                <label htmlFor="forward-target-hostname">{t('tunnels.dialog.targetHostname')}</label>
                <input
                  className="input"
                  id="forward-target-hostname"
                  onChange={(event) => setForm((prev) => ({ ...prev, targetHostname: event.target.value }))}
                  placeholder={t('tunnels.dialog.targetHostnamePlaceholder')}
                  type="text"
                  value={form.targetHostname}
                />
              </div>
              <div className="field-group">
                <label htmlFor="forward-local-bind-host">{t('tunnels.dialog.localBindHost')}</label>
                <input
                  className="input"
                  id="forward-local-bind-host"
                  onChange={(event) => setForm((prev) => ({ ...prev, localBindHost: event.target.value }))}
                  placeholder={t('tunnels.dialog.localBindHostPlaceholder')}
                  type="text"
                  value={form.localBindHost}
                />
              </div>
              <div className="field-group">
                <label htmlFor="forward-local-bind-port">{t('tunnels.dialog.localBindPort')}</label>
                <input
                  className="input"
                  id="forward-local-bind-port"
                  onChange={(event) => setForm((prev) => ({ ...prev, localBindPort: event.target.value }))}
                  placeholder={t('tunnels.dialog.localBindPortPlaceholder')}
                  type="number"
                  value={form.localBindPort}
                />
              </div>
            </>
          )}

          <div className="field-group">
            <label htmlFor="new-tunnel-notes">{t('tunnels.dialog.notes')}</label>
            <textarea
              className="textarea"
              id="new-tunnel-notes"
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder={t('tunnels.dialog.notesPlaceholder')}
              value={form.notes}
            />
          </div>
          <div className="field-group">
            <label htmlFor="new-tunnel-tags">{t('tunnels.dialog.tags')}</label>
            <input
              className="input"
              id="new-tunnel-tags"
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder={t('tunnels.dialog.tagsPlaceholder')}
              type="text"
              value={form.tags}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
