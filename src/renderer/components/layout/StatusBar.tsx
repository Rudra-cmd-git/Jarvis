import { useControl } from '../../state/control-context';
import { useRuntime } from '../../state/runtime-context';
import { useVoice } from '../../state/voice-context';

export function StatusBar() {
  const { appInfo, error } = useRuntime();
  const { indicator, status } = useControl();
  const { listening, processing } = useVoice();

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        <span className={error ? 'status-led status-led--danger' : 'status-led'} aria-hidden="true" />
        <span>IPC BRIDGE {error ? 'OFFLINE' : 'ONLINE'}</span>
        <span>SQLITE {appInfo?.sqliteAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
        {(listening || processing) && (
          <span className="status-voice-indicator" data-testid="mic-indicator">
            <span className="status-led status-led--danger" aria-hidden="true" />
            {listening ? 'MIC ACTIVE' : 'TRANSCRIBING'}
          </span>
        )}
        {(indicator?.active || status?.paused) && (
          <span className="status-control-indicator" data-testid="control-indicator">
            <span className="status-led status-led--danger" aria-hidden="true" />
            {status?.paused ? 'CONTROL PAUSED' : indicator?.label.toUpperCase()}
          </span>
        )}
      </div>
      <div className="statusbar-group">
        <span>{appInfo ? `v${appInfo.appVersion}` : 'VERSION UNKNOWN'}</span>
        <span>LOCAL ONLY · NO TELEMETRY</span>
      </div>
    </footer>
  );
}
