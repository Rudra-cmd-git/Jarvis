import { BrainCircuit, Pin, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Field, Select, Textarea, Toggle } from "../components/ui/Field";
import { Badge, EmptyState, Panel, SectionTitle, Spinner } from "../components/ui/Panel";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { Memory } from "../lib/types";
import { formatDate } from "../lib/utils";
import { useApp } from "../store/app-context";

const KIND_TONE = { preference: "accent", fact: "ok", note: "muted" } as const;

export default function MemoryView() {
  const { settings, saveSettings, refreshActivity } = useApp();
  const { push } = useToast();
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"preference" | "fact" | "note">("preference");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.memoryList());
    } catch (e) {
      push(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.memoryAdd(kind, content.trim());
      setContent("");
      await load();
      void refreshActivity();
      push("Memory saved locally.", "success");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.memoryDelete(id);
      await load();
      void refreshActivity();
    } catch (e) {
      push(String(e), "error");
    }
  };

  const pin = async (id: string) => {
    try {
      await api.memoryTogglePin(id);
      await load();
    } catch (e) {
      push(String(e), "error");
    }
  };

  const clearAll = async () => {
    try {
      await api.memoryClear();
      setClearOpen(false);
      await load();
      void refreshActivity();
      push("All memories deleted.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[980px] flex-col gap-4">
        <SectionTitle
          title="Memory"
          subtitle="Only information you save here is offered to the model as approved context. Nothing is captured silently."
          icon={<BrainCircuit size={16} />}
          action={
            <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)} disabled={items.length === 0}>
              <Trash2 size={13} /> Clear all
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_1.45fr]">
          <div className="flex flex-col gap-4">
            <Panel className="p-4">
              <SectionTitle title="Add memory" subtitle="Preferences, facts and notes persist across sessions." />
              <div className="mt-3 space-y-3">
                <Field label="Type">
                  <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                    <option value="preference">Preference</option>
                    <option value="fact">Fact</option>
                    <option value="note">Note</option>
                  </Select>
                </Field>
                <Field label="Content" hint={`${content.length}/4000`}>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={4000}
                    placeholder="e.g. Prefers concise summaries with metric units."
                  />
                </Field>
                <Button variant="primary" size="sm" onClick={() => void add()} disabled={!content.trim() || saving}>
                  <Plus size={13} /> {saving ? "Saving…" : "Save memory"}
                </Button>
              </div>
            </Panel>

            <Panel className="p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="label">Persistent memory</span>
                <Badge tone={settings?.memoryEnabled ? "ok" : "muted"}>{settings?.memoryEnabled ? "on" : "off"}</Badge>
              </div>
              <Toggle
                checked={settings?.memoryEnabled ?? true}
                onChange={(value) => {
                  if (!settings) return;
                  void saveSettings({ ...settings, memoryEnabled: value });
                }}
                label="Include saved memories in AI context"
                description="When disabled, JARVIS stops injecting saved memories into requests. Existing memories are kept until you delete them."
              />
            </Panel>
          </div>

          <Panel className="p-4">
            <SectionTitle title="Saved memories" subtitle={`${items.length} item(s)`} />
            <div className="mt-2">
              {loading ? (
                <div className="flex justify-center py-10 text-muted">
                  <Spinner />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={<BrainCircuit size={20} />}
                  title="No memories yet"
                  description="Save a preference or note to give JARVIS lasting context you control."
                />
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {items.map((m) => (
                    <li key={m.id} className="group py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={KIND_TONE[m.kind]}>{m.kind}</Badge>
                          {m.pinned ? <Badge tone="warn">pinned</Badge> : null}
                        </div>
                        <span className="mono text-[9px] text-faint">{formatDate(m.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink/90">{m.content}</p>
                      <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button size="sm" variant="ghost" onClick={() => void pin(m.id)}>
                          <Pin size={11} /> {m.pinned ? "Unpin" : "Pin"}
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => void remove(m.id)}>
                          <Trash2 size={11} /> Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Delete all memories"
        description="This cannot be undone. Preferences, facts and notes will be removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void clearAll()}>
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">{items.length} memory item(s) will be permanently deleted from this PC.</p>
      </Modal>
    </div>
  );
}
