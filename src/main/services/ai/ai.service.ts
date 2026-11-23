import type {
  AiCancelResult,
  AiChatRequest,
  AiError,
  AiModelListResult,
  AiStatus,
  AiStreamEvent,
  AiStreamEventPayload,
  AiStreamStartResult,
  AiUsage,
} from '../../../shared/ai';
import { AI_LIMITS } from '../../../shared/ai';
import type { ActivityLogService } from '../activity-log.service';
import type { PermissionsService } from '../permissions.service';
import { AiProviderError, createAiError, toAiError } from './ai-errors';
import type { ModelRouter, ResolvedAiProvider } from './model-router';
import type { ProviderRegistry } from './provider-registry';
import {
  DEFAULT_RETRY_POLICY,
  createTimeoutSignal,
  retryDelayMs,
  shouldRetry,
  sleepWithSignal,
  type RetryPolicy,
} from './retry';

export interface AiServiceOptions {
  registry: ProviderRegistry;
  router: ModelRouter;
  permissions: PermissionsService;
  activity: ActivityLogService;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  modelListTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<boolean>;
}

interface ActiveStream {
  requestId: string;
  senderId: number;
  controller: AbortController;
  startedAt: number;
  providerId: string;
  providerName: string;
  model: string;
  settled: boolean;
}

type Emit = (payload: AiStreamEventPayload) => void;

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL_LIST_TIMEOUT_MS = 15_000;

function permissionError(): AiError {
  return createAiError(
    'permission_denied',
    'Outbound network access is not permitted. Grant “Make outbound network requests” in Settings.',
    false,
  );
}

export class AiService {
  private readonly registry: ProviderRegistry;
  private readonly router: ModelRouter;
  private readonly permissions: PermissionsService;
  private readonly activity: ActivityLogService;
  private readonly retryPolicy: RetryPolicy;
  private readonly timeoutMs: number;
  private readonly modelListTimeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<boolean>;
  private readonly streams = new Map<string, ActiveStream>();

  constructor(options: AiServiceOptions) {
    this.registry = options.registry;
    this.router = options.router;
    this.permissions = options.permissions;
    this.activity = options.activity;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.modelListTimeoutMs = options.modelListTimeoutMs ?? DEFAULT_MODEL_LIST_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleepWithSignal;
  }

  getStatus(): AiStatus {
    const described = this.router.describe();
    const networkPermission = this.permissions.getState('network.request');
    const supportedProtocols = this.registry.protocols();
    const model = described.model;
    const ready = Boolean(described.config && model && networkPermission === 'granted');

    let detail: string;
    if (described.error) {
      detail = described.error.message;
    } else if (networkPermission !== 'granted') {
      detail = 'Grant “Make outbound network requests” in Settings before using a provider.';
    } else if (!model) {
      detail = 'Select a model for the active provider.';
    } else {
      detail = `Ready to stream from ${described.config?.providerName ?? 'the active provider'}.`;
    }

    return {
      ready,
      activeProviderId: described.config?.providerId ?? described.provider?.id ?? null,
      activeProviderName: described.config?.providerName ?? described.provider?.name ?? null,
      protocol: described.config?.protocol ?? described.provider?.protocol ?? null,
      model,
      credentialState: described.config?.credentialState ?? described.provider?.credentialState ?? null,
      networkPermission,
      supportedProtocols,
      detail,
    };
  }

