import type { ReactNode } from 'react';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
}

export default function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
