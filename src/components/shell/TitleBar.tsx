import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useApp } from "../../store/app-context";
import { StatusDot } from "../ui/Panel";
import { isTauri } from "../../lib/api";

export function TitleBar() {
  const { activeProvider, settings, approvals, view } = useApp();

  const win = isTauri() ? getCurrentWindow() : null;
  const minimize = () => void win?.minimize();
  const toggleMax = () => void win?.toggleMaximize();
  const close = () => void win?.close();

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-line/60 bg-[#04070d]/70 px-3"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-40" />
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          <span className="display text-[11px] font-semibold tracking-[0.3em] text-ink/90">JARVIS</span>
        </div>
        <span className="text-[10px] text-faint">/</span>
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted">{view}</span>
      </div>

      <div className="flex items-center gap-4">
        {approvals.length > 0 ? (
          <span className="flex items-center gap-1.5 text-[10px] text-amber">
            <StatusDot tone="warn" pulse /> {approvals.length} approval{approvals.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <StatusDot tone={activeProvider ? (activeProvider.hasKey ? "ok" : "warn") : "bad"} />
          {activeProvider ? `${activeProvider.name} · ${activeProvider.model}` : "No provider"}
        </span>
        <span className="mono hidden text-[10px] text-faint lg:block">
          {settings?.theme ?? "midnight"} / {settings?.accent ?? "cyan"}
        </span>
        <div className="no-drag flex items-center">
          <button
            onClick={minimize}
            aria-label="Minimize window"
            className="flex h-7 w-8 items-center justify-center text-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={toggleMax}
            aria-label="Maximize window"
            className="flex h-7 w-8 items-center justify-center text-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Square size={11} />
          </button>
          <button
            onClick={close}
            aria-label="Close window"
            className="flex h-7 w-8 items-center justify-center text-muted transition-colors hover:bg-danger/80 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
