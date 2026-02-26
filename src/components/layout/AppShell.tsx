import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

export type AppPage = 'tunnels' | 'logs' | 'settings';

export interface NavItem {
  id: AppPage;
  label: string;
  description: string;
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

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <div className="brand-block">
          <p className="brand-block__kicker">{t('app.brand.kicker')}</p>
          <h1 className="brand-block__title">{t('app.brand.title')}</h1>
          <p className="brand-block__subtitle">{t('app.brand.subtitle')}</p>
        </div>

        <nav className="side-nav" aria-label={t('app.nav.tunnels.label')}>
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`side-nav__item ${isActive ? 'is-active' : ''}`}
                onClick={() => onPageChange(item.id)}
              >
                <span className="side-nav__label">{item.label}</span>
                <span className="side-nav__hint">{item.description}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <main className="workspace__body">{children}</main>
        <footer className="workspace__footer">{footerText}</footer>
      </section>
    </div>
  );
}
