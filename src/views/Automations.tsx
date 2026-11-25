import { Play, Plus, Trash2, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, Panel, SectionTitle } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { Automation } from "../lib/types";
import { formatDate } from "../lib/utils";
import { useApp } from "../store/app-context";

export default function Automations() {
  const { setHandoffPrompt, setView, setConversationId } = useApp();
  const { push } = useToast();
  const [items, setItems] = useState<Automation[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api.automationsList());
    } catch (e) {
      push(String(e), "error");
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (item?: Automation) => {
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setPrompt(item?.prompt ?? "");
    setOpen(true);
  };

  const save = async () => {
    try {
      await api.automationSave({ id: editing?.id ?? null, name, prompt });
      setOpen(false);
      await load();
      push(editing ? "Automation updated." : "Automation saved.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.automationDelete(id);
      await load();
      push("Automation removed.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const runNow = async (item: Automation) => {
    try {
      await api.automationMarkRun(item.id);
      setConversationId(null);
      setHandoffPrompt(item.prompt);
      setView("chat");
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[980px] flex-col gap-4">
        <SectionTitle
          title="Automations"
          subtitle="Saved instructions you can launch with one click. They run as normal chat requests, so tools and approvals still apply."
          icon={<Workflow size={16} />}
          action={
            <Button size="sm" variant="primary" onClick={() => openEditor()}>
              <Plus size={13} /> New automation
            </Button>
          }
        />

        <Panel className="p-3">
          {items.length === 0 ? (
            <EmptyState
              icon={<Workflow size={22} />}
              title="No automations yet"
              description="Create a repeatable instruction such as a morning briefing request or a note-capture routine."
              action={
                <Button size="sm" variant="secondary" onClick={() => openEditor()}>
                  Create the first one
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start gap-3 px-1 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-ink">{item.name}</span>
                      <span className="mono text-[9px] text-faint">
                        {item.lastRunAt ? `last run ${formatDate(item.lastRunAt)}` : "never run"}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">{item.prompt}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => openEditor(item)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => void remove(item.id)}>
                      <Trash2 size={12} />
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => void runNow(item)}>
                      <Play size={12} /> Run
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <p className="px-1 text-[10px] leading-relaxed text-faint">
          Automations are not background schedulers. Nothing runs unless you press Run, and each request is visible in the
          chat transcript and activity log.
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit automation" : "New automation"}
        description="This is saved locally and sent to the AI provider only when you run it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={!name.trim() || !prompt.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" hint={`${name.length}/80`}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Morning briefing" autoFocus />
          </Field>
          <Field label="Instruction" hint={`${prompt.length}/4000`}>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4000}
              className="min-h-[140px]"
              placeholder="Give me a short briefing: date, system status, and any notes I saved for today."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
