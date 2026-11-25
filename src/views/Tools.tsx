import { Boxes, Play, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea, Toggle } from "../components/ui/Field";
import { Badge, EmptyState, Panel, SectionTitle } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { ApprovalRequest, Permissions, ToolInfo, ToolOutcome } from "../lib/types";
import { truncate } from "../lib/utils";
import { useApp } from "../store/app-context";

const FIELDS: Record<string, { key: string; label: string; placeholder: string; type?: "textarea" }[]> = {
  open_app: [{ key: "name", label: "Application", placeholder: "notepad, calculator, explorer, paint, edge, chrome, code, spotify" }],
  open_url: [{ key: "url", label: "URL", placeholder: "https://example.com" }],
  open_folder: [{ key: "folder", label: "Folder", placeholder: "desktop, documents, downloads, pictures, music, videos" }],
  search_files: [
    { key: "query", label: "File name contains", placeholder: "report" },
    { key: "folder", label: "Folder (optional)", placeholder: "documents" },
  ],
  read_text_file: [{ key: "path", label: "Absolute path", placeholder: "C:/Users/you/Documents/notes.txt" }],
  save_note: [{ key: "content", label: "Note content", placeholder: "Text to remember", type: "textarea" }],
  delete_note: [{ key: "id", label: "Note ID", placeholder: "Memory id from list_notes" }],
  web_search: [{ key: "query", label: "Search query", placeholder: "Today's technology news" }],
  system_info: [],
  datetime: [],
  list_notes: [],
};

const PERMISSION_LABELS: Record<string, keyof Permissions> = {
  "apps.launch": "appsLaunch",
  "web.open": "webOpen",
  "files.read": "filesRead",
  "files.search": "filesSearch",
  "notes.write": "notesWrite",
  "notes.delete": "notesDelete",
  "system.info": "systemInfo",
  "external.send": "externalSend",
};

