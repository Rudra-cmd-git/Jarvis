import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiStatus } from '../../../shared/ai';
import { Button } from '../common/Button';
import { DataRow } from '../common/DataRow';
import { Panel } from '../common/Panel';
import { StatusPill } from '../common/StatusPill';
import { useCore } from '../../state/core-context';

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function newRequestId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  return `req${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function AiPanel() {
  const { settings, providers, permissions, updateSetting, setPermission } = useCore();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [terminal, setTerminal] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const activeRequestId = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await window.jarvis.getAiStatus());
      setStatusError(null);
    } catch (cause) {
      setStatusError(messageOf(cause, 'AI status could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, settings, permissions]);

  useEffect(() => {
    return window.jarvis.onChatStreamEvent(({ requestId, event }) => {
      if (requestId !== activeRequestId.current) {
        return;
      }
      if (event.type === 'start') {
        setOutput('');
        setStreamError(null);
        setTerminal(`Streaming from ${event.providerName} · ${event.model}`);
        setStreaming(true);
      } else if (event.type === 'delta') {
        setOutput((current) => current + event.text);
      } else if (event.type === 'done') {
        setTerminal(`Completed in ${event.durationMs} ms · ${event.finishReason ?? 'end of stream'}`);
        setStreaming(false);
      } else if (event.type === 'error') {
        setStreamError(`${event.error.code}: ${event.error.message}`);
        setTerminal(null);
        setStreaming(false);
      } else if (event.type === 'cancelled') {
        setTerminal(`Cancelled after ${event.durationMs} ms`);
        setStreaming(false);
      }
    });
  }, []);

  const activeProvider = providers.find((provider) => provider.isActive) ?? null;
  const modelOptions = [
    ...new Set([
      ...(activeProvider?.modelIds ?? []),
      ...(models ?? []),
      ...(status?.model ? [status.model] : []),
      ...(settings['ai.defaultModel'] ? [settings['ai.defaultModel']] : []),
    ]),
  ].filter((model) => model.length > 0);

  const handleGrant = async () => {
    setPermissionBusy(true);
    try {
      await setPermission('network.request', 'grant');
      await loadStatus();
    } catch (cause) {
      setStatusError(messageOf(cause, 'The permission could not be granted.'));
    } finally {
      setPermissionBusy(false);
    }
  };

  const handleTestModels = async () => {
    setModelsBusy(true);
    setModelsError(null);
    setModels(null);
    try {
      const result = await window.jarvis.listAiModels();
      if (result.ok) {
        setModels(result.models);
      } else {
        setModelsError(result.error?.message ?? 'The provider did not return a model list.');
      }
    } catch (cause) {
      setModelsError(messageOf(cause, 'The connection test failed.'));
    } finally {
      setModelsBusy(false);
    }
  };

  const handleRun = async () => {
    const text = prompt.trim();
    if (!text || !status?.ready) {
      return;
    }

    const requestId = newRequestId();
    activeRequestId.current = requestId;
    setOutput('');
    setStreamError(null);
    setTerminal('Starting stream…');
    setStreaming(true);

    try {
      const result = await window.jarvis.startChatStream(requestId, {
        messages: [{ role: 'user', content: text }],
      });
      if (!result.accepted) {
        setStreamError(result.error?.message ?? 'The stream was rejected.');
        setTerminal(null);
        setStreaming(false);
      }
    } catch (cause) {
      setStreamError(messageOf(cause, 'The stream could not be started.'));
      setTerminal(null);
      setStreaming(false);
    }
  };

  const handleCancel = async () => {
    const requestId = activeRequestId.current;
    if (!requestId) {
      return;
    }
    setTerminal('Cancellation requested…');
    try {
      await window.jarvis.cancelChatStream(requestId);
    } catch (cause) {
      setStreamError(messageOf(cause, 'The stream could not be cancelled.'));
    }
  };

  return (
    <Panel
      title="AI runtime"
      eyebrow="OPENAI-COMPATIBLE ADAPTER · STREAMING"
      action={
        <StatusPill tone={status?.ready ? 'good' : 'warn'}>
          {status?.ready ? 'Ready' : 'Not ready'}
        </StatusPill>
      }
    >
      <div data-testid="ai-status" data-ai-ready={status?.ready ? 'true' : 'false'}>
        <DataRow label="Active provider" value={status?.activeProviderName ?? 'None'} />
        <DataRow label="Model" value={status?.model ?? 'Not selected'} />
        <DataRow
          label="Protocol"
          value={status?.protocol ?? '—'}
          tone={status?.protocol ? 'default' : 'warn'}
        />
        <DataRow
          label="Credential"
          value={status?.credentialState ?? '—'}
          tone={status?.credentialState === 'configured' ? 'good' : 'warn'}
        />
        <DataRow
          label="Network permission"
          value={status?.networkPermission ?? '—'}
          tone={status?.networkPermission === 'granted' ? 'good' : 'warn'}
        />
        <DataRow
          label="Adapters"
          value={status?.supportedProtocols.join(', ') || 'None'}
        />
      </div>

      <p className="settings-note">{status?.detail ?? 'Loading AI runtime status…'}</p>
      {statusError && <p className="settings-note settings-note--danger">{statusError}</p>}

      {status?.networkPermission !== 'granted' && (
        <div className="form-actions">
          <Button
            variant="primary"
            disabled={permissionBusy}
            onClick={() => void handleGrant()}
            data-action="ai-grant-network"
          >
            {permissionBusy ? 'Granting…' : 'Grant outbound network access'}
          </Button>
        </div>
      )}

      <div className="ai-model-row">
        <label className="field">
          <span>Default model</span>
          <select
            className="field-input"
            aria-label="Default AI model"
            data-setting="ai.defaultModel"
            value={settings['ai.defaultModel']}
            onChange={(event) => void updateSetting('ai.defaultModel', event.target.value)}
            disabled={modelOptions.length === 0}
          >
            {modelOptions.length === 0 && <option value="">No models configured</option>}
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!status?.ready || modelsBusy}
          onClick={() => void handleTestModels()}
          data-action="ai-test-connection"
        >
          {modelsBusy ? 'Testing…' : 'Test connection'}
        </Button>
      </div>

      {models && (
        <p className="settings-note settings-note--good" data-testid="ai-models">
          Discovered models: {models.join(' · ') || 'none'}
        </p>
      )}
      {modelsError && <p className="settings-note settings-note--danger">{modelsError}</p>}

      <div className="settings-subhead">
        <span className="eyebrow">STREAM DIAGNOSTIC</span>
      </div>
      <label className="field field--wide">
        <span>Prompt</span>
        <textarea
          className="field-input ai-prompt"
          aria-label="AI stream test prompt"
          spellCheck={false}
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!status?.ready || streaming}
        />
      </label>
      <div className="form-actions">
        <Button
          variant="primary"
          disabled={!status?.ready || streaming || prompt.trim().length === 0}
          onClick={() => void handleRun()}
          data-action="ai-run-stream"
        >
          {streaming ? 'Streaming…' : 'Run stream test'}
        </Button>
        <Button
          variant="danger"
          disabled={!streaming}
          onClick={() => void handleCancel()}
          data-action="ai-cancel-stream"
        >
          Cancel stream
        </Button>
      </div>
      {terminal && <p className="settings-note">{terminal}</p>}
      {streamError && <p className="settings-note settings-note--danger">{streamError}</p>}
      <pre className="ai-stream-output" data-testid="ai-stream-output">
        {output || 'No stream output yet.'}
      </pre>
      <p className="settings-note">
        This diagnostic exercises the main-process adapter directly. Keys stay encrypted and never
        appear here. Full conversational chat arrives in Milestone 5.
      </p>
    </Panel>
  );
}
