import { describe, expect, it } from 'vitest';
import type { AiError, AiProvider, AiProviderChunk, AiProviderConfig, AiProviderStreamOptions, AiStreamEventPayload } from '../../src/shared/ai';
import type { ActivityInput } from '../../src/main/services/activity-log.service';
import type { ActivityLogService } from '../../src/main/services/activity-log.service';
import type { PermissionsService } from '../../src/main/services/permissions.service';
import type { ModelRouter, ResolvedAiProvider } from '../../src/main/services/ai/model-router';
import type { PermissionState } from '../../src/shared/permissions';
import { AiProviderError } from '../../src/main/services/ai/ai-errors';
import { AiService } from '../../src/main/services/ai/ai.service';
import { ProviderRegistry } from '../../src/main/services/ai/provider-registry';

interface ScriptOptions {
  chunks?: AiProviderChunk[];
  failBeforeContent?: AiError;
  failAfterChunks?: AiError;
  onFirstAttempt?: (signal: AbortSignal) => Promise<void>;
  models?: string[];
}

class ScriptedAdapter implements AiProvider {
  readonly protocol = 'openai-compatible' as const;
  attempts = 0;

  constructor(private readonly script: ScriptOptions) {}

  async *streamChat(
    _config: AiProviderConfig,
    options: AiProviderStreamOptions,
  ): AsyncIterable<AiProviderChunk> {
    this.attempts += 1;
    if (this.attempts === 1 && this.script.onFirstAttempt) {
      await this.script.onFirstAttempt(options.signal);
    }
    if (this.attempts === 1 && this.script.failBeforeContent) {
      throw new AiProviderError(this.script.failBeforeContent);
    }
    for (const chunk of this.script.chunks ?? []) {
      yield chunk;
    }
    if (this.script.failAfterChunks) {
      throw new AiProviderError(this.script.failAfterChunks);
    }
  }

  async listModels(): Promise<string[]> {
    return this.script.models ?? ['model-a'];
  }
}

const resolved: ResolvedAiProvider = {
  providerId: 'p1',
  providerName: 'Stub Provider',
  protocol: 'openai-compatible',
  baseUrl: 'https://stub.test/v1',
  apiKey: 'dummy-key',
  credentialState: 'configured',
  model: 'model-a',
};

