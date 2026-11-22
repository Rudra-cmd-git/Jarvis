import type { ReactNode } from 'react';

type StatusTone = 'good' | 'warn' | 'danger' | 'neutral' | 'accent';

export function StatusPill({
  tone = 'neutral',
  children,
  dot = true,
}: {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill pill--${tone}`}>
      {dot && <span className="status-led" aria-hidden="true" />}
      {children}
    </span>
  );
}
