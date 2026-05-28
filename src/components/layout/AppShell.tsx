import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Icon, { type IconName } from '../ui/Icon';

export type AppPage = 'tunnels' | 'logs' | 'settings';

export interface NavItem {
  id: AppPage;
  label: string;
  description: string;
  icon: IconName;
}

interface AppShellProps {
  children: ReactNode;
  currentPage: AppPage;
  footerText: string;
  navItems: NavItem[];
  onPageChange: (page: AppPage) => void;
}

export default function AppShell({
  children,
  currentPage,
  footerText,
  navItems,
  onPageChange,
}: AppShellProps) {
  const { t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const activeItem = navItems.find((item) => item.id === currentPage);
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <div className="brand-block">
          <span className="brand-block__logo">
            <Icon name="tunnels" size={22} />
          </span>
          <div>
            <h1 className="brand-block__title">{t('app.brand.title')}</h1>
            <p className="brand-block__subtitle">{t('app.brand.subtitle')}</p>
          </div>
        </div>

        <nav className="side-nav" aria-label={t('app.brand.title')}>
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`side-nav__item ${isActive ? 'is-active' : ''}`}
                onClick={() => onPageChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="side-nav__icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="side-nav__text">
                  <span className="side-nav__label">{item.label}</span>
                  <span className="side-nav__hint">{item.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="side-panel__footer">
          <Icon name="docs" size={16} />
          <span>{t('app.brand.kicker')}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace__header">
          <div>
            <h2 className="workspace__heading">{activeItem?.label}</h2>
            {activeItem?.description ? (
              <p className="workspace__heading-sub">{activeItem.description}</p>
            ) : null}
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? t('app.theme.switchToLight') : t('app.theme.switchToDark')}
              title={isDark ? t('app.theme.switchToLight') : t('app.theme.switchToDark')}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </header>

        <main className="workspace__body">{children}</main>
        <footer className="workspace__footer">{footerText}</footer>
      </section>
    </div>
  );
}
