import { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';
import { detectCloudflared } from '../services/api';
import type { Locale } from '../i18n/messages';
import type { AppSettings, CloudflaredInfo } from '../types';

const THEMES: AppSettings['theme'][] = ['dark', 'light', 'system'];
const RETENTION_DAYS = [1, 7, 14, 30] as const;
const LOCALES: Locale[] = ['en-US', 'zh-CN'];

export default function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>({
    autoStart: false,
    minimizeToTray: true,
    theme: 'light',
    logRetentionDays: 7,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cloudflaredInfo, setCloudflaredInfo] = useState<CloudflaredInfo | null>(null);
  const [checkingClient, setCheckingClient] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const handleSave = () => {
    console.info('Settings saved:', settings);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const loadClientInfo = async () => {
    setCheckingClient(true);
    try {
      const info = await detectCloudflared();
      setCloudflaredInfo(info);
      setClientError(null);
    } catch (error) {
      setClientError(String(error));
    } finally {
      setCheckingClient(false);
    }
  };

  useEffect(() => {
    void loadClientInfo();
  }, []);

  return (
    <div className="page-stack">
      <section className="panel panel--hero">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">{t('settings.title')}</h2>
            <p className="panel__subtitle">{t('settings.subtitle')}</p>
          </div>
          <StatusBadge tone={savedAt ? 'success' : 'neutral'}>
            {savedAt ? t('status.savedAt', { time: savedAt }) : t('status.notSaved')}
          </StatusBadge>
        </div>

        {savedAt ? <div className="alert alert--success">{t('settings.saved')}</div> : null}

        <div className="action-row">
          <Button onClick={handleSave} variant="primary">
            {t('settings.saveButton')}
          </Button>
        </div>
      </section>

      <section className="settings-grid">
        <article className="setting-card">
          <h3 className="setting-card__title">{t('settings.client.title')}</h3>
          <p className="setting-card__description">{t('settings.client.subtitle')}</p>

          <StatusBadge tone={cloudflaredInfo?.found ? 'success' : 'neutral'}>
            {cloudflaredInfo?.found ? t('settings.client.installed') : t('settings.client.missing')}
          </StatusBadge>

          {clientError ? <div className="alert alert--danger">{t('settings.client.detectFailed', { details: clientError })}</div> : null}

          <div className="field-grid" style={{ marginTop: '14px' }}>
            <p className="text-muted">{t('settings.client.path')}</p>
            <p>{cloudflaredInfo?.path ?? t('settings.client.empty')}</p>
            <p className="text-muted">{t('settings.client.source')}</p>
            <p>{cloudflaredInfo?.source ?? t('settings.client.empty')}</p>
            <p className="text-muted">{t('settings.client.version')}</p>
            <p>{cloudflaredInfo?.version ?? t('settings.client.empty')}</p>
          </div>

          <div className="action-row">
            <Button disabled={checkingClient} onClick={() => void loadClientInfo()} variant="secondary">
              {t('settings.client.refresh')}
            </Button>
          </div>
        </article>

        <article className="setting-card">
          <h3 className="setting-card__title">{t('settings.language.title')}</h3>
          <p className="setting-card__description">{t('settings.language.subtitle')}</p>

          <div className="field-group">
            <label htmlFor="display-language">{t('settings.language.label')}</label>
            <select
              className="select"
              id="display-language"
              onChange={(event) => setLocale(event.target.value as Locale)}
              value={locale}
            >
              {LOCALES.map((item) => (
                <option key={item} value={item}>
                  {t(`settings.language.${item}`)}
                </option>
              ))}
            </select>
          </div>
        </article>

        <article className="setting-card">
          <h3 className="setting-card__title">{t('settings.startup.title')}</h3>
          <p className="setting-card__description">{t('settings.startup.subtitle')}</p>

          <label className="toggle-row">
            <input
              checked={settings.autoStart}
              onChange={(event) => setSettings((prev) => ({ ...prev, autoStart: event.target.checked }))}
              type="checkbox"
            />
            {t('settings.startup.autoStart')}
          </label>

          <label className="toggle-row">
            <input
              checked={settings.minimizeToTray}
              onChange={(event) => setSettings((prev) => ({ ...prev, minimizeToTray: event.target.checked }))}
              type="checkbox"
            />
            {t('settings.startup.minimizeToTray')}
          </label>
        </article>

        <article className="setting-card">
          <h3 className="setting-card__title">{t('settings.appearance.title')}</h3>
          <p className="setting-card__description">{t('settings.appearance.subtitle')}</p>

          <div className="inline-options">
            {THEMES.map((option) => (
              <label className="toggle-row" key={option}>
                <input
                  checked={theme === option}
                  name="theme"
                  onChange={() => setTheme(option)}
                  type="radio"
                  value={option}
                />
                {t(`settings.theme.${option}`)}
              </label>
            ))}
          </div>
        </article>

        <article className="setting-card">
          <h3 className="setting-card__title">{t('settings.logs.title')}</h3>
          <p className="setting-card__description">{t('settings.logs.subtitle')}</p>

          <div className="field-group">
            <label htmlFor="log-retention-days">{t('settings.logs.label')}</label>
            <select
              className="select"
              id="log-retention-days"
              onChange={(event) => setSettings((prev) => ({ ...prev, logRetentionDays: Number(event.target.value) }))}
              value={settings.logRetentionDays}
            >
              {RETENTION_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t(`settings.retention.${days}`)}
                </option>
              ))}
            </select>
          </div>
        </article>
      </section>
    </div>
  );
}
