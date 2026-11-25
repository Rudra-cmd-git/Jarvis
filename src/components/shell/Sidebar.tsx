import {
  Boxes,
  BrainCircuit,
  Command,
  History,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Workflow,
  Zap,
} from "lucide-react";
import type { ViewId } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useApp } from "../../store/app-context";
import { StatusDot } from "../ui/Panel";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard, group: "Command" },
  { id: "chat", label: "AI Chat", icon: MessagesSquare, group: "Command" },
  { id: "conversations", label: "Conversations", icon: History, group: "Command" },
  { id: "memory", label: "Memory", icon: BrainCircuit, group: "Intelligence" },
  { id: "tools", label: "Tools", icon: Boxes, group: "Intelligence" },
  { id: "automations", label: "Automations", icon: Workflow, group: "Intelligence" },
  { id: "integrations", label: "Integrations", icon: Zap, group: "System" },
  { id: "settings", label: "Settings", icon: Settings, group: "System" },
];

export function Sidebar() {
  const { view, setView, approvals, activeProvider, appInfo } = useApp();
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <aside className="sidebar-rail flex w-[216px] shrink-0 flex-col border-r border-line/70 bg-[#050a12]/60">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="accent-glow flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
          <Command size={16} className="accent-text" />
        </div>
        <div className="sidebar-label">
          <div className="display text-[12px] font-semibold tracking-[0.22em]">J.A.R.V.I.S</div>
          <div className="mono text-[9px] tracking-[0.16em] text-faint">COMMAND CORE</div>
        </div>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 py-2">
        {groups.map((group) => (
          <div key={group} className="mb-3">
            <div className="sidebar-label label px-2.5 pb-1.5">{group}</div>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map((item) => {
                const Icon = item.icon;
                const activeItem = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    aria-current={activeItem ? "page" : undefined}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors focus-ring",
                      activeItem
                        ? "bg-[var(--accent-soft)] text-ink"
                        : "text-muted hover:bg-white/[0.04] hover:text-ink",
                    )}
                  >
                    {activeItem ? (
                      <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />
                    ) : null}
                    <Icon size={15} className={activeItem ? "accent-text" : "text-faint group-hover:text-muted"} />
                    <span className="sidebar-label flex-1 truncate">{item.label}</span>
                    {item.id === "tools" && approvals.length > 0 ? (
                      <span className="rounded bg-amber/15 px-1 text-[9px] font-semibold text-amber">
                        {approvals.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-label border-t border-line/70 px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <StatusDot tone={activeProvider?.hasKey ? "ok" : activeProvider ? "warn" : "bad"} />
          <span className="truncate">{activeProvider?.name ?? "No provider"}</span>
        </div>
        <div className="mono mt-1 text-[9px] text-faint">v{appInfo?.version ?? "0.1.0"} · LOCAL</div>
      </div>
    </aside>
  );
}
