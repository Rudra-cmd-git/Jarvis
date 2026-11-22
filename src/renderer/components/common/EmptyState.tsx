import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  meta,
  action,
  testId,
}: {
  title: string;
  description: string;
  meta?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="empty-state" data-empty={testId}>
      <strong>{title}</strong>
      <p>{description}</p>
      {meta && <span className="empty-state-meta">{meta}</span>}
      {action}
    </div>
  );
}
