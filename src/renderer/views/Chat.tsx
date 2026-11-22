import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';
import { useRuntime } from '../state/runtime-context';
import type { ViewId } from '../../shared/types';

export function ChatView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { appInfo, error, bridgeReady } = useRuntime();

  return (
    <main className="view" data-view="chat">
      <PageHeader
        viewId="chat"
        eyebrow="CONVERSATION ENGINE"
        title="AI Chat"
        subtitle="A provider-independent workspace. No conversation is fabricated while the AI layer is unavailable."
        actions={<StatusPill tone={error ? 'warn' : 'good'}>{error ? 'BRIDGE ERROR' : 'BRIDGE ONLINE'}</StatusPill>}
      />

      <section className="grid grid--2">
        <Panel title="Readiness" eyebrow="MILESTONE STATUS">
          <DataRow label="Secure IPC bridge" value={bridgeReady ? 'Online' : 'Unavailable'} tone={bridgeReady ? 'good' : 'danger'} />
          <DataRow label="Encrypted settings store" value="Not implemented (M3)" tone="warn" />
          <DataRow label="Conversation storage" value="Not implemented (M3)" tone="warn" />
          <DataRow label="AI provider adapters" value="Not implemented (M4)" tone="warn" />
          <DataRow label="Streaming transport" value="Not implemented (M4)" tone="warn" />
          <DataRow label="Model router" value="Not implemented (M4)" tone="warn" />
        </Panel>

        <Panel title="Runtime" eyebrow="LOCAL PROCESS">
          <DataRow label="Application" value={appInfo ? `${appInfo.appName} ${appInfo.appVersion}` : '—'} />
          <DataRow label="Electron runtime" value={appInfo ? appInfo.electronVersion : '—'} />
          <DataRow label="Node runtime" value={appInfo ? appInfo.nodeVersion : '—'} />
          <DataRow label="SQLite availability" value={appInfo?.sqliteAvailable ? 'Available' : 'Unavailable'} tone={appInfo?.sqliteAvailable ? 'good' : 'warn'} />
        </Panel>
      </section>

      <EmptyState
        title="Chat is not connected"
        description="Messages, prompts and streaming responses will appear here after the provider layer and encrypted settings storage are implemented."
        meta="Planned: M3 storage, M4 provider adapters"
        action={
          <Button variant="primary" onClick={() => onNavigate('settings')}>
            Open settings
          </Button>
        }
        testId="chat"
      />
    </main>
  );
}
