import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataRow } from '../components/common/DataRow';
import { StatusPill } from '../components/common/StatusPill';

export function KnowledgeView() {
  return (
    <main className="view" data-view="knowledge">
      <PageHeader
        viewId="knowledge"
        eyebrow="DOCUMENT INDEX"
        title="Knowledge Base"
        subtitle="No documents are indexed because the file intelligence and storage layers are not implemented."
        actions={<StatusPill tone="warn">PHASE 3</StatusPill>}
      />

      <Panel title="Index status" eyebrow="IMPLEMENTATION STATUS">
        <DataRow label="Indexed sources" value="Not connected" tone="warn" />
        <DataRow label="Document count" value="Not connected" tone="warn" />
        <DataRow label="Full-text search" value="Not implemented (Phase 3)" tone="warn" />
        <DataRow label="Embedding/vector index" value="Not implemented (Phase 3)" tone="warn" />
        <DataRow label="Persistent storage" value="Not implemented (M3)" tone="warn" />
      </Panel>

      <EmptyState
        title="No knowledge sources"
        description="File intelligence, PDF/DOCX analysis and local indexing arrive in Phase 3 after the storage layer in Milestone 3."
        meta="Planned: M3 storage, Phase 3 intelligence"
        testId="knowledge"
      />
    </main>
  );
}
