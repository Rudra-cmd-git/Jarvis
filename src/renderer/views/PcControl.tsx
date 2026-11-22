import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';
import type { ViewId } from '../../shared/types';

export function PcControlView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  return (
    <main className="view" data-view="pc-control">
      <PageHeader
        viewId="pc-control"
        eyebrow="SYSTEM CONTROL SURFACE"
        title="PC Control"
        subtitle="Capability catalog only. No system command runs until permission and logging services exist."
        actions={<StatusPill tone="warn">PHASE 2</StatusPill>}
      />

      <section className="grid grid--2">
        <Panel title="Capabilities" eyebrow="IMPLEMENTATION STATUS">
          <DataRow label="System telemetry" value="Available (M2)" tone="good" />
          <DataRow label="Application launch and close" value="Not implemented (Phase 2)" tone="warn" />
          <DataRow label="Window management" value="Not implemented (Phase 2)" tone="warn" />
          <DataRow label="File and folder search" value="Not implemented (Phase 2)" tone="warn" />
          <DataRow label="Screenshot capture" value="Not implemented (Phase 2)" tone="warn" />
          <DataRow label="Clipboard access" value="Not implemented (Phase 2)" tone="warn" />
          <DataRow label="Volume and display controls" value="Not implemented (Phase 2)" tone="warn" />
        </Panel>

        <Panel title="Safety gates" eyebrow="REQUIRED BEFORE CONTROL SHIPS">
          <DataRow label="Permission prompts" value="Not implemented (M3)" tone="warn" />
          <DataRow label="Activity log" value="Not implemented (M3)" tone="warn" />
          <DataRow label="Emergency stop" value="Not implemented (Phase 4)" tone="warn" />
          <DataRow label="Automation pause" value="Not implemented (Phase 4)" tone="warn" />
          <DataRow label="Unrestricted terminal execution" value="Forbidden by policy" tone="danger" />
        </Panel>
      </section>

      <EmptyState
        title="No PC control surface is active"
        description="Windows control will be permission-gated and logged. Until those services exist, this view reports status only."
        meta="Planned: Phase 2"
        action={
          <Button variant="ghost" onClick={() => onNavigate('dashboard')}>
            View live telemetry
          </Button>
        }
        testId="pc-control"
      />
    </main>
  );
}
