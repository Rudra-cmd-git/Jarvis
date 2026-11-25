import { ClipboardCopy, Database, FolderOpen, Info, Palette, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Field, Select, Slider, Toggle } from "../components/ui/Field";
import { Badge, DataRow, Panel, SectionTitle } from "../components/ui/Panel";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { ActivityEntry, AppSettings, Permissions } from "../lib/types";
import { useApp } from "../store/app-context";

const VIEW_OPTIONS = [
  ["dashboard", "Home"],
  ["chat", "AI Chat"],
  ["conversations", "Conversations"],
  ["memory", "Memory"],
  ["tools", "Tools"],
  ["automations", "Automations"],
  ["integrations", "Integrations"],
];

const PERMISSION_INFO: { key: keyof Permissions; label: string; description: string }[] = [
  { key: "appsLaunch", label: "Launch applications", description: "Allow JARVIS to open allowlisted apps such as Notepad or Explorer." },
  { key: "webOpen", label: "Open websites", description: "Allow opening validated http(s) links in your default browser." },
  { key: "filesRead", label: "Read text files & folders", description: "Allow reading supported text files and opening folders inside Desktop, Documents and Downloads." },
  { key: "filesSearch", label: "Search file names", description: "Allow filename searches within your approved folders." },
  { key: "notesWrite", label: "Save notes", description: "Allow writing notes to local memory." },
  { key: "notesDelete", label: "Delete notes", description: "Allow deleting saved notes (always requires approval)." },
  { key: "systemInfo", label: "Read system information", description: "Allow CPU, memory and OS queries." },
  { key: "externalSend", label: "Send data externally", description: "Required for web search and any request to an AI provider. Turning this off disables network features." },
];

