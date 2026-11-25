import { Suspense, lazy } from "react";
import { JarvisCore } from "../core/JarvisCore";
import { ApprovalDialog } from "./ApprovalDialog";
import { Sidebar } from "./Sidebar";
import { SystemPanel } from "./SystemPanel";
import { TitleBar } from "./TitleBar";
import { useApp } from "../../store/app-context";

const Dashboard = lazy(() => import("../../views/Dashboard"));
const Chat = lazy(() => import("../../views/Chat"));
const Conversations = lazy(() => import("../../views/Conversations"));
const MemoryView = lazy(() => import("../../views/Memory"));
const Tools = lazy(() => import("../../views/Tools"));
const Automations = lazy(() => import("../../views/Automations"));
const Integrations = lazy(() => import("../../views/Integrations"));
const SettingsView = lazy(() => import("../../views/Settings"));

function ViewLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <JarvisCore state="thinking" size={120} compact />
        <span className="mono text-[10px] tracking-[0.24em]">LOADING MODULE</span>
      </div>
    </div>
  );
}

export function Shell() {
  const { view, fatal, ready } = useApp();

  if (!ready) {
    return (
      <div className="app-backdrop flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <JarvisCore state="connecting" size={220} />
          <span className="mono text-[11px] tracking-[0.28em] text-muted">INITIALISING CORE</span>
        </div>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="app-backdrop flex h-full items-center justify-center p-8">
        <div className="panel max-w-md p-6">
          <h1 className="display text-sm font-semibold tracking-[0.2em] text-danger">CORE OFFLINE</h1>
          <p className="mt-3 text-xs leading-relaxed text-muted">{fatal}</p>
          <pre className="mt-4 rounded-lg border border-line bg-black/30 p-3 text-[11px] leading-relaxed text-ink/80">
            Start the desktop app:{"\n"}npm run app:dev
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="app-backdrop flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 tech-grid opacity-70" aria-hidden />
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<ViewLoading />}>
              {view === "dashboard" ? <Dashboard /> : null}
              {view === "chat" ? <Chat /> : null}
              {view === "conversations" ? <Conversations /> : null}
              {view === "memory" ? <MemoryView /> : null}
              {view === "tools" ? <Tools /> : null}
              {view === "automations" ? <Automations /> : null}
              {view === "integrations" ? <Integrations /> : null}
              {view === "settings" ? <SettingsView /> : null}
            </Suspense>
          </div>
        </main>
        <SystemPanel />
      </div>
      <ApprovalDialog />
    </div>
  );
}
