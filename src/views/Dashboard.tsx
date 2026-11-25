import { ArrowRight, Calculator, Globe2, MessagesSquare, MonitorCog, ScrollText, Sparkles } from "lucide-react";
import { useState } from "react";
import { JarvisCore } from "../components/core/JarvisCore";
import { ActivityFeed } from "../components/shell/ActivityFeed";
import { CommandBar } from "../components/shell/CommandBar";
import { Badge, Panel, SectionTitle, StatusDot } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { useNow } from "../hooks/useNow";
import { useApp } from "../store/app-context";
import { cn } from "../lib/utils";

const PROMPTS = [
  "Summarise what you can do on this PC",
  "Plan my next two hours",
  "Explain a concept simply",
  "Draft a short professional email",
];

export default function Dashboard() {
  const {
    activeProvider,
    coreState,
    task,
    setView,
    setHandoffPrompt,
    activity,
    approvals,
    searchHealth,
    settings,
    system,
    runTool,
  } = useApp();
  const { push } = useToast();
  const now = useNow(1000);
  const [busy, setBusy] = useState<string | null>(null);

  const startChat = (prompt: string) => {
    setHandoffPrompt(prompt);
    setView("chat");
  };

  const run = async (label: string, tool: string, args: Record<string, unknown>) => {
    setBusy(label);
    const outcome = await runTool(tool, args, `Launched from the dashboard`);
    setBusy(null);
    if (outcome.status === "completed") push(outcome.result.summary, "success");
    else if (outcome.status === "denied") push(outcome.reason, "error");
  };

  const greeting =
    now.getHours() < 5
      ? "Working late"
      : now.getHours() < 12
        ? "Good morning"
        : now.getHours() < 18
          ? "Good afternoon"
          : "Good evening";

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Command center</div>
            <h1 className="display mt-1 text-[22px] font-semibold tracking-wide text-ink">
              {greeting}, sir.
            </h1>
            <p className="mt-1 text-xs text-muted">
              {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} ·{" "}
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={activeProvider?.hasKey ? "ok" : "warn"}>
              <StatusDot tone={activeProvider?.hasKey ? "ok" : "warn"} /> {activeProvider ? "AI online" : "AI offline"}
            </Badge>
            <Badge tone={searchHealth?.configured ? "accent" : "muted"}>
              <Globe2 size={10} /> search {searchHealth?.configured ? "ready" : "off"}
            </Badge>
            <Badge tone={settings?.memoryEnabled ? "accent" : "muted"}>
              <ScrollText size={10} /> memory {settings?.memoryEnabled ? "on" : "off"}
            </Badge>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Panel className="relative overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="label">Primary interface</div>
                <div className="mt-1 text-sm text-ink">JARVIS core status</div>
              </div>
              <Badge tone={coreState === "error" ? "bad" : coreState === "offline" ? "muted" : "accent"}>
                {coreState}
              </Badge>
            </div>

            <div className="flex flex-col items-center py-4">
              <JarvisCore state={coreState} size={310} />
              <div className="mt-3 text-center">
                <div className="text-sm text-ink">{task}</div>
                <div className="mono mt-1 text-[10px] uppercase tracking-[0.2em] text-faint">
                  {activeProvider ? `${activeProvider.name} / ${activeProvider.model}` : "no provider linked"}
                </div>
              </div>
            </div>

            <CommandBar />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => startChat(p)}
                  className="focus-ring rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
                >
                  {p}
                </button>
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel className="p-4">
              <SectionTitle
                title="Quick actions"
                subtitle="Real operations, logged in the activity feed."
                icon={<Sparkles size={14} />}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <QuickAction
                  icon={<MessagesSquare size={15} />}
                  label="New conversation"
                  onClick={() => setView("chat")}
                />
                <QuickAction
                  icon={<Calculator size={15} />}
                  label={busy === "calc" ? "Opening…" : "Open Calculator"}
                  onClick={() => void run("calc", "open_app", { name: "calculator" })}
                />
                <QuickAction
                  icon={<MonitorCog size={15} />}
                  label={busy === "scan" ? "Scanning…" : "System scan"}
                  onClick={() => void run("scan", "system_info", {})}
                />
                <QuickAction
                  icon={<Globe2 size={15} />}
                  label="Web search setup"
                  onClick={() => setView("integrations")}
                />
              </div>
              {approvals.length > 0 ? (
                <button
                  onClick={() => setView("tools")}
                  className="mt-3 flex w-full items-center justify-between rounded-lg border border-amber/25 bg-amber/[0.06] px-3 py-2 text-left text-[11px] text-amber focus-ring"
                >
                  <span>{approvals.length} action(s) awaiting approval</span>
                  <ArrowRight size={12} />
                </button>
              ) : null}
            </Panel>

            <Panel className="p-4">
              <SectionTitle
                title="Activity"
                subtitle="Latest actions across the system."
                icon={<ScrollText size={14} />}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setView("settings")}>
                    Logs
                  </Button>
                }
              />
              <div className="mt-1 max-h-[268px] overflow-y-auto scroll-thin">
                <ActivityFeed entries={activity.slice(0, 8)} dense />
              </div>
            </Panel>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-[10px] text-faint">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <StatusDot tone={system ? "ok" : "muted"} /> telemetry {system ? "live" : "acquiring"}
            </span>
            <span>Enter to send · Esc closes dialogs</span>
          </div>
          <span className="mono">local-first · windows credential vault</span>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "focus-ring flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 py-2.5 text-left text-[11.5px] text-muted transition-colors",
        "hover:border-[var(--accent-line)] hover:text-ink",
      )}
    >
      <span className="text-[var(--accent)]">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
