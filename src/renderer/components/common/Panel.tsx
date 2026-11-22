import type { ReactNode } from 'react';

export function Panel({
  title,
  eyebrow,
  action,
  className = '',
  children,
  id,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(eyebrow || title || action) && (
        <header className="panel-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h3 className="panel-title">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
