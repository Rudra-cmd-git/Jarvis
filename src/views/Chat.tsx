import { ArrowUp, Ban, ChevronDown, History, Loader2, Mic, Plus, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JarvisCore } from "../components/core/JarvisCore";
import { MarkdownMessage } from "../components/chat/MarkdownMessage";
import { Button } from "../components/ui/Button";
import { EmptyState, StatusDot } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { api, events } from "../lib/api";
import type { ChatResult, Message, ToolOutcome } from "../lib/types";
import { cn, formatTime } from "../lib/utils";
import { useApp } from "../store/app-context";
import { useDictation } from "../voice/dictation";
import { useTts } from "../voice/tts";

const SUGGESTIONS = [
  "Open Notepad for me",
  "What is the current date and time?",
  "Search the web for today's technology news",
  "Save a note: review the JARVIS project tomorrow",
];

export default function Chat() {
  const {
    conversationId,
    setConversationId,
    setView,
    activeProvider,
    settings,
    saveSettings,
    handoffPrompt,
    setHandoffPrompt,
    setCoreState,
    setTask,
    runTool,
    refreshActivity,
  } = useApp();
  const { push } = useToast();
  const tts = useTts();

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoSentRef = useRef<string | null>(null);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const dictation = useDictation((text) => {
    setDraft((prev) => (prev ? `${prev} ${text}` : text));
  });

  useEffect(() => {
    let active = true;
    const unlisten: Array<() => void> = [];
    void events.onDelta((payload) => {
      if (!active || payload.requestId !== requestRef.current) return;
      setStreamText((prev) => prev + payload.text);
    }).then((u) => unlisten.push(u));
    void events.onStatus((payload) => {
      if (!active || payload.requestId !== requestRef.current) return;
      if (payload.phase === "connecting") setCoreState("connecting");
      if (payload.phase === "fallback") {
        setTask(`Falling back to ${payload.provider ?? "backup provider"}`);
        push(payload.detail ? `Primary provider failed: ${payload.detail}` : "Switching to backup provider", "info");
      }
      if (payload.phase === "done") {
        setCoreState("idle");
        setTask("Standing by");
      }
    }).then((u) => unlisten.push(u));
    return () => {
      active = false;
      unlisten.forEach((u) => u());
    };
  }, [push, setCoreState, setTask]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .conversationGet(conversationId)
      .then((detail) => {
        if (active) setMessages(detail.messages);
      })
      .catch(() => {
        if (active) setConversationId(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [conversationId, setConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText, busyTool]);

  const speakResponse = useCallback((text: string) => {
    const cfg = settingsRef.current;
    if (cfg?.voice.autoSpeak) ttsRef.current.speak(text);
  }, []);

  const continueTurn = useCallback(
    async (id: string, round: number): Promise<void> => {
      const requestId = crypto.randomUUID();
      requestRef.current = requestId;
      setStreaming(true);
      setStreamText("");
      setCoreState("connecting");
      setTask("Generating follow-up");
      try {
        const result = await api.chatContinue({
          conversationId: id,
          providerId: activeProvider?.id ?? null,
          requestId,
        });
        const detail = await api.conversationGet(id);
        setMessages(detail.messages);
        setStreamText("");
        setCoreState("idle");
        setTask("Standing by");
        speakResponse(result.message.content);
        if (result.tool && round < 2) {
          await handleTool(id, result, round);
        }
      } catch (e) {
        setError(String(e));
        setCoreState("error");
        setTask("Request failed");
      } finally {
        setStreaming(false);
        requestRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProvider?.id, setCoreState, setTask, speakResponse],
  );

  const handleTool = useCallback(
    async (id: string, result: ChatResult, round: number) => {
      if (!result.tool) return;
      const { tool, args, reason } = result.tool;
      setBusyTool(tool);
      setCoreState("thinking");
      setTask(`Running ${tool}`);
      const outcome: ToolOutcome = await runTool(tool, args, reason || `JARVIS requested ${tool}`);
      let toolMessage: string;
      if (outcome.status === "completed") {
        toolMessage = `TOOL RESULT (${tool}) — ${outcome.result.summary}\n${JSON.stringify(outcome.result.detail ?? {}, null, 0).slice(0, 4000)}`;
        if (outcome.result.ok) push(outcome.result.summary, "success");
      } else if (outcome.status === "denied") {
        toolMessage = `TOOL RESULT (${tool}) — DENIED: ${outcome.reason}. Tell the user the action did not happen.`;
        push(outcome.reason, "error");
      } else {
        toolMessage = `TOOL RESULT (${tool}) — no action was executed.`;
      }
      try {
        await api.conversationAddMessage(id, "tool", toolMessage);
        const detail = await api.conversationGet(id);
        setMessages(detail.messages);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusyTool(null);
        void refreshActivity();
      }
      await continueTurn(id, round + 1);
    },
    [continueTurn, push, refreshActivity, runTool, setCoreState, setTask],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      if (!activeProvider) {
        setError("No AI provider is configured. Add one in Integrations.");
        setView("integrations");
        return;
      }
      setError(null);
      setDraft("");
      let id = conversationId;
      try {
        if (!id) {
          id = await api.conversationCreate();
          setConversationId(id);
        }
        const requestId = crypto.randomUUID();
        requestRef.current = requestId;
        cancelledRef.current = false;
        const optimistic: Message = {
          id: `local-${requestId}`,
          conversationId: id,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          providerId: null,
          model: null,
        };
        setMessages((prev) => [...prev, optimistic]);
        setStreaming(true);
        setStreamText("");
        setCoreState("connecting");
        setTask(`Contacting ${activeProvider.name}`);
        const result = await api.chatSend({
          conversationId: id,
          providerId: activeProvider.id,
          content,
          requestId,
        });
        const detail = await api.conversationGet(id);
        setMessages(detail.messages);
        setStreamText("");
        setCoreState("idle");
        setTask("Standing by");
        speakResponse(result.message.content);
        if (result.fallbackUsed) push(`Answered by backup provider ${result.providerName}`, "info");
        if (result.tool) await handleTool(id, result, 0);
      } catch (e) {
        if (!cancelledRef.current) {
          const message = String(e);
          setError(message);
          setCoreState("error");
          setTask("Request failed");
        } else {
          setCoreState("idle");
          setTask("Standing by");
        }
        if (id) {
          try {
            const detail = await api.conversationGet(id);
            setMessages(detail.messages);
          } catch {
            /* keep optimistic list */
          }
        }
      } finally {
        setStreaming(false);
        requestRef.current = null;
        void refreshActivity();
      }
    },
    [activeProvider, conversationId, handleTool, push, refreshActivity, setConversationId, setCoreState, setTask, setView, speakResponse, streaming],
  );

  useEffect(() => {
    if (!handoffPrompt) {
      autoSentRef.current = null;
      return;
    }
    if (autoSentRef.current === handoffPrompt) return;
    autoSentRef.current = handoffPrompt;
    setHandoffPrompt(null);
    void sendMessage(handoffPrompt);
  }, [handoffPrompt, sendMessage, setHandoffPrompt]);

  const stop = useCallback(() => {
    if (requestRef.current) {
      cancelledRef.current = true;
      void api.chatCancel(requestRef.current);
      requestRef.current = null;
    }
    setStreaming(false);
    setStreamText("");
    setCoreState("idle");
    setTask("Cancelled");
  }, [setCoreState, setTask]);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setStreamText("");
    setError(null);
    setDraft("");
  }, [setConversationId]);

  const toggleTts = () => {
    if (!settings) return;
    void saveSettings({ ...settings, voice: { ...settings.voice, ttsEnabled: !settings.voice.ttsEnabled } });
    if (tts.speaking) tts.stop();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <JarvisCore state={streaming ? "thinking" : "idle"} size={34} compact />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="display text-[12px] font-semibold tracking-[0.16em] text-ink">AI CHAT</span>
              {activeProvider ? (
                <span className="flex items-center gap-1.5 text-[10px] text-muted">
                  <StatusDot tone={activeProvider.hasKey ? "ok" : "warn"} />
                  {activeProvider.name} · {activeProvider.model}
                </span>
              ) : (
                <span className="text-[10px] text-danger">no provider</span>
              )}
            </div>
            <p className="truncate text-[10px] text-faint">
              {streaming ? "Streaming response…" : "Local conversation history · tool use is approval-gated"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {tts.speaking ? (
            <Button size="sm" variant="ghost" onClick={() => tts.stop()} title="Stop speaking">
              <Volume2 size={13} className="text-[var(--accent)]" /> Stop
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTts}
            aria-label={settings?.voice.ttsEnabled ? "Disable spoken replies" : "Enable spoken replies"}
            title={settings?.voice.ttsEnabled ? "Spoken replies on" : "Spoken replies off"}
          >
            {settings?.voice.ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setView("conversations")}>
            <History size={13} /> History
          </Button>
          <Button size="sm" variant="secondary" onClick={newConversation}>
            <Plus size={13} /> New
          </Button>
        </div>
      </header>

      {!activeProvider ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber/20 bg-amber/[0.06] px-4 py-2.5">
          <span className="text-xs text-amber">Connect an AI provider to start a conversation.</span>
          <Button size="sm" variant="outline" onClick={() => setView("integrations")}>
            Open Integrations
          </Button>
        </div>
      ) : null}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : null}

          {!loading && messages.length === 0 && !streaming ? (
            <div className="pt-8">
              <EmptyState
                icon={<JarvisCore state={activeProvider ? "idle" : "offline"} size={140} compact />}
                title="At your service."
                description="Ask a question, request a task, or use push-to-talk. JARVIS will only act on your computer through approved, allowlisted tools."
                action={
                  <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => void sendMessage(s)}
                        className="focus-ring rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          ) : null}

          {messages.map((m, idx) => (
            <MessageBubble
              key={m.id}
              message={m}
              streaming={false}
              onSpeak={() => tts.speak(m.content)}
              showSpeak={m.role === "assistant" && tts.supported}
              isLast={idx === messages.length - 1}
            />
          ))}

          {busyTool ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber/20 bg-amber/[0.05] px-3 py-2 text-[11.5px] text-amber">
              <Loader2 size={13} className="animate-spin" /> Running tool: {busyTool}
            </div>
          ) : null}

          {streaming ? (
            <MessageBubble
              message={{
                id: "streaming",
                conversationId: conversationId ?? "",
                role: "assistant",
                content: streamText || "…",
                createdAt: new Date().toISOString(),
                providerId: activeProvider?.id ?? null,
                model: activeProvider?.model ?? null,
              }}
              streaming
              onSpeak={() => {}}
              showSpeak={false}
              isLast
            />
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-danger">
              <Ban size={13} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-[10px] underline decoration-dotted">
                dismiss
              </button>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line/70 bg-[#050a12]/70 px-4 py-3">
        <div className="mx-auto max-w-[820px]">
          {dictation.listening ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/[0.06] px-3 py-2 text-[11.5px] text-amber">
              <Mic size={13} className="animate-pulse" />
              <span className="flex-1 truncate">{dictation.interim || "Listening… speak now"}</span>
              <button onClick={dictation.cancel} className="text-[10px] underline decoration-dotted">
                cancel
              </button>
            </div>
          ) : null}
          {dictation.error ? (
            <div className="mb-2 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11px] leading-relaxed text-danger">
              {dictation.error}
            </div>
          ) : null}

          <div className="panel flex items-end gap-2 px-2.5 py-2 focus-within:border-[var(--accent-line)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(draft);
                }
              }}
              rows={1}
              placeholder={activeProvider ? "Message JARVIS… (Enter to send, Shift+Enter for a new line)" : "Configure a provider first"}
              aria-label="Message JARVIS"
              disabled={streaming}
              className="scroll-thin max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-faint disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : void dictation.start())}
              aria-label={dictation.listening ? "Stop dictation" : "Push to talk"}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-ring",
                dictation.listening
                  ? "border-amber/50 bg-amber/15 text-amber"
                  : "border-line text-muted hover:border-[var(--accent-line)] hover:text-[var(--accent)]",
              )}
            >
              {dictation.listening ? <Square size={13} /> : <Mic size={15} />}
            </button>
            {streaming ? (
              <Button size="icon" variant="danger" onClick={stop} aria-label="Stop response" title="Stop response">
                <Square size={14} />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="primary"
                onClick={() => void sendMessage(draft)}
                disabled={!draft.trim()}
                aria-label="Send message"
              >
                <ArrowUp size={15} />
              </Button>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-faint">
            <span className="flex items-center gap-1.5">
              <ChevronDown size={10} /> history depth {settings?.historyLimit ?? 20} turns
            </span>
            <span>Streaming responses · provider fallback enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onSpeak,
  showSpeak,
  isLast,
}: {
  message: Message;
  streaming: boolean;
  onSpeak: () => void;
  showSpeak: boolean;
  isLast: boolean;
}) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isTool) {
    return (
      <div className="rounded-lg border border-line/70 bg-white/[0.02] px-3 py-2">
        <div className="mono mb-1 text-[9px] uppercase tracking-[0.18em] text-faint">tool result</div>
        <pre className="scroll-thin mono max-h-48 overflow-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
          {message.content}
        </pre>
      </div>
    );
  }

  return (
    <div className={cn("group flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div className="flex items-center gap-1.5 px-1 text-[9.5px] uppercase tracking-[0.16em] text-faint">
        <span>{isUser ? "You" : "JARVIS"}</span>
        <span>·</span>
        <span className="mono">{formatTime(message.createdAt)}</span>
        {!isUser && message.model ? <span className="mono hidden md:inline">· {message.model}</span> : null}
      </div>
      <div
        className={cn(
          "max-w-[min(760px,94%)] rounded-xl border px-3.5 py-2.5",
          isUser
            ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ink"
            : "border-line bg-[#08111d]/85",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.content}</p>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
        {streaming ? <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[var(--accent)] align-middle" /> : null}
      </div>
      {showSpeak && !streaming && isLast ? (
        <button
          onClick={onSpeak}
          className="flex items-center gap-1 px-1 text-[10px] text-faint opacity-0 transition-opacity hover:text-[var(--accent)] group-hover:opacity-100 focus-ring"
        >
          <Volume2 size={11} /> speak
        </button>
      ) : null}
    </div>
  );
}
