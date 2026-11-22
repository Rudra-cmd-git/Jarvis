interface InfoCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'good' | 'warn';
}

export function InfoCard({ label, value, detail, tone = 'default' }: InfoCardProps) {
  return (
    <article className={`info-card info-card--${tone}`}>
      <span className="info-card-label">{label}</span>
      <strong className="info-card-value">{value}</strong>
      {detail && <span className="info-card-detail">{detail}</span>}
    </article>
  );
}
