import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Panel({
  children,
  className,
  hover,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("panel", hover && "panel-hover", className)}>{children}</Tag>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-[var(--accent)]">{icon}</div> : null}
        <div>
          <h2 className="display text-[15px] font-semibold tracking-wide text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function DataRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("truncate text-xs text-ink", mono && "mono")}>{value}</span>
    </div>
  );
}

export function StatusDot({ tone = "ok", pulse }: { tone?: "ok" | "warn" | "bad" | "accent" | "muted"; pulse?: boolean }) {
  const color = {
    ok: "bg-ok",
    warn: "bg-amber",
    bad: "bg-danger",
    accent: "bg-[var(--accent)]",
    muted: "bg-faint",
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} /> : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "ok" | "warn" | "bad" }) {
  const styles = {
    muted: "border-line text-muted",
    accent: "border-[var(--accent-line)] text-[var(--accent)] bg-[var(--accent-soft)]",
    ok: "border-ok/30 text-ok bg-ok/10",
    warn: "border-amber/30 text-amber bg-amber/10",
    bad: "border-danger/30 text-danger bg-danger/10",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide", styles)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-faint">{icon}</div> : null}
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        {description ? <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}
