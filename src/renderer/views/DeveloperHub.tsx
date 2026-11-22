import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';
import { useRuntime } from '../state/runtime-context';
import type { ViewId } from '../../shared/types';

export function DeveloperHubView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { appInfo, refresh, refreshing } = useRuntime();

  return (
    <main className="view" data-view="developer-hub">
      <PageHeader
        viewId="developer-hub"
        eyebrow="DEVELOPER WORKSPACE"
        title="Developer Hub"
        subtitle="Local runtime diagnostics are live; repository analysis and build monitoring are not implemented yet."
        actions={
          <>
            <StatusPill tone="warn">PHASE 3</StatusPill>
            <Button variant="ghost" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh runtime'}
            </Button>
          </>
        }
      />

      <Panel title="Runtime environment" eyebrow="VERIFIED DATA">
        <DataRow label="Application" value={appInfo ? `${appInfo.appName} ${appInfo.appVersion}` : '—'} />
        <DataRow label="Electron" value={appInfo ? appInfo.electronVersion : '—'} />
        <DataRow label="Node" value={appInfo ? appInfo.nodeVersion : '—'} />
        <DataRow label="Chromium" value={appInfo ? appInfo.chromeVersion : '—'} />
        <DataRow label="Platform" value={appInfo ? `${appInfo.platform} · ${appInfo.arch}` : '—'} />
        <DataRow label="Build mode" value={appInfo ? (appInfo.isPackaged ? 'Packaged' : 'Development') : '—'} />
        <DataRow label="SQLite" value={appInfo?.sqliteAvailable ? 'Available' : 'Unavailable'} tone={appInfo?.sqliteAvailable ? 'good' : 'warn'} />
      </Panel>

      <EmptyState
        title="No repository is open"
        description="Codebase analysis, Git inspection, test runners and build monitors arrive in Phase 3."
        meta="Planned: Phase 3 · storage layer M3"
        action={
          <Button variant="ghost" onClick={() => onNavigate('chat')}>
            Open AI Chat
          </Button>
        }
        testId="developer-hub"
      />
    </main>
  );
}
