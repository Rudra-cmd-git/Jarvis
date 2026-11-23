import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { PageHeader } from '../components/common/PageHeader';
import { DataRow } from '../components/common/DataRow';
import { Panel } from '../components/common/Panel';
import { StatusPill } from '../components/common/StatusPill';
import { MarkdownMessage } from '../components/chat/MarkdownMessage';
import { useCore } from '../state/core-context';
import { useRuntime } from '../state/runtime-context';
import { formatDateTime } from '../../shared/format';
import type { ViewId } from '../../shared/types';

function capMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const maxMessages = 40;
  const maxCharacters = 100_000;
  const trimmed = messages.slice(-maxMessages);
  const result: typeof trimmed = [];
  let characters = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const message = trimmed[index];
    if (characters + message.content.length > maxCharacters && result.length > 0) {
      break;
    }
    characters += message.content.length;
    result.unshift(message);
  }
  return result.length > 0 ? result : trimmed.slice(-1);
}

export function ChatView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  void onNavigate;
  const { appInfo, error: runtimeError } = useRuntime();
  const {
    settings,
    providers,
    conversations,
    activeConversationId,
    conversationMessages,
    conversationLoading,
    conversationError,
    refreshConversations,
    loadConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    setConversationModel,
    appendConversationMessage,
    updateSetting,
  } = useCore();

  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [busyConversation, setBusyConversation] = useState<string | null>(null);

  const activeRequestId = useRef<string | null>(null);
  const assistantDraftRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const activeConversation = conversations.find((entry) => entry.id === activeConversationId) ?? null;
  const activeProvider = providers.find((entry) => entry.isActive) ?? null;
  const modelOptions = activeProvider?.modelIds ?? [];
  const selectedModel = activeConversation?.model ?? settings['ai.defaultModel'] ?? '';

  const setDraft = useCallback((value: string) => {
    assistantDraftRef.current = value;
    setAssistantDraft(value);
  }, []);

  const finalizeAssistant = useCallback(
    async (status: 'complete' | 'cancelled' | 'error', metadata: Record<string, unknown>) => {
      const text = assistantDraftRef.current.trim();
      if (text && activeConversationId) {
        await appendConversationMessage({
          conversationId: activeConversationId,
          role: 'assistant',
          content: text,
          metadata: { status, ...metadata },
        });
      }
      setDraft('');
      setStreaming(false);
      activeRequestId.current = null;
    },
    [activeConversationId, appendConversationMessage, setDraft],
  );

  useEffect(() => {
    return window.jarvis.onChatStreamEvent(({ requestId, event }) => {
      if (requestId !== activeRequestId.current) {
        return;
      }
      if (event.type === 'delta') {
        setDraft(assistantDraftRef.current + event.text);
      } else if (event.type === 'done') {
        void finalizeAssistant('complete', {
          finishReason: event.finishReason,
          usage: event.usage,
          durationMs: event.durationMs,
        }).then(() => {
          setTerminal(`Completed in ${event.durationMs} ms`);
        });
      } else if (event.type === 'error') {
        setStreamError(`${event.error.code}: ${event.error.message}`);
        void finalizeAssistant('error', { error: event.error, durationMs: event.durationMs }).then(() => {
          setTerminal(null);
        });
      } else if (event.type === 'cancelled') {
        void finalizeAssistant('cancelled', { durationMs: event.durationMs }).then(() => {
          setTerminal(`Stopped after ${event.durationMs} ms`);
        });
      }
    });
  }, [finalizeAssistant, setDraft]);

  useEffect(() => {
    if (initializedRef.current || conversationLoading) {
      return;
    }
    initializedRef.current = true;
    void (async () => {
      try {
        if (conversations.length === 0) {
          await createConversation();
        } else if (!activeConversationId) {
          await loadConversation(conversations[0].id);
        }
      } catch (cause) {
        setStreamError(cause instanceof Error ? cause.message : 'Chat could not be initialized.');
      }
    })();
  }, [conversationLoading, conversations, activeConversationId, createConversation, loadConversation]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !isAtBottom) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [conversationMessages, assistantDraft, isAtBottom]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 48);
  }, []);

  const handleNewConversation = useCallback(async () => {
    if (streaming) {
      return;
    }
    setStreamError(null);
    setTerminal(null);
    await createConversation({ model: settings['ai.defaultModel'] || null });
  }, [createConversation, settings, streaming]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (streaming || id === activeConversationId) {
        return;
      }
      setStreamError(null);
      setTerminal(null);
      await loadConversation(id);
    },
    [activeConversationId, loadConversation, streaming],
  );

  const handleRename = useCallback(
    async (conversation: { id: string; title: string }) => {
      if (streaming) {
        return;
      }
      const nextTitle = window.prompt('Rename conversation', conversation.title);
      if (!nextTitle || nextTitle.trim() === conversation.title) {
        return;
      }
      setBusyConversation(conversation.id);
      try {
        await renameConversation(conversation.id, nextTitle.trim());
      } catch (cause) {
        setStreamError(cause instanceof Error ? cause.message : 'Conversation could not be renamed.');
      } finally {
        setBusyConversation(null);
      }
    },
    [renameConversation, streaming],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (streaming) {
        return;
      }
      if (!window.confirm('Delete this conversation and all of its messages?')) {
        return;
      }
      setBusyConversation(id);
      try {
        await deleteConversation(id);
      } catch (cause) {
        setStreamError(cause instanceof Error ? cause.message : 'Conversation could not be deleted.');
      } finally {
        setBusyConversation(null);
      }
    },
    [deleteConversation, streaming],
  );

  const handleModelChange = useCallback(
    async (value: string) => {
      if (!activeConversationId) {
        await updateSetting('ai.defaultModel', value);
        return;
      }
      await setConversationModel(activeConversationId, value || null);
    },
    [activeConversationId, setConversationModel, updateSetting],
  );

  const handleSend = useCallback(async () => {
    const text = prompt.trim();
    if (!text || streaming || !activeConversationId) {
      return;
    }
    setPrompt('');
    setStreamError(null);
    setTerminal(null);
    setDraft('');

    await appendConversationMessage({
      conversationId: activeConversationId,
      role: 'user',
      content: text,
    });

    const history = conversationMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const messages = capMessages([...history, { role: 'user' as const, content: text }]);

    const requestId =
      globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID().replace(/-/g, '')
        : `req${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    activeRequestId.current = requestId;
    setStreaming(true);

    try {
      const result = await window.jarvis.startChatStream(requestId, {
        messages,
        model: selectedModel || undefined,
      });
      if (!result.accepted) {
        setStreamError(result.error?.message ?? 'The stream was rejected.');
        setStreaming(false);
        activeRequestId.current = null;
      }
    } catch (cause) {
      setStreamError(cause instanceof Error ? cause.message : 'The stream could not be started.');
      setStreaming(false);
      activeRequestId.current = null;
    }
  }, [
    activeConversationId,
    appendConversationMessage,
    conversationMessages,
    prompt,
    selectedModel,
    setDraft,
    streaming,
  ]);

  const handleStop = useCallback(async () => {
    const requestId = activeRequestId.current;
    if (!requestId) {
      return;
    }
    try {
      await window.jarvis.cancelChatStream(requestId);
    } catch (cause) {
      setStreamError(cause instanceof Error ? cause.message : 'The stream could not be cancelled.');
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <main className="view" data-view="chat">
      <PageHeader
        viewId="chat"
        eyebrow="CONVERSATION ENGINE"
        title="AI Chat"
        subtitle="Streamed responses from your configured provider, stored locally in SQLite and never exposed as raw credentials."
        actions={
          <>
            <StatusPill tone={streaming ? 'warn' : 'good'}>{streaming ? 'Streaming' : 'Ready'}</StatusPill>
            <Button variant="primary" onClick={() => void handleNewConversation()} disabled={streaming}>
              New conversation
            </Button>
          </>
        }
      />

      {conversationError && (
        <ErrorState
          title="Conversation unavailable"
          message={conversationError}
          onRetry={() => void refreshConversations()}
        />
      )}

      <section className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <span className="eyebrow">CONVERSATIONS</span>
            <Button
              variant="ghost"
              onClick={() => void handleNewConversation()}
              disabled={streaming}
              data-action="new-conversation"
            >
              New
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="settings-note">No conversations yet.</p>
          ) : (
            <ul className="conversation-list">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={`conversation-row${conversation.id === activeConversationId ? ' conversation-row--active' : ''}`}
                  data-conversation-id={conversation.id}
                >
                  <button
                    type="button"
                    className="conversation-select"
                    onClick={() => void handleSelectConversation(conversation.id)}
                    disabled={streaming || busyConversation === conversation.id}
                  >
                    <strong>{conversation.title}</strong>
                    <span className="conversation-preview">{conversation.preview ?? 'No messages yet'}</span>
                    <span className="conversation-meta">
                      {conversation.messageCount} messages · {formatDateTime(conversation.updatedAt)}
                    </span>
                  </button>
                  <div className="conversation-actions">
                    <Button
                      disabled={streaming || busyConversation === conversation.id}
                      onClick={() => void handleRename(conversation)}
                      data-action="rename-conversation"
                    >
                      Rename
                    </Button>
                    <Button
                      variant="danger"
                      disabled={streaming || busyConversation === conversation.id}
                      onClick={() => void handleDelete(conversation.id)}
                      data-action="delete-conversation"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="chat-main">
          <div className="chat-toolbar">
            <select
              className="field-input"
              aria-label="Chat model"
              value={selectedModel}
              onChange={(event) => void handleModelChange(event.target.value)}
              disabled={streaming || modelOptions.length === 0}
            >
              {modelOptions.length === 0 && <option value="">No models configured</option>}
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <StatusPill tone={activeProvider ? 'good' : 'warn'}>
              {activeProvider ? activeProvider.name : 'No active provider'}
            </StatusPill>
            {!isAtBottom && (
              <Button variant="ghost" onClick={() => setIsAtBottom(true)} data-action="jump-to-latest">
                Jump to latest
              </Button>
            )}
          </div>

          {conversationLoading && <LoadingState label="conversation" rows={4} />}

          <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
            {conversationMessages.length === 0 && !assistantDraft && !streaming && (
              <EmptyState
                title="Start the conversation"
                description="Send a message to stream a response from your configured provider."
                meta={activeConversation?.model ? `Model: ${activeConversation.model}` : 'Select a model above'}
                testId="chat"
              />
            )}

            {conversationMessages.map((message) => (
              <article
                key={message.id}
                className={`chat-message chat-message--${message.role}`}
                data-role={message.role}
              >
                <header className="chat-message-head">
                  <strong>{message.role === 'user' ? 'You' : 'JARVIS'}</strong>
                  <span>{formatDateTime(message.createdAt)}</span>
                  {message.metadata?.status === 'cancelled' && <StatusPill tone="warn">Stopped</StatusPill>}
                  {message.metadata?.status === 'error' && <StatusPill tone="danger">Failed</StatusPill>}
                </header>
                <div className="chat-message-body">
                  <MarkdownMessage content={message.content} />
                </div>
              </article>
            ))}

            {(streaming || assistantDraft) && (
              <article className="chat-message chat-message--assistant chat-message--streaming" data-role="assistant">
                <header className="chat-message-head">
                  <strong>JARVIS</strong>
                  <StatusPill tone="warn">Streaming</StatusPill>
                </header>
                <div className="chat-message-body">
                  <MarkdownMessage content={assistantDraft || '…'} />
                </div>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>

          {streamError && <p className="settings-note settings-note--danger">{streamError}</p>}
          {terminal && <p className="settings-note">{terminal}</p>}

          <div className="chat-composer">
            <textarea
              className="field-input chat-prompt"
              aria-label="Chat message"
              placeholder="Ask JARVIS anything…"
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming || !activeConversationId}
            />
            <div className="chat-composer-actions">
              {streaming ? (
                <Button variant="danger" onClick={() => void handleStop()} data-action="stop-generation">
                  Stop
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => void handleSend()}
                  disabled={prompt.trim().length === 0 || !activeConversationId}
                  data-action="send-message"
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <Panel title="Runtime" eyebrow="LOCAL PROCESS">
        <div className="grid grid--2">
          <DataRow label="Application" value={appInfo ? `${appInfo.appName} ${appInfo.appVersion}` : '—'} />
          <DataRow label="Active provider" value={activeProvider ? activeProvider.name : 'None'} />
          <DataRow label="Bridge" value={runtimeError ? 'Error' : 'Online'} tone={runtimeError ? 'danger' : 'good'} />
        </div>
      </Panel>
    </main>
  );
}
