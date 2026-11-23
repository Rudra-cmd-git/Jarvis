import { DataRow } from '../common/DataRow';
import { Panel } from '../common/Panel';
import { StatusPill } from '../common/StatusPill';
import { Button } from '../common/Button';
import { useCore } from '../../state/core-context';
import { formatDateTime } from '../../../shared/format';

export function StoragePanel() {
  const { coreStatus, secretStatus, refresh, loading } = useCore();
  const database = coreStatus?.database;
  const secrets = secretStatus ?? coreStatus?.secretStorage;

  return (
    <Panel
      title="Storage & secrets"
      eyebrow="MAIN PROCESS · SQLITE + SAFESTORAGE"
      action={
        <Button onClick={() => void refresh()} disabled={loading} data-action="refresh-storage">
          {loading ? 'Reading…' : 'Refresh'}
        </Button>
      }
    >
      <div data-testid="database-status" data-schema-version={database?.schemaVersion ?? 0}>
        <DataRow
          label="Database"
          value={database?.initialized ? 'Initialized' : 'Unavailable'}
          tone={database?.initialized ? 'good' : 'danger'}
        />
        <DataRow label="Schema version" value={database ? String(database.schemaVersion) : '—'} />
        <DataRow label="Journal mode" value={database?.journalMode ?? '—'} />
        <DataRow label="Database file" value={database?.filePath || '—'} detail={database?.error ?? undefined} />
      </div>

      <div className="settings-subhead">
        <span className="eyebrow">APPLIED MIGRATIONS</span>
      </div>
      {database && database.appliedMigrations.length > 0 ? (
        <ul className="migration-list">
          {database.appliedMigrations.map((migration) => (
            <li key={migration.version}>
              <span className="mono">v{migration.version}</span>
              <span>{migration.name}</span>
              <span className="migration-time">{formatDateTime(migration.appliedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-note">No migrations are recorded.</p>
      )}

      <div className="settings-subhead">
        <span className="eyebrow">ENCRYPTED CREDENTIAL STORE</span>
      </div>
      <DataRow
        label="safeStorage"
        value={secrets?.available ? 'Available' : 'Unavailable'}
        tone={secrets?.available ? 'good' : 'danger'}
        detail={secrets?.backend}
      />
      <DataRow label="Stored credentials" value={secrets ? String(secrets.entryCount) : '—'} />
      {secrets?.error && <p className="settings-note settings-note--danger">{secrets.error}</p>}
      {!secrets?.available && (
        <p className="settings-note settings-note--warn">
          Secure credential storage is not available on this system. JARVIS will refuse to save keys
          and will never fall back to plaintext.
        </p>
      )}
      <div className="settings-inline">
        <StatusPill tone={database?.initialized ? 'good' : 'danger'}>
          {database?.initialized ? 'Persistence online' : 'Persistence offline'}
        </StatusPill>
        <StatusPill tone={secrets?.available ? 'good' : 'warn'}>
          {secrets?.available ? 'Keys encrypted' : 'Keys disabled'}
        </StatusPill>
      </div>
    </Panel>
  );
}
