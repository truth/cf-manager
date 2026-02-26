import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import StatusBadge from '../components/ui/StatusBadge';
import { useTunnelStatus } from '../hooks/useTunnel';
import { useI18n } from '../i18n/I18nProvider';
import { deleteConfig, listTunnels, saveConfig } from '../services/api';
import type { TunnelConfig } from '../types';

type DialogMode = 'create' | 'edit';

interface TunnelFormState {
  name: string;
  notes: string;
  tags: string;
  token: string;
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

function toFriendlyStartError(rawError: string, t: ReturnType<typeof useI18n>['t']) {
  const normalized = rawError.toLowerCase();

  if (normalized.includes('token') && normalized.includes('empty')) {
    return t('errors.start.tokenEmpty');
  }

  if (normalized.includes('already running')) {
    return t('errors.start.alreadyRunning');
  }

  if (
    normalized.includes('cloudflared') &&
    (normalized.includes('not found') || normalized.includes('unable to launch') || normalized.includes('spawn'))
  ) {
    return t('errors.start.cloudflaredMissing');
  }

  return t('errors.start.generic', { details: rawError });
}

function configToForm(config: TunnelConfig): TunnelFormState {
  return {
    name: config.name,
    notes: config.notes ?? '',
    tags: (config.tags ?? []).join(', '),
    token: config.token,
  };
}

function createEmptyForm(): TunnelFormState {
  return {
    name: '',
    notes: '',
    tags: '',
    token: '',
  };
}

export default function TunnelsPage() {
  const { t } = useI18n();
  const { status, loading, error, refresh, start, stop } = useTunnelStatus();
  const [configs, setConfigs] = useState<TunnelConfig[]>([]);
  const [isFetchingConfigs, setIsFetchingConfigs] = useState(false);
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null);
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
      return;
    }

    setSelectedTunnelId((prev) => {
      if (prev && configs.some((config) => config.id === prev)) {
        return prev;
      }
      return configs[0].id;
    });
  }, [configs]);

  const selectedConfig = useMemo(() => {
    if (!selectedTunnelId) {
      return null;
    }
    return configs.find((config) => config.id === selectedTunnelId) ?? null;
  }, [configs, selectedTunnelId]);

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
    const token = form.token.trim();

    if (!name || !token) {
      setPageError(t('tunnels.alert.required'));
      return;
    }

    const notes = form.notes.trim();
    const tags = parseTags(form.tags);
    const now = new Date().toISOString();

    const baseConfig =
      dialogMode === 'edit' && editingId
        ? configs.find((config) => config.id === editingId)
        : undefined;

    const config: TunnelConfig = {
      id: baseConfig?.id ?? crypto.randomUUID(),
      name,
      token,
      notes: notes || undefined,
      tags: tags.length > 0 ? tags : undefined,
      created_at: baseConfig?.created_at ?? now,
      updated_at: now,
    };

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
  }, [configs, dialogMode, editingId, form.name, form.notes, form.tags, form.token, resetDialog, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConfig(id);
        setConfigs((prev) => prev.filter((config) => config.id !== id));
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
      await start(selectedConfig.token);
      setPageSuccess(t('tunnels.alert.started', { name: selectedConfig.name }));
      setPageError(null);
    } catch (startError) {
      const friendly = toFriendlyStartError(String(startError), t);
      setPageError(t('tunnels.alert.startFailed', { details: friendly }));
    }
  }, [selectedConfig, start, t]);

  const handleStop = useCallback(async () => {
    try {
      await stop();
      setPageSuccess(t('tunnels.alert.stopped'));
      setPageError(null);
    } catch (stopError) {
      setPageError(t('tunnels.alert.stopFailed', { details: String(stopError) }));
    }
  }, [stop, t]);

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
            {status.running ? t('status.running') : t('status.stopped')}
          </StatusBadge>
          <StatusBadge tone={selectedConfig ? 'info' : 'neutral'}>
            {selectedConfig ? t('status.selected', { name: selectedConfig.name }) : t('status.noneSelected')}
          </StatusBadge>
          {status.started_at ? (
            <span className="text-muted">{t('tunnels.startedAt', { time: formatDate(status.started_at) })}</span>
          ) : null}
        </div>

        {error ? <div className="alert alert--danger">{toFriendlyStartError(error, t)}</div> : null}
        {pageError ? <div className="alert alert--danger">{pageError}</div> : null}
        {pageSuccess ? <div className="alert alert--success">{pageSuccess}</div> : null}

        <div className="action-row">
          {status.running ? (
            <Button disabled={loading} onClick={handleStop} variant="danger">
              {t('tunnels.stopTunnel')}
            </Button>
          ) : (
            <Button disabled={loading || !selectedConfig} onClick={handleStart} variant="primary">
              {t('tunnels.startSelected')}
            </Button>
          )}
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
              <p className="text-muted">{t('tunnels.field.tokenPreview')}</p>
              <p className="token-preview">{maskToken(selectedConfig.token)}</p>
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
                const summary = summarizeNotes(config.notes);
                return (
                  <button
                    key={config.id}
                    className={`tunnel-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedTunnelId(config.id)}
                    type="button"
                  >
                    <div className="tunnel-card__top">
                      <h4 className="tunnel-card__title">{config.name}</h4>
                      <StatusBadge tone={isSelected ? 'info' : 'neutral'}>
                        {isSelected ? t('status.active') : t('status.saved')}
                      </StatusBadge>
                    </div>
                    <p className="token-preview">{maskToken(config.token)}</p>
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
        description={t('tunnels.dialog.subtitle')}
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