function setup(options: { adapter?: AiProvider; permission?: PermissionState } = {}) {
  const adapter = options.adapter ?? new ScriptedAdapter({});
  const registry = new ProviderRegistry();
  registry.register(adapter);

  const router = {
    resolve: (override?: string) => ({ ...resolved, model: override ?? resolved.model }),
    resolveConfig: () => resolved,
    describe: () => ({ provider: null, config: resolved, model: resolved.model, error: null }),
  } as unknown as ModelRouter;

  const permissionState = options.permission ?? 'granted';
  const permissions = {
    getState: () => permissionState,
  } as unknown as PermissionsService;

  const records: ActivityInput[] = [];
  const activity = {
    tryRecord: (input: ActivityInput) => {
      records.push(input);
      return input;
    },
  } as unknown as ActivityLogService;

  const service = new AiService({
    registry,
    router,
    permissions,
    activity,
    retryPolicy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
    timeoutMs: 2_000,
    sleep: async () => true,
  });

  const events: AiStreamEventPayload[] = [];
  const emit = (payload: AiStreamEventPayload): void => {
    events.push(payload);
  };

  return { adapter, service, events, emit, records };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for a stream event.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const request = { messages: [{ role: 'user' as const, content: 'hello' }] };

describe('AiService', () => {
  it('emits start, delta and done events and logs a completed request', async () => {
    const adapter = new ScriptedAdapter({
      chunks: [
        { type: 'delta', text: 'Hello' },
        { type: 'finish', finishReason: 'stop', usage: null },
      ],
    });
    const { service, events, emit, records } = setup({ adapter });

    const result = service.startStream(1, 'request-0001', request, emit);
    expect(result).toMatchObject({ accepted: true, requestId: 'request-0001' });
    await waitFor(() => events.some((entry) => entry.event.type === 'done'));

    expect(events.map((entry) => entry.event.type)).toEqual(['start', 'delta', 'done']);
    expect(events.find((entry) => entry.event.type === 'delta')?.event).toEqual({
      type: 'delta',
      text: 'Hello',
    });
    expect(records.map((entry) => entry.action)).toContain('ai.request.started');
    expect(records.map((entry) => entry.action)).toContain('ai.request.completed');
    expect(service.activeStreamCount()).toBe(0);
  });

  it('rejects streams without network permission and never calls the adapter', () => {
    const adapter = new ScriptedAdapter({});
    const { service, events, emit, records } = setup({ adapter, permission: 'unset' });

    const result = service.startStream(1, 'request-0002', request, emit);

    expect(result.accepted).toBe(false);
    expect(result.error?.code).toBe('permission_denied');
    expect(events).toEqual([]);
    expect(adapter.attempts).toBe(0);
    expect(records.map((entry) => entry.action)).toContain('ai.request.denied');
  });

  it('retries retryable failures before any content is emitted', async () => {
    const adapter = new ScriptedAdapter({
      failBeforeContent: {
        code: 'network_error',
        message: 'temporary outage',
        retryable: true,
      },
      chunks: [{ type: 'delta', text: 'recovered' }],
    });
    const { service, events, emit, records } = setup({ adapter });

    service.startStream(1, 'request-0003', request, emit);
    await waitFor(() => events.some((entry) => entry.event.type === 'done'));

    expect(adapter.attempts).toBe(2);
    expect(events.map((entry) => entry.event.type)).toEqual(['start', 'delta', 'done']);
    expect(records.map((entry) => entry.action)).toContain('ai.request.retry');
  });

  it('does not retry a stream that already emitted content', async () => {
    const adapter = new ScriptedAdapter({
      chunks: [{ type: 'delta', text: 'partial' }],
      failAfterChunks: {
        code: 'network_error',
        message: 'connection lost',
        retryable: true,
      },
    });
    const { service, events, emit, records } = setup({ adapter });

    service.startStream(1, 'request-0004', request, emit);
    await waitFor(() => events.some((entry) => entry.event.type === 'error'));

    expect(adapter.attempts).toBe(1);
    expect(events.map((entry) => entry.event.type)).toEqual(['start', 'delta', 'error']);
    expect(records.map((entry) => entry.action)).toContain('ai.request.failed');
    expect(events.at(-1)?.event).toMatchObject({
      type: 'error',
      error: { code: 'network_error' },
    });
  });

  it('cancels an in-flight stream with exactly one terminal event', async () => {
    const adapter = new ScriptedAdapter({
      onFirstAttempt: (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    });
    const { service, events, emit, records } = setup({ adapter });

    service.startStream(1, 'request-0005', request, emit);
    await waitFor(() => events.some((entry) => entry.event.type === 'start'));
    expect(service.cancelStream(1, 'request-0005')).toEqual({ cancelled: true });
    await waitFor(() => events.some((entry) => entry.event.type === 'cancelled'));

    expect(events.filter((entry) => entry.event.type === 'cancelled')).toHaveLength(1);
    expect(events.some((entry) => entry.event.type === 'error')).toBe(false);
    expect(records.map((entry) => entry.action)).toContain('ai.request.cancelled');
    expect(service.activeStreamCount()).toBe(0);
  });

  it('lists models through the adapter and reports permission denial', async () => {
    const adapter = new ScriptedAdapter({ models: ['model-a', 'model-b'] });
    const allowed = setup({ adapter });
    await expect(allowed.service.listModels()).resolves.toMatchObject({
      ok: true,
      models: ['model-a', 'model-b'],
    });
    expect(allowed.records.map((entry) => entry.action)).toContain('ai.models.listed');

    const denied = setup({ adapter, permission: 'denied' });
    await expect(denied.service.listModels()).resolves.toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    });
  });

  it('reports an honest status from the router and permission state', () => {
    const { service } = setup();
    expect(service.getStatus()).toMatchObject({
      ready: true,
      activeProviderId: 'p1',
      model: 'model-a',
      networkPermission: 'granted',
    });
    expect(service.getStatus().supportedProtocols).toContain('openai-compatible');
  });
});