export default function SettingsView() {
  const { settings, saveSettings, appInfo, setView, refreshActivity, refreshSearchHealth } = useApp();
  const { push } = useToast();
  const [counts, setCounts] = useState<{ total: number; failed: number; pendingApprovals: number } | null>(null);
  const [recent, setRecent] = useState<ActivityEntry[]>([]);
  const [confirmClearActivity, setConfirmClearActivity] = useState(false);

  useEffect(() => {
    void api
      .activityCounts()
      .then(setCounts)
      .catch(() => setCounts(null));
    void api
      .activityList(12)
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<AppSettings>) => {
    void saveSettings({ ...settings, ...patch });
  };

  const setPermission = (key: keyof Permissions, value: boolean) => {
    void saveSettings({
      ...settings,
      permissions: { ...settings.permissions, [key]: value },
    });
    void refreshSearchHealth();
  };

  const clearActivity = async () => {
    try {
      await api.activityClear();
      setConfirmClearActivity(false);
      await refreshActivity();
      setRecent([]);
      setCounts(await api.activityCounts());
      push("Activity log cleared.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const copyDiagnostics = async () => {
    const text = [
      `JARVIS ${appInfo?.version ?? ""}`,
      `Tauri ${appInfo?.tauriVersion ?? ""} · ${appInfo?.os ?? ""} ${appInfo?.arch ?? ""}`,
      `Data: ${appInfo?.dataDir ?? ""}`,
      `Providers: ${settings.activeProviderId ?? "auto"} | backup ${settings.backupProviderId ?? "none"}`,
      `Memory: ${settings.memoryEnabled ? "enabled" : "disabled"} | History: ${settings.historyLimit}`,
      `Search: ${settings.search.provider} (${settings.search.enabled ? "on" : "off"})`,
      `Voice: tts=${settings.voice.ttsEnabled} auto=${settings.voice.autoSpeak} stt=${settings.voice.sttMode}`,
      `Activity: ${counts?.total ?? 0} total · ${counts?.failed ?? 0} failed`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      push("Diagnostics copied to clipboard.", "success");
    } catch {
      push("Clipboard access is unavailable.", "error");
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[980px] flex-col gap-4 pb-4">
        <SectionTitle
          title="Settings"
          subtitle="Preferences persist locally and are applied immediately."
          icon={<Settings2 size={16} />}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionTitle title="Appearance" subtitle="Theme, accent and motion." icon={<Palette size={14} />} />
            <div className="mt-3 space-y-3">
              <Field label="Theme">
                <Select value={settings.theme} onChange={(e) => update({ theme: e.target.value })}>
                  <option value="midnight">Midnight</option>
                  <option value="abyss">Abyss</option>
                  <option value="graphite">Graphite</option>
                </Select>
              </Field>
              <Field label="Accent">
                <div className="flex gap-2">
                  {[
                    { id: "cyan", color: "#38e0ff", label: "Cyan" },
                    { id: "azure", color: "#5b8cff", label: "Azure" },
                    { id: "amber", color: "#ffb240", label: "Amber" },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => update({ accent: a.id })}
                      aria-pressed={settings.accent === a.id}
                      className={
                        "focus-ring flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] transition-colors " +
                        (settings.accent === a.id ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-line text-muted")
                      }
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle
                checked={settings.reducedMotion}
                onChange={(v) => update({ reducedMotion: v })}
                label="Reduce motion"
                description="Stops the core rotations, pulses and animated transitions."
              />
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title="Startup & behaviour" subtitle="Defaults for new sessions." icon={<Info size={14} />} />
            <div className="mt-3 space-y-3">
              <Field label="Startup view">
                <Select value={settings.startupView} onChange={(e) => update({ startupView: e.target.value })}>
                  {VIEW_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Conversation history depth" hint={`${settings.historyLimit} messages`}>
                <Slider
                  label="Turns sent to the model"
                  min={2}
                  max={60}
                  step={2}
                  value={settings.historyLimit}
                  onChange={(v) => update({ historyLimit: v })}
                />
              </Field>
              <Toggle
                checked={settings.notifications}
                onChange={(v) => update({ notifications: v })}
                label="Show in-app notifications"
                description="Toasts for tool results, errors and approvals."
              />
              <Toggle
                checked={settings.requireApprovals}
                onChange={(v) => update({ requireApprovals: v })}
                label="Require approval for risky tools"
                description="Web searches, note deletion and other externally visible actions ask first. Recommended."
              />
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title="Memory" subtitle="You decide what JARVIS remembers." icon={<Database size={14} />} />
            <div className="mt-2">
              <Toggle
                checked={settings.memoryEnabled}
                onChange={(v) => update({ memoryEnabled: v })}
                label="Persistent memory"
                description="Include saved memories as context. Conversation history is stored regardless."
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setView("memory")}>
                Manage memories
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setView("conversations")}>
                Manage conversations
              </Button>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title="Security" subtitle="Permissions enforced in the Rust backend." icon={<ShieldCheck size={14} />} />
            <div className="mt-1 divide-y divide-white/[0.04]">
              {PERMISSION_INFO.map((p) => (
                <Toggle
                  key={p.key}
                  checked={settings.permissions[p.key]}
                  onChange={(v) => setPermission(p.key, v)}
                  label={p.label}
                  description={p.description}
                />
              ))}
            </div>
          </Panel>
        </div>

        <Panel className="p-4">
          <SectionTitle
            title="Diagnostics & logs"
            subtitle="Local-only application data. No telemetry leaves this machine except API requests you trigger."
            icon={<Database size={14} />}
            action={
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => void copyDiagnostics()}>
                  <ClipboardCopy size={12} /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void api.openDataFolder().catch((e) => push(String(e), "error"))}>
                  <FolderOpen size={12} /> Data folder
                </Button>
              </div>
            }
          />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <DataRow label="Version" value={`JARVIS ${appInfo?.version ?? "—"}`} />
              <DataRow label="Runtime" value={`Tauri ${appInfo?.tauriVersion ?? "—"} · ${appInfo?.os ?? ""} ${appInfo?.arch ?? ""}`} />
              <DataRow label="Database" value="SQLite (local)" />
              <DataRow label="Secrets" value={<Badge tone="ok">Windows Credential Manager</Badge>} />
              <DataRow label="Data folder" value={<span className="mono text-[10px]">{appInfo?.dataDir ?? "—"}</span>} />
            </div>
            <div>
              <DataRow label="Activity recorded" value={counts?.total ?? "—"} />
              <DataRow label="Failed actions" value={counts?.failed ?? 0} />
              <DataRow label="Pending approvals" value={counts?.pendingApprovals ?? 0} />
              <DataRow label="AI provider" value={settings.activeProviderId ? "configured" : "not configured"} />
              <DataRow label="Web search" value={settings.search.provider} />
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label">Recent activity</span>
              <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => setConfirmClearActivity(true)}>
                <Trash2 size={11} /> Clear log
              </Button>
            </div>
            <ul className="max-h-44 space-y-1 overflow-y-auto scroll-thin">
              {recent.length === 0 ? <li className="text-[11px] text-faint">No activity recorded.</li> : null}
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-line/60 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[11px] text-ink">{a.title}</span>
                  <span className="mono shrink-0 text-[9px] text-faint">{new Date(a.createdAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <p className="px-1 text-[10px] leading-relaxed text-faint">
          API keys never reach React state after storage, and are never written to logs. Deleting a provider or key removes it
          from Windows Credential Manager immediately.
        </p>
      </div>

      <Modal
        open={confirmClearActivity}
        onClose={() => setConfirmClearActivity(false)}
        title="Clear the activity log"
        description="Removes the local audit trail. Conversations and memories are not affected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClearActivity(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void clearActivity()}>
              Clear log
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">{counts?.total ?? 0} activity entries will be deleted.</p>
      </Modal>
    </div>
  );
}
