import { MessageSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, Panel, SectionTitle, Spinner } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { Conversation } from "../lib/types";
import { formatDate, truncate } from "../lib/utils";
import { useApp } from "../store/app-context";

export default function Conversations() {
  const { openConversation, setConversationId, setView, refreshActivity, conversationId } = useApp();
  const { push } = useToast();
  const [items, setItems] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  const load = useCallback(
    async (q: string) => {
      try {
        setItems(await api.conversationsList(q));
      } catch (e) {
        push(String(e), "error");
      } finally {
        setLoading(false);
      }
    },
    [push],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 220);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  const confirmRename = async () => {
    if (!renaming) return;
    try {
      await api.conversationRename(renaming.id, renameValue);
      setRenaming(null);
      await load(query);
      push("Conversation renamed.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.conversationDelete(deleting.id);
      if (deleting.id === conversationId) setConversationId(null);
      setDeleting(null);
      await load(query);
      void refreshActivity();
      push("Conversation deleted.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[980px] flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle
            title="Conversation history"
            subtitle="Every exchange is stored locally in SQLite. Search, rename or delete at any time."
            icon={<MessageSquare size={16} />}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConversationId(null);
                setView("chat");
              }}
            >
              <Plus size={13} /> New chat
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and message content…"
            aria-label="Search conversations"
            className="h-10 pl-9"
          />
        </div>

        <Panel className="p-2">
          {loading ? (
            <div className="flex justify-center py-10 text-muted">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={22} />}
              title={query ? "No matching conversations" : "No conversations yet"}
              description={query ? "Try a different search term." : "Start a chat and it will appear here automatically."}
              action={
                !query ? (
                  <Button size="sm" variant="primary" onClick={() => setView("chat")}>
                    Open AI Chat
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {items.map((c) => (
                <li key={c.id} className="group flex items-center gap-3 px-2 py-3">
                  <button
                    onClick={() => openConversation(c.id)}
                    className="min-w-0 flex-1 text-left focus-ring rounded-md"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-medium text-ink group-hover:text-[var(--accent)]">
                        {c.title}
                      </span>
                      <span className="mono shrink-0 text-[9.5px] text-faint">{formatDate(c.updatedAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="mono text-[9.5px] text-faint">{c.messageCount} messages</span>
                      <span className="truncate text-[11px] text-muted">{truncate(c.preview, 110)}</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Rename ${c.title}`}
                      onClick={() => {
                        setRenaming(c);
                        setRenameValue(c.title);
                      }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${c.title}`}
                      onClick={() => setDeleting(c)}
                      className="hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename conversation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void confirmRename()} disabled={!renameValue.trim()}>
              Save title
            </Button>
          </>
        }
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          maxLength={120}
          autoFocus
          aria-label="Conversation title"
        />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete conversation"
        description="This permanently removes the conversation and all of its messages from local storage."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-muted">“{deleting?.title}”</p>
      </Modal>
    </div>
  );
}
