import { useRuntime } from '../../state/runtime-context';

export function StatusBar() {
  const { appInfo, error } = useRuntime();

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        <span className={error ? 'status-led status-led--danger' : 'status-led'} aria-hidden="true" />
        <span>IPC BRIDGE {error ? 'OFFLINE' : 'ONLINE'}</span>
        <span>SQLITE {appInfo?.sqliteAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
      </div>
      <div className="statusbar-group">
        <span>{appInfo ? `v${appInfo.appVersion}` : 'VERSION UNKNOWN'}</span>
        <span>LOCAL ONLY · NO TELEMETRY</span>
      </div>
    </footer>
  );
}
