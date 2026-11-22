import type { ReactNode } from 'react';
import type { ViewId } from '../../../shared/types';

export function PageHeader({
  viewId,
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  viewId: ViewId;
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header" data-view-heading={viewId}>
      <div className="page-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
