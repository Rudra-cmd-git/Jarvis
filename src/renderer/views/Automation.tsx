import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';

export function AutomationView() {
  return (
    <main className="view" data-view="automation">
      <PageHeader
        viewId="automation"
        eyebrow="WORKFLOW ENGINE"
        title="Automation"
        subtitle="No workflow can run until the engine, scheduler and permission system are implemented."
        actions={<StatusPill tone="warn">PHASE 4</StatusPill>}
      />

      <Panel title="Engine status" eyebrow="IMPLEMENTATION STATUS">
        <DataRow label="Trigger system" value="Not implemented (Phase 4)" tone="warn" />
        <DataRow label="Condition evaluator" value="Not implemented (Phase 4)" tone="warn" />
        <DataRow label="Action registry" value="Not implemented (Phase 4)" tone="warn" />
        <DataRow label="Scheduler" value="Not implemented (Phase 4)" tone="warn" />
        <DataRow label="Workflow history" value="Not implemented (Phase 4)" tone="warn" />
        <DataRow label="Failure recovery" value="Not implemented (Phase 4)" tone="warn" />
      </Panel>

      <EmptyState
        title="No automations yet"
        description="The automation engine is not installed. Nothing is running in the background."
        meta="Planned: Phase 4 · gated by M3 permissions"
        testId="automation"
      />
    </main>
  );
}
