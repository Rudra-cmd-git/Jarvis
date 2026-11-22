import { useNow } from '../../hooks/useNow';
import { formatClock } from '../../../shared/format';
import type { ViewId } from '../../../shared/types';
import { getNavigationItem } from '../../navigation';

export function TopBar({ viewId }: { viewId: ViewId }) {
  const now = useNow();
  const item = getNavigationItem(viewId);

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <span className="topbar-subtitle">J.A.R.V.I.S.</span>
        <span className="topbar-title">{item.label}</span>
      </div>
      <div className="topbar-actions">
        <span className="topbar-subtitle">{formatClock(now, true)}</span>
        <span className="pill pill--neutral">LOCAL MODE</span>
      </div>
    </header>
  );
}