  async listModels(providerId?: string): Promise<AiModelListResult> {
    if (this.permissions.getState('network.request') !== 'granted') {
      this.activity.tryRecord({
        category: 'permission',
        severity: 'warning',
        action: 'ai.models.denied',
        outcome: 'denied',
        detail: 'network.request',
      });
      return {
        ok: false,
        providerId: providerId ?? '',
        models: [],
        error: permissionError(),
      };
    }

    let config;
    try {
      config = this.router.resolveConfig(providerId);
    } catch (error) {
      const aiError = error instanceof AiProviderError ? error.aiError : toAiError(error);
      this.activity.tryRecord({
        category: 'provider',
        severity: 'warning',
        action: 'ai.models.failed',
        outcome: 'failure',
        detail: aiError.code,
      });
      return { ok: false, providerId: providerId ?? '', models: [], error: aiError };
    }

    const attempt = createTimeoutSignal(new AbortController().signal, this.modelListTimeoutMs);
    try {
      const adapter = this.registry.get(config.protocol);
      const models = await adapter.listModels(
        {
          id: config.providerId,
          name: config.providerName,
          protocol: config.protocol,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        },
        attempt.signal,
      );

      this.activity.tryRecord({
        category: 'provider',
        severity: 'info',
        action: 'ai.models.listed',
        outcome: 'success',
        detail: `${config.providerName} · ${models.length} model(s)`,
      });

      return { ok: true, providerId: config.providerId, models, error: null };
    } catch (error) {
      const aiError = attempt.timedOut()
        ? createAiError('timeout', 'The provider did not answer the model request in time.', true)
        : error instanceof AiProviderError
          ? error.aiError
          : toAiError(error, 'The model list could not be read.');

      this.activity.tryRecord({
        category: 'provider',
        severity: 'warning',
        action: 'ai.models.failed',
        outcome: 'failure',
        detail: `${config.providerName} · ${aiError.code}`,
      });

      return { ok: false, providerId: config.providerId, models: [], error: aiError };
    } finally {
      attempt.cleanup();
    }
  }

  startStream(
    senderId: number,
    requestId: string,
    request: AiChatRequest,
    emit: Emit,
  ): AiStreamStartResult {
    if (this.streams.has(requestId)) {
      return {
        accepted: false,
        requestId,
        error: createAiError('busy', 'A stream with this identifier is already running.', false),
      };
    }

    let senderStreams = 0;
    for (const stream of this.streams.values()) {
      if (stream.senderId === senderId) {
        senderStreams += 1;
      }
    }
    if (senderStreams >= AI_LIMITS.maxConcurrentStreamsPerRenderer) {
      return {
        accepted: false,
        requestId,
        error: createAiError(
          'busy',
          'Too many AI streams are already running. Wait for one to finish.',
          false,
        ),
      };
    }

    if (request.messages.length === 0) {
      return {
        accepted: false,
        requestId,
        error: createAiError('invalid_request', 'Add at least one message before streaming.', false),
      };
    }

    if (this.permissions.getState('network.request') !== 'granted') {
      this.activity.tryRecord({
        category: 'permission',
        severity: 'warning',
        action: 'ai.request.denied',
        outcome: 'denied',
        detail: 'network.request',
      });
      return { accepted: false, requestId, error: permissionError() };
    }

    let resolved;
    try {
      resolved = this.router.resolve(request.model);
    } catch (error) {
      const aiError = error instanceof AiProviderError ? error.aiError : toAiError(error);
      this.activity.tryRecord({
        category: 'provider',
        severity: 'warning',
        action: 'ai.request.rejected',
        outcome: 'failure',
        detail: aiError.code,
      });
      return { accepted: false, requestId, error: aiError };
    }

    const stream: ActiveStream = {
      requestId,
      senderId,
      controller: new AbortController(),
      startedAt: this.now(),
      providerId: resolved.providerId,
      providerName: resolved.providerName,
      model: resolved.model,
      settled: false,
    };
    this.streams.set(requestId, stream);

    this.activity.tryRecord({
      category: 'provider',
      severity: 'info',
      action: 'ai.request.started',
      outcome: 'info',
      detail: `${resolved.providerName} · ${resolved.model} · ${request.messages.length} message(s)`,
    });

    this.emit(stream, {
      type: 'start',
      providerId: resolved.providerId,
      providerName: resolved.providerName,
      model: resolved.model,
      startedAt: stream.startedAt,
    }, emit);

    void this.run(stream, resolved, request, emit);
    return { accepted: true, requestId };
  }

  cancelStream(senderId: number, requestId: string): AiCancelResult {
    const stream = this.streams.get(requestId);
    if (!stream || stream.senderId !== senderId) {
      return { cancelled: false };
    }
    stream.controller.abort();
    return { cancelled: true };
  }

  cancelAll(senderId: number): void {
    for (const stream of this.streams.values()) {
      if (stream.senderId === senderId) {
        stream.controller.abort();
      }
    }
  }

  activeStreamCount(): number {
    return this.streams.size;
  }

  /** Abort every in-flight stream during application shutdown. */
  shutdown(): void {
    for (const stream of this.streams.values()) {
      stream.controller.abort();
    }
  }

