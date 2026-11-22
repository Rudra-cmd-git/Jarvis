export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="loading-state" data-loading={label}>
      <span className="eyebrow">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ width: `${100 - index * 7}%` }} />
      ))}
    </div>
  );
}
