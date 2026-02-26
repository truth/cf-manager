import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { messages, resolveLocale, type Locale, type MessageKey } from './messages';

interface TranslateParams {
  [key: string]: number | string;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
}

const I18N_STORAGE_KEY = 'cf-manager.locale';

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  try {
    const savedLocale = window.localStorage.getItem(I18N_STORAGE_KEY);
    return resolveLocale(savedLocale ?? window.navigator.language);
  } catch {
    return 'en-US';
  }
}

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(I18N_STORAGE_KEY, nextLocale);
    } catch {
      // Ignore storage failures and keep runtime locale.
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) => {
      const current = messages[locale][key] ?? messages['en-US'][key] ?? key;
      return formatMessage(current, params);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
