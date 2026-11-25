import { Activity, Cpu, Gauge, Mic, Search, ShieldCheck, Waves } from "lucide-react";
import { useApp } from "../../store/app-context";
import { useTts } from "../../voice/tts";
import { Badge, DataRow, Panel, StatusDot } from "../ui/Panel";
import { cn } from "../../lib/utils";

function Metric({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="text-muted">{label}</span>
        <span className="mono text-ink">{Math.round(value)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full transition-all duration-700", tone ?? "bg-[var(--accent)]")}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function SystemPanel() {
  const { activeProvider, backupProvider, settings, system, task, coreState, approvals, searchHealth, providers } = useApp();
  const { supported, speaking } = useTts();
  const memUsed = system ? ((system.totalMemGb - system.freeMemGb) / Math.max(system.totalMemGb, 1)) * 100 : 0;

  return (
    <aside className="system-panel scroll-thin flex w-[292px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line/70 bg-[#050a12]/50 p-3 pb-6">
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">Active intelligence</span>
          <StatusDot tone={activeProvider?.hasKey ? "ok" : activeProvider ? "warn" : "bad"} pulse={coreState !== "idle" && coreState !== "offline"} />
        </div>
        <div className="text-sm font-medium text-ink">{activeProvider?.name ?? "Not configured"}</div>
        <div className="mono mt-0.5 truncate text-[11px] text-[var(--accent)]">{activeProvider?.model ?? "—"}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={activeProvider ? "accent" : "bad"}>{activeProvider?.kind ?? "none"}</Badge>
          {activeProvider?.hasKey ? <Badge tone="ok">key stored</Badge> : <Badge tone="warn">no key</Badge>}
          {backupProvider ? <Badge>backup: {backupProvider.name}</Badge> : null}
        </div>
        {providers.length === 0 ? (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Add an AI provider in Integrations to bring the core online.
          </p>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Current task</span>
          <Activity size={13} className="text-[var(--accent)]" />
        </div>
        <div className="text-[12.5px] leading-relaxed text-ink">{task}</div>
        <div className="mt-2 flex items-center gap-2">
          <StatusDot tone={coreState === "error" ? "bad" : coreState === "offline" ? "muted" : "accent"} pulse />
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted">{coreState}</span>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Voice systems</span>
          <Mic size={13} className="text-[var(--accent)]" />
        </div>
        <DataRow
          label="Speech output"
          value={
            supported ? (
              <span className="flex items-center gap-1.5 text-ok">
                <Waves size={11} /> {speaking ? "speaking" : "ready"}
              </span>
            ) : (
              <span className="text-faint">unavailable</span>
            )
          }
        />
        <DataRow
          label="Speech input"
          value={
            settings?.voice.sttMode === "whisper" ? (
              "Whisper endpoint"
            ) : settings?.voice.sttMode === "web" ? (
              "Web Speech"
            ) : (
              <span className="text-faint">not configured</span>
            )
          }
        />
        <DataRow label="Auto speak" value={settings?.voice.autoSpeak ? "on" : "off"} />
      </Panel>

      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Integrations</span>
          <Search size={13} className="text-[var(--accent)]" />
        </div>
        <DataRow label="Web search" value={searchHealth?.configured ? searchHealth.provider : <span className="text-faint">not configured</span>} />
        <DataRow label="Approvals pending" value={approvals.length} />
        <DataRow label="Memory" value={settings?.memoryEnabled ? "enabled" : "disabled"} />
      </Panel>

      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">System telemetry</span>
          <Cpu size={13} className="text-[var(--accent)]" />
        </div>
        {system ? (
          <div className="space-y-3">
            <Metric value={system.loadPercent} label="CPU load" tone="bg-[var(--accent)]" />
            <Metric value={memUsed} label={`Memory · ${(system.totalMemGb - system.freeMemGb).toFixed(1)} / ${system.totalMemGb.toFixed(1)} GB`} tone="bg-azure" />
            <div className="truncate text-[10px] text-faint">{system.cpuName}</div>
            <div className="mono text-[10px] text-faint">{system.os} · {system.cores} threads</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <Gauge size={12} /> collecting…
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="mt-0.5 text-ok" />
          <p className="text-[10.5px] leading-relaxed text-muted">
            Secrets are stored in Windows Credential Manager and never exposed to the interface.
            Destructive or externally-visible actions ask for approval.
          </p>
        </div>
      </Panel>
    </aside>
  );
}