  private async run(
    stream: ActiveStream,
    resolved: ResolvedAiProvider,
    request: AiChatRequest,
    emit: Emit,
  ): Promise<void> {
    let attempt = 0;
    let emittedContent = false;

    while (true) {
      attempt += 1;
      const attemptSignal = createTimeoutSignal(stream.controller.signal, this.timeoutMs);

      try {
        const adapter = this.registry.get(resolved.protocol);
        let finishReason: string | null = null;
        let usage: AiUsage | null = null;

        for await (const chunk of adapter.streamChat(
          {
            id: resolved.providerId,
            name: resolved.providerName,
            protocol: resolved.protocol,
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
          },
          {
            model: resolved.model,
            messages: request.messages,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            signal: attemptSignal.signal,
          },
        )) {
          if (chunk.type === 'delta') {
            emittedContent = true;
            this.emit(stream, { type: 'delta', text: chunk.text }, emit);
          } else {
            finishReason = chunk.finishReason;
            usage = chunk.usage;
          }
        }

        const durationMs = this.now() - stream.startedAt;
        this.activity.tryRecord({
          category: 'provider',
          severity: 'info',
          action: 'ai.request.completed',
          outcome: 'success',
          detail: `${resolved.providerName} · ${resolved.model} · ${durationMs}ms · ${finishReason ?? 'end'}`,
        });
        this.settle(
          stream,
          { type: 'done', finishReason, usage, durationMs },
          emit,
        );
        return;
      } catch (error) {
        const cancelled = stream.controller.signal.aborted;
        const aiError = attemptSignal.timedOut()
          ? createAiError('timeout', 'The provider did not respond in time.', true)
          : error instanceof AiProviderError
            ? error.aiError
            : toAiError(error);

        if (cancelled || aiError.code === 'aborted') {
          const durationMs = this.now() - stream.startedAt;
          this.activity.tryRecord({
            category: 'provider',
            severity: 'info',
            action: 'ai.request.cancelled',
            outcome: 'info',
            detail: `${resolved.providerName} · ${resolved.model} · ${durationMs}ms`,
          });
          this.settle(stream, { type: 'cancelled', durationMs }, emit);
          return;
        }

        if (shouldRetry(aiError, attempt, emittedContent, this.retryPolicy)) {
          const delay = retryDelayMs(attempt, this.retryPolicy);
          this.activity.tryRecord({
            category: 'provider',
            severity: 'warning',
            action: 'ai.request.retry',
            outcome: 'info',
            detail: `${resolved.providerName} · ${resolved.model} · ${aiError.code} · attempt ${attempt + 1} in ${delay}ms`,
          });
          const continued = await this.sleep(delay, stream.controller.signal);
          if (!continued) {
            const durationMs = this.now() - stream.startedAt;
            this.activity.tryRecord({
              category: 'provider',
              severity: 'info',
              action: 'ai.request.cancelled',
              outcome: 'info',
              detail: `${resolved.providerName} · ${resolved.model} · ${durationMs}ms`,
            });
            this.settle(stream, { type: 'cancelled', durationMs }, emit);
            return;
          }
          continue;
        }

        const durationMs = this.now() - stream.startedAt;
        this.activity.tryRecord({
          category: 'provider',
          severity: 'warning',
          action: 'ai.request.failed',
          outcome: 'failure',
          detail: `${resolved.providerName} · ${resolved.model} · ${aiError.code} · ${durationMs}ms`,
        });
        this.settle(stream, { type: 'error', error: aiError, durationMs }, emit);
        return;
      } finally {
        attemptSignal.cleanup();
      }
    }
  }

  private emit(stream: ActiveStream, event: AiStreamEvent, emit: Emit): void {
    if (stream.settled) {
      return;
    }
    this.send(stream.requestId, event, emit);
  }

  private settle(stream: ActiveStream, event: AiStreamEvent, emit: Emit): void {
    if (stream.settled) {
      return;
    }
    this.send(stream.requestId, event, emit);
    stream.settled = true;
    this.streams.delete(stream.requestId);
  }

  private send(requestId: string, event: AiStreamEvent, emit: Emit): void {
    try {
      emit({ requestId, event });
    } catch {
      // A destroyed renderer must not crash the stream runner.
    }
  }
}
