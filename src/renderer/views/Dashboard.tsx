import { useState } from 'react';
import { AiCore, type AiCoreStatus } from '../components/ai-core/AiCore';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { MetricBar } from '../components/common/MetricBar';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';
import { StatusPill } from '../components/common/StatusPill';
import { useNow } from '../hooks/useNow';
import { useRuntime } from '../state/runtime-context';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { formatBytes, formatClock, formatPercent, formatUptime } from '../../shared/format';
import type { ViewId } from '../../shared/types';

export function Dashboard({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { error: appError, refreshing: appRefreshing, refresh: refreshApp } = useRuntime();
  const { metrics, loading: metricsLoading, refreshing: metricsRefreshing, error: metricsError, refresh: refreshMetrics } = useSystemMetrics(3000);
  const now = useNow();
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [quitPending, setQuitPending] = useState(false);

  const coreStatus: AiCoreStatus =
    metricsError && !metrics ? 'error' : metrics ? 'idle' : 'loading';

  const handleRefresh = () => {
    setActionNote(null);
    void Promise.all([refreshApp(), refreshMetrics()]);
  };

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

  const telemetryPill = metricsError
    ? { tone: 'warn' as const, label: 'TELEMETRY ERROR' }
    : metrics
      ? { tone: 'good' as const, label: 'TELEMETRY LIVE' }
      : { tone: 'neutral' as const, label: 'CONNECTING' };

  return (
    <main className="view" data-view="dashboard">
      <PageHeader
        viewId="dashboard"
        eyebrow="COMMAND OVERVIEW"
        title={`${greetingFor(new Date(now).getHours())}, Commander.`}
        subtitle="Live telemetry from the Electron main process, plus truthful status for unimplemented subsystems."
        actions={
          <>
            <StatusPill tone={telemetryPill.tone}>{telemetryPill.label}</StatusPill>
            <Button variant="primary" onClick={handleRefresh} disabled={appRefreshing || metricsRefreshing}>
              {appRefreshing || metricsRefreshing ? 'Refreshing…' : 'Refresh all'}
            </Button>
          </>
        }
      />

      {appError && (
        <ErrorState
          title="Runtime bridge unavailable"
          message={appError}
          onRetry={() => void refreshApp()}
        />
      )}

      <section className="hero panel" aria-label="Assistant core">
        <AiCore status={coreStatus} />
        <div className="hero-copy">
          <p className="eyebrow">CORE STATUS</p>
          <h2>{metrics ? 'Command core online' : 'Initializing core'}</h2>
          <p>
            CPU, memory and storage telemetry is sampled in the Electron main process and delivered through the
            allowlisted IPC bridge. AI providers, voice, PC control and automation are intentionally not connected in
            this milestone.
          </p>
          <div className="hero-tags">
            <span>IPC allowlist: enforced</span>
            <span>CPU {metrics ? formatPercent(metrics.cpu.usagePercent, 0) : 'syncing'}</span>
            <span>RAM {metrics ? formatPercent(metrics.memory.usagePercent, 0) : 'syncing'}</span>
            <span>Storage {metrics?.storage.available ? formatPercent(metrics.storage.usagePercent ?? 0, 0) : 'syncing'}</span>
          </div>
        </div>
      </section>

      <section className="panel" data-sampled-at={metrics?.sampledAt ?? 0}>
        <header className="panel-header">
          <div>
            <p className="eyebrow">REAL-TIME TELEMETRY</p>
            <h3 className="panel-title">System monitor</h3>
          </div>
          <Button variant="ghost" onClick={() => void refreshMetrics()} disabled={metricsRefreshing} data-action="refresh-metrics">
            {metricsRefreshing ? 'Sampling…' : 'Refresh'}
          </Button>
        </header>

        {metricsError && !metrics ? (
          <ErrorState
            title="Telemetry unavailable"
            message={metricsError}
            onRetry={() => void refreshMetrics()}
          />
        ) : metricsLoading ? (
          <LoadingState label="system-metrics" rows={4} />
        ) : (
          <div className="telemetry-grid">
            <MetricBar
              label="CPU USAGE"
              value={metrics?.cpu.usagePercent ?? null}
              detail={metrics ? `${metrics.cpu.cores} logical cores · ${metrics.cpu.model}` : 'Waiting for sample'}
              tone={metrics && metrics.cpu.usagePercent >= 85 ? 'danger' : metrics && metrics.cpu.usagePercent >= 60 ? 'warn' : 'good'}
              testId="cpu"
            />
            <MetricBar
              label="MEMORY"
              value={metrics?.memory.usagePercent ?? null}
              detail={metrics ? `${formatBytes(metrics.memory.usedBytes)} of ${formatBytes(metrics.memory.totalBytes)}` : 'Waiting for sample'}
              tone={metrics && metrics.memory.usagePercent >= 85 ? 'danger' : metrics && metrics.memory.usagePercent >= 60 ? 'warn' : 'good'}
              testId="memory"
            />
            <MetricBar
              label="STORAGE"
              value={metrics?.storage.usagePercent ?? null}
              detail={
                metrics?.storage.available
                  ? `${formatBytes(metrics.storage.freeBytes ?? 0)} free of ${formatBytes(metrics.storage.totalBytes ?? 0)}`
                  : metrics?.storage.detail ?? 'Unavailable'
              }
              tone={metrics?.storage.available && (metrics.storage.usagePercent ?? 0) >= 90 ? 'danger' : (metrics?.storage.usagePercent ?? 0) >= 75 ? 'warn' : 'good'}
              testId="storage"
            />
            <article className="metric-card" data-metric="process">
              <div className="metric-card-header">
                <span className="metric-card-label">JARVIS PROCESS</span>
                <strong className="metric-card-value">{metrics ? formatBytes(metrics.process.rssBytes) : '—'}</strong>
              </div>
              <div className="metric-bar">
                <div className="metric-bar-fill metric-bar-fill--good" style={{ width: '100%' }} />
              </div>
              <span className="metric-card-detail">
                {metrics
                  ? `PID ${metrics.process.pid} · heap ${formatBytes(metrics.process.heapUsedBytes)} of ${formatBytes(metrics.process.heapTotalBytes)} · uptime ${formatUptime(metrics.process.uptimeSeconds * 1000)}`
                  : 'Waiting for sample'}
              </span>
            </article>
          </div>
        )}

        <div className="footer">
          <span>Sampled: {metrics ? formatClock(metrics.sampledAt) : 'never'}</span>
          <span>Auto-refresh: every 3 seconds while visible</span>
          <span>{metrics?.storage.available ? `Mount: ${metrics.storage.mount}` : 'Storage: unavailable'}</span>
        </div>
      </section>

      <section className="grid grid--3">
        <Panel title="Recent conversations" eyebrow="NOT CONNECTED">
          <EmptyState
            title="No conversations yet"
            description="Conversation storage, memory and provider adapters arrive in Milestones 3 and 4."
            meta="Planned: M3 storage, M4 AI providers"
            action={
              <Button variant="ghost" onClick={() => onNavigate('chat')}>
                Open AI Chat
              </Button>
            }
            testId="conversations"
          />
        </Panel>

        <Panel title="Active automations" eyebrow="NOT INSTALLED">
          <EmptyState
            title="No automations yet"
            description="The workflow engine, trigger scheduler and action registry are Phase 4 work."
            meta="Planned: Phase 4"
            action={
              <Button variant="ghost" onClick={() => onNavigate('automation')}>
                Open Automation
              </Button>
            }
            testId="automations"
          />
        </Panel>

        <Panel title="Current tasks" eyebrow="NOT CONNECTED">
          <EmptyState
            title="No tasks yet"
            description="Tasks and reminders require the persistent storage layer from Milestone 3."
            meta="Planned: M3 storage"
            action={
              <Button variant="ghost" onClick={() => onNavigate('productivity')}>
                Open Productivity
              </Button>
            }
            testId="tasks"
          />
        </Panel>
      </section>

      <section className="panel" aria-label="Quick actions">
        <header className="panel-header">
          <div>
            <p className="eyebrow">FUNCTIONAL ACTIONS</p>
            <h3 className="panel-title">Quick actions</h3>
          </div>
        </header>
        <div className="action-grid">
          <button className="action-tile" type="button" onClick={() => onNavigate('chat')} data-quick-action="chat">
            <strong>AI Chat</strong>
            <span>Open the conversation workspace.</span>
          </button>
          <button className="action-tile" type="button" onClick={() => onNavigate('pc-control')} data-quick-action="pc-control">
            <strong>PC Control</strong>
            <span>Review control capabilities and safety gates.</span>
          </button>
          <button className="action-tile" type="button" onClick={() => onNavigate('automation')} data-quick-action="automation">
            <strong>Automation</strong>
            <span>Review workflow engine status.</span>
          </button>
          <button className="action-tile" type="button" onClick={() => onNavigate('settings')} data-quick-action="settings">
            <strong>Settings</strong>
            <span>Inspect runtime diagnostics and security baseline.</span>
          </button>
          <button
            className="action-tile"
            type="button"
            onClick={() => void refreshMetrics()}
            disabled={metricsRefreshing}
            data-quick-action="refresh-telemetry"
          >
            <strong>Refresh telemetry</strong>
            <span>Sample CPU, memory and storage again.</span>
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
      </section>
    </main>
  );
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
