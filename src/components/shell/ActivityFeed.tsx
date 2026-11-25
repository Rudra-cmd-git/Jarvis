import { AlertTriangle, Bot, CheckCircle2, Clock3, FileText, ShieldQuestion, Terminal, XCircle } from "lucide-react";
import type { ActivityEntry } from "../../lib/types";
import { cn, relativeTime, truncate } from "../../lib/utils";
import { EmptyState } from "../ui/Panel";

function iconFor(entry: ActivityEntry) {
  if (entry.status === "failed") return <XCircle size={13} className="text-danger" />;
  if (entry.status === "pending") return <ShieldQuestion size={13} className="text-amber" />;
  if (entry.kind === "chat") return <Bot size={13} className="text-[var(--accent)]" />;
  if (entry.kind === "tool") return <Terminal size={13} className="text-azure" />;
  if (entry.kind === "memory") return <FileText size={13} className="text-muted" />;
  if (entry.status === "running") return <Clock3 size={13} className="text-amber" />;
  return <CheckCircle2 size={13} className="text-ok" />;
}

export function ActivityFeed({ entries, dense }: { entries: ActivityEntry[]; dense?: boolean }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title="No activity yet"
        description="Everything JARVIS does — chat requests, tools, permissions — is recorded here."
      />
    );
  }
  return (
    <ul className={cn("divide-y divide-white/[0.04]", dense && "text-[11px]")}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2.5 py-2.5">
          <span className="mt-0.5 shrink-0">{iconFor(entry)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate font-medium text-ink", dense ? "text-[11px]" : "text-xs")}>{entry.title}</span>
              <span className="mono shrink-0 text-[9px] text-faint">{relativeTime(entry.createdAt)}</span>
            </div>
            {entry.detail ? (
              <p className="mt-0.5 truncate text-[11px] text-muted">{truncate(entry.detail, 120)}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
