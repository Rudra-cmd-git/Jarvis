import { useState } from 'react';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';

import { useRuntime } from '../state/runtime-context';
import { formatDateTime } from '../../shared/format';
import type { ViewId } from '../../shared/types';

export function SettingsView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { appInfo, error, refreshing, refresh, lastLoadedAt } = useRuntime();
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

  return (
    <main className="view" data-view="settings">
      <PageHeader
        viewId="settings"
        eyebrow="RUNTIME & SECURITY"
        title="Settings"
        subtitle="Read-only runtime diagnostics and security baseline. Persistent settings arrive in Milestone 3."
        actions={
          <Button variant="primary" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh diagnostics'}
          </Button>
        }
      />

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
          <DataRow label="Bridge status" value={error ? 'Error' : 'Online'} tone={error ? 'danger' : 'good'} />
        </Panel>

        <Panel title="Security baseline" eyebrow="ENFORCED IN MAIN PROCESS">
          <DataRow label="contextIsolation" value="Enabled" tone="good" />
          <DataRow label="sandbox" value="Enabled" tone="good" />
          <DataRow label="nodeIntegration" value="Disabled" tone="good" />
          <DataRow label="IPC channel allowlist" value="Enforced" tone="good" />
          <DataRow label="IPC argument validation" value="Enforced (new handlers)" tone="good" />
          <DataRow label="Content Security Policy" value="Configured in main process" tone="good" />
          <DataRow label="Secrets storage" value="Not implemented (M3)" tone="warn" />
          <DataRow label="Permission prompts" value="Not implemented (M3)" tone="warn" />
          <DataRow label="Activity log" value="Not implemented (M3)" tone="warn" />
        </Panel>
      </section>

      <Panel title="Application controls" eyebrow="REAL ACTIONS">
        <div className="action-grid">
          <button className="action-tile" type="button" onClick={() => void refresh()} disabled={refreshing} data-quick-action="refresh-runtime">
            <strong>Refresh diagnostics</strong>
            <span>Re-read runtime and bridge state.</span>
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

      <EmptyState
        title="Persistent settings are not available yet"
        description="Theme, provider configuration, shortcuts and automation preferences will be stored and encrypted in Milestone 3."
        meta="Planned: M3 settings and secrets"
        testId="settings"
      />
    </main>
  );
}
