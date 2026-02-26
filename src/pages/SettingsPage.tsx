import { useState } from 'react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/messages';
import type { AppSettings } from '../types';

const THEMES: AppSettings['theme'][] = ['dark', 'light', 'system'];
const RETENTION_DAYS = [1, 7, 14, 30] as const;
const LOCALES: Locale[] = ['en-US', 'zh-CN'];

export default function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    autoStart: false,
    minimizeToTray: true,
    theme: 'dark',
    logRetentionDays: 7,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSave = () => {
    // Placeholder: backend persistence is not wired yet.
    console.info('Settings saved:', settings);
    setSavedAt(new Date().toLocaleTimeString());
  };

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
            {THEMES.map((theme) => (
              <label className="toggle-row" key={theme}>
                <input
                  checked={settings.theme === theme}
                  name="theme"
                  onChange={() => setSettings((prev) => ({ ...prev, theme }))}
                  type="radio"
                  value={theme}
                />
                {t(`settings.theme.${theme}`)}
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
