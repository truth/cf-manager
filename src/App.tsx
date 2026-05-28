import { useMemo, useState } from 'react';
import AppShell, { type AppPage, type NavItem } from './components/layout/AppShell';
import { useI18n } from './i18n/I18nProvider';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';
import TunnelsPage from './pages/TunnelsPage';

function App() {
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState<AppPage>('tunnels');

  const navItems: NavItem[] = useMemo(
    () => [
      {
        id: 'tunnels',
        label: t('app.nav.tunnels.label'),
        description: t('app.nav.tunnels.hint'),
        icon: 'tunnels',
      },
      {
        id: 'logs',
        label: t('app.nav.logs.label'),
        description: t('app.nav.logs.hint'),
        icon: 'logs',
      },
      {
        id: 'settings',
        label: t('app.nav.settings.label'),
        description: t('app.nav.settings.hint'),
        icon: 'settings',
      },
    ],
    [t],
  );

  const pageContent = useMemo(() => {
    switch (currentPage) {
      case 'tunnels':
        return <TunnelsPage />;
      case 'logs':
        return <LogsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  }, [currentPage]);

  const footerText = t('app.footer', { time: new Date().toLocaleString() });

  return (
    <AppShell
      currentPage={currentPage}
      footerText={footerText}
      navItems={navItems}
      onPageChange={setCurrentPage}
    >
      {pageContent}
    </AppShell>
  );
}

export default App;
