import { formatPercent } from '../../../shared/format';

export function MetricBar({
  label,
  value,
  detail,
  tone = 'default',
  testId,
}: {
  label: string;
  value: number | null;
  detail?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
  testId?: string;
}) {
  const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value ?? 0)) : 0;

  return (
    <article className="metric-card" data-metric={testId}>
      <div className="metric-card-header">
        <span className="metric-card-label">{label}</span>
        <strong className="metric-card-value">{value === null ? '—' : formatPercent(value, 1)}</strong>
      </div>
      <div className="metric-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue}>
        <div className={`metric-bar-fill metric-bar-fill--${tone}`} style={{ width: `${safeValue}%` }} />
      </div>
      {detail && <span className="metric-card-detail">{detail}</span>}
    </article>
  );
}
