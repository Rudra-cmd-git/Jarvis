import { ViewIcon } from '../common/ViewIcon';
import { getNavigationItem } from '../../navigation';
import type { ViewId } from '../../../shared/types';

export function Sidebar({
  activeView,
  onNavigate,
  version,
  bridgeOnline,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  version: string;
  bridgeOnline: boolean;
}) {
  const items: ViewId[] = [
    'dashboard',
    'chat',
    'pc-control',
    'automation',
    'developer-hub',
    'knowledge',
    'productivity',
    'settings',
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          J
        </div>
        <div className="brand-copy">
          <div className="brand-name">J.A.R.V.I.S.</div>
          <div className="brand-sub">Personal AI System</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <p className="nav-heading">MODULES</p>
        <ul className="nav-list">
          {items.map((viewId) => {
            const item = getNavigationItem(viewId);
            const isActive = activeView === viewId;

            return (
              <li key={viewId}>
                <button
                  type="button"
                  className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                  onClick={() => onNavigate(viewId)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  data-view={viewId}
                >
                  <ViewIcon id={viewId} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-foot">
        <span className={`status-led${bridgeOnline ? '' : ' status-led--danger'}`} aria-hidden="true" />
        {bridgeOnline ? `Bridge online · v${version}` : 'Bridge offline'}
      </div>
    </aside>
  );
}
