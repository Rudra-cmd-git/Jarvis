import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';
import { useNow } from '../hooks/useNow';
import { useRuntime } from '../state/runtime-context';
import { formatUptime } from '../../shared/format';

export function ProductivityView() {
  const now = useNow();
  const { appInfo } = useRuntime();

  return (
    <main className="view" data-view="productivity">
      <PageHeader
        viewId="productivity"
        eyebrow="PERSONAL ASSISTANT"
        title="Productivity"
        subtitle="Local time and session uptime are live. Task storage and reminders are not connected."
        actions={<StatusPill tone="warn">M3 + PHASE 5</StatusPill>}
      />

      <section className="grid grid--2">
        <Panel title="Live clock" eyebrow="SYSTEM CLOCK">
          <div className="hero-copy">
            <h2>{formatClock(now)}</h2>
            <p>Local time from the Windows system clock.</p>
          </div>
          <DataRow
            label="Session uptime"
            value={appInfo ? formatUptime(now - appInfo.startedAt) : '\u2014'}
          />
          <DataRow label="Local date" value={formatDate(now)} />
        </Panel>

        <Panel title="Assistant features" eyebrow="IMPLEMENTATION STATUS">
          <DataRow label="Tasks" value="Not connected (M3)" tone="warn" />
          <DataRow label="Reminders and alarms" value="Not connected (M3)" tone="warn" />
          <DataRow label="Calendar integration" value="Not implemented (Phase 5)" tone="warn" />
          <DataRow label="Focus mode" value="Not implemented (Phase 5)" tone="warn" />
          <DataRow label="Pomodoro timer" value="Not implemented (Phase 5)" tone="warn" />
          <DataRow label="App usage tracking" value="Not implemented (Phase 5)" tone="warn" />
        </Panel>
      </section>

      <EmptyState
        title="No tasks yet"
        description="Tasks, reminders and productivity reports require the persistent storage layer from Milestone 3."
        meta="Planned: M3 storage, Phase 5 assistant"
        testId="productivity"
      />
    </main>
  );
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
