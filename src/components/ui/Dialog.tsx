import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import Button from './Button';

interface DialogProps {
  children: ReactNode;
  description?: string;
  footer: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}

export default function Dialog({
  children,
  description,
  footer,
  onClose,
  open,
  title,
}: DialogProps) {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="dialog-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-card__header">
          <div>
            <h2 className="dialog-card__title">{title}</h2>
            {description ? <p className="dialog-card__description">{description}</p> : null}
          </div>
          <Button aria-label={t('common.close')} onClick={onClose} variant="ghost">
            {t('common.close')}
          </Button>
        </header>
        <div className="dialog-card__body">{children}</div>
        <footer className="dialog-card__footer">{footer}</footer>
      </section>
    </div>
  );
}
