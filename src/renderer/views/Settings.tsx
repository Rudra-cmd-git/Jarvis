import { useState } from 'react';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { AiPanel } from '../components/settings/AiPanel';
import { AppearancePanel } from '../components/settings/AppearancePanel';
import { ActivityPanel } from '../components/settings/ActivityPanel';
import { PermissionsPanel } from '../components/settings/PermissionsPanel';
import { ProvidersPanel } from '../components/settings/ProvidersPanel';
import { StoragePanel } from '../components/settings/StoragePanel';
import { useCore } from '../state/core-context';
import { useRuntime } from '../state/runtime-context';
import { formatDateTime } from '../../shared/format';
import type { ViewId } from '../../shared/types';

export function SettingsView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { appInfo, error: runtimeError, refreshing, refresh, lastLoadedAt } = useRuntime();
  const { loading, error, refresh: refreshCore } = useCore();
  const [quitPending, setQuitPending] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const handleQuit = async () => {
    setQuitPending(true);
    setActionNote(null);

    try {
      const result = await window.jarvis.quitApp();
      setActionNote(result.accepted ? 'JARVIS is closing.' : 'Quit canceled. JARVIS is still running.');
    } catch (cause) {
      setActionNote(cause instanceof Error ? cause.message : 'Quit request failed.');
    } finally {
      setQuitPending(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refresh(), refreshCore()]);
  };

  return (
    <main className="view" data-view="settings">
      <PageHeader
        viewId="settings"
        eyebrow="RUNTIME, STORAGE & SECURITY"
        title="Settings"
        subtitle="Persistent configuration backed by SQLite, encrypted credentials, explicit permissions, and a real activity trail."
        actions={
          <Button variant="primary" onClick={() => void refreshAll()} disabled={refreshing || loading}>
            {refreshing || loading ? 'Refreshing…' : 'Refresh all'}
          </Button>
        }
      />

      {error && (
        <ErrorState
          title="Core services unavailable"
          message={error}
          onRetry={() => void refreshCore()}
        />
      )}

      {loading && !error && <LoadingState label="core-status" rows={3} />}

      <section className="grid grid--2">
        <StoragePanel />
        <AppearancePanel />
      </section>

      <ProvidersPanel />
      <AiPanel />
      <PermissionsPanel />
      <ActivityPanel />

      <section className="grid grid--2">
        <Panel title="Runtime" eyebrow="VERIFIED DATA">
          <DataRow label="Application" value={appInfo ? `${appInfo.appName} ${appInfo.appVersion}` : '—'} />
          <DataRow label="Electron" value={appInfo ? appInfo.electronVersion : '—'} />
          <DataRow label="Node" value={appInfo ? appInfo.nodeVersion : '—'} />
          <DataRow label="Chromium" value={appInfo ? appInfo.chromeVersion : '—'} />
          <DataRow label="Platform" value={appInfo ? `${appInfo.platform} · ${appInfo.arch}` : '—'} />
          <DataRow label="Build mode" value={appInfo ? (appInfo.isPackaged ? 'Packaged' : 'Development') : '—'} />
          <DataRow label="SQLite" value={appInfo?.sqliteAvailable ? 'Available' : 'Unavailable'} tone={appInfo?.sqliteAvailable ? 'good' : 'warn'} />
          <DataRow label="Last loaded" value={lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Never'} />
          <DataRow label="Bridge status" value={runtimeError ? 'Error' : 'Online'} tone={runtimeError ? 'danger' : 'good'} />
        </Panel>

        <Panel title="Security baseline" eyebrow="ENFORCED IN MAIN PROCESS">
          <DataRow label="contextIsolation" value="Enabled" tone="good" />
          <DataRow label="sandbox" value="Enabled" tone="good" />
          <DataRow label="nodeIntegration" value="Disabled" tone="good" />
          <DataRow label="IPC channel allowlist" value="Enforced" tone="good" />
          <DataRow label="IPC argument validation" value="Enforced on all new handlers" tone="good" />
          <DataRow label="Content Security Policy" value="Configured in main process" tone="good" />
          <DataRow label="Secrets storage" value="Encrypted with safeStorage" tone="good" />
          <DataRow label="Permission checks" value="Enforced for credential writes" tone="good" />
          <DataRow label="Activity log" value="Persisted in SQLite" tone="good" />
        </Panel>
      </section>

      <Panel title="Application controls" eyebrow="REAL ACTIONS">
        <div className="action-grid">
          <button className="action-tile" type="button" onClick={() => void refreshAll()} disabled={refreshing || loading} data-quick-action="refresh-runtime">
            <strong>Refresh everything</strong>
            <span>Re-read runtime, storage, providers, permissions and activity.</span>
          </button>
          <button className="action-tile" type="button" onClick={() => onNavigate('dashboard')} data-quick-action="open-dashboard">
            <strong>Open dashboard</strong>
            <span>Return to live telemetry.</span>
          </button>
          <button
            className="action-tile"
            type="button"
            onClick={() => void handleQuit()}
            disabled={quitPending}
            data-quick-action="quit"
          >
            <strong>Quit JARVIS</strong>
            <span>Stop the local assistant after confirmation.</span>
          </button>
        </div>
        {actionNote && <p className="metric-card-detail">{actionNote}</p>}
      </Panel>
    </main>
  );
}