export default function Tools() {
  const { settings, saveSettings, runTool, approvals, refreshApprovals, refreshActivity, setCoreState, setTask } = useApp();
  const { push } = useToast();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selected, setSelected] = useState<string>("system_info");
  const [values, setValues] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<ToolOutcome | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .toolsList()
      .then((list) => {
        setTools(list);
        if (!list.some((t) => t.id === selected)) setSelected(list[0]?.id ?? "system_info");
      })
      .catch((e) => push(String(e), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);

  const selectedTool = tools.find((t) => t.id === selected);

  const setPermission = (permission: string, value: boolean) => {
    if (!settings) return;
    const key = PERMISSION_LABELS[permission];
    if (!key) return;
    void saveSettings({ ...settings, permissions: { ...settings.permissions, [key]: value } });
  };

  const execute = useCallback(async () => {
    if (!selectedTool) return;
    setRunning(true);
    setOutcome(null);
    setCoreState("thinking");
    setTask(`Running ${selectedTool.name}`);
    try {
      const args: Record<string, unknown> = {};
      for (const field of FIELDS[selectedTool.id] ?? []) {
        if (values[field.key]?.trim()) args[field.key] = values[field.key].trim();
      }
      const result = await runTool(selectedTool.id, args, "Run manually from the Tools console");
      setOutcome(result);
      if (result.status === "completed") push(result.result.summary, result.result.ok ? "success" : "error");
      else if (result.status === "denied") push(result.reason, "error");
      await refreshApprovals();
      void refreshActivity();
    } catch (e) {
      push(String(e), "error");
    } finally {
      setRunning(false);
      setCoreState("idle");
      setTask("Standing by");
    }
  }, [push, refreshActivity, refreshApprovals, runTool, selectedTool, setCoreState, setTask, values]);

  const decide = async (approval: ApprovalRequest, approve: boolean) => {
    try {
      const result = await api.approvalRespond(approval.id, approve);
      setOutcome(result);
      await refreshApprovals();
      void refreshActivity();
      if (result.status === "completed") push(result.result.summary, "success");
      if (result.status === "denied") push(result.reason, "error");
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
        <SectionTitle
          title="Tool console"
          subtitle="Allowlisted Windows operations. Every run is validated in the Rust backend and written to the audit log."
          icon={<Boxes size={16} />}
          action={
            <Badge tone="accent">
              <ShieldCheck size={10} /> {settings?.requireApprovals ? "approvals required" : "approvals off"}
            </Badge>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel className="p-4">
            <SectionTitle title="Available tools" subtitle={`${tools.length} capabilities registered`} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tools.map((tool) => {
                const permKey = PERMISSION_LABELS[tool.permission];
                const allowed = settings?.permissions[permKey] ?? false;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setSelected(tool.id);
                      setValues({});
                      setOutcome(null);
                    }}
                    className={
                      "focus-ring rounded-lg border p-3 text-left transition-colors " +
                      (selected === tool.id
                        ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                        : "border-line hover:border-line-bright")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium text-ink">{tool.name}</span>
                      <span className="shrink-0">
                        {tool.requiresApproval ? (
                          <Badge tone="warn">approval</Badge>
                        ) : (
                          <Badge tone={allowed ? "ok" : "bad"}>{allowed ? "allowed" : "blocked"}</Badge>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{truncate(tool.description, 110)}</p>
                    <div className="mono mt-1.5 text-[9px] text-faint">{tool.id}</div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel className="p-4">
              <SectionTitle
                title={selectedTool?.name ?? "Select a tool"}
                subtitle={selectedTool ? `Permission: ${selectedTool.permission}` : undefined}
              />
              <div className="mt-3 space-y-3">
                {(FIELDS[selected] ?? []).map((field) =>
                  field.type === "textarea" ? (
                    <Field key={field.key} label={field.label}>
                      <Textarea
                        value={values[field.key] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </Field>
                  ) : (
                    <Field key={field.key} label={field.label}>
                      <Input
                        value={values[field.key] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </Field>
                  ),
                )}
                <Button variant="primary" onClick={() => void execute()} disabled={!selectedTool || running}>
                  <Play size={13} /> {running ? "Executing…" : "Execute tool"}
                </Button>
              </div>

              {outcome ? (
                <div className="mt-3">
                  {outcome.status === "completed" ? (
                    <div className="rounded-lg border border-ok/25 bg-ok/[0.05] p-3">
                      <div className="text-[11.5px] text-ok">{outcome.result.summary}</div>
                      <pre className="scroll-thin mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
                        {JSON.stringify(outcome.result.detail ?? {}, null, 2)}
                      </pre>
                    </div>
                  ) : outcome.status === "denied" ? (
                    <div className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3 text-[11.5px] text-danger">
                      {outcome.reason}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber/25 bg-amber/[0.06] p-3 text-[11.5px] text-amber">
                      Approval requested — decide using the dialog.
                    </div>
                  )}
                </div>
              ) : null}
            </Panel>

            <Panel className="p-4">
              <SectionTitle title="Permissions" subtitle="Backend-enforced, not cosmetic." />
              <div className="mt-1 divide-y divide-white/[0.04]">
                {tools
                  .map((t) => t.permission)
                  .filter((perm, idx, arr) => arr.indexOf(perm) === idx)
                  .map((perm) => {
                    const key = PERMISSION_LABELS[perm];
                    return (
                      <Toggle
                        key={perm}
                        label={perm}
                        checked={settings?.permissions[key] ?? false}
                        onChange={(value) => setPermission(perm, value)}
                      />
                    );
                  })}
              </div>
            </Panel>
          </div>
        </div>

        <Panel className="p-4">
          <SectionTitle
            title="Approval queue"
            subtitle="Actions JARVIS is waiting to perform."
            icon={<ShieldQuestion size={14} />}
            action={
              <Button size="sm" variant="ghost" onClick={() => void refreshApprovals()}>
                Refresh
              </Button>
            }
          />
          <div className="mt-2">
            {approvals.length === 0 ? (
              <EmptyState title="Nothing pending" description="Risky actions will appear here for your decision." />
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {approvals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="mono text-[10px] text-amber">{a.tool}</div>
                      <div className="text-[11.5px] text-ink">{a.preview}</div>
                      <div className="text-[10px] text-faint">{a.reason}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => void decide(a, false)}>
                        <X size={12} /> Deny
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => void decide(a, true)}>
                        Approve
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <p className="px-1 text-[10px] leading-relaxed text-faint">
          Restricted by design: arbitrary shell commands, system-setting changes, software installation and file deletion
          tools are not implemented. Files can only be read inside Desktop, Documents and Downloads, and only supported
          text formats.
        </p>
      </div>
    </div>
  );
}
