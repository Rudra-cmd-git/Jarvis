export function DataRow({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}) {
  return (
    <div className="data-row">
      <span className="data-row-label">{label}</span>
      <div>
        <span className={`data-row-value data-row-value--${tone}`}>{value}</span>
        {detail && <span className="info-card-detail">{detail}</span>}
      </div>
    </div>
  );
}
