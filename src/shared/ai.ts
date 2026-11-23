import type { ProviderProtocol } from './providers';

export type AiChatRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  /** Optional override; otherwise the active provider's default model is used. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type AiErrorCode =
  | 'permission_denied'
  | 'provider_missing'
  | 'provider_disabled'
  | 'model_missing'
  | 'credential_unavailable'
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'rate_limited'
  | 'invalid_response'
  | 'aborted'
  | 'busy'
  | 'invalid_request'
  | 'unsupported_protocol'
  | 'unknown';

/**
 * A normalized error safe to return to the renderer. Messages must never
 * contain credentials, request bodies, or raw provider responses.
 */
export interface AiError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
}

export interface AiStreamStartEvent {
  type: 'start';
  providerId: string;
  providerName: string;
  model: string;
  startedAt: number;
}

export interface AiStreamDeltaEvent {
  type: 'delta';
  text: string;
}

export interface AiStreamDoneEvent {
  type: 'done';
  finishReason: string | null;
  usage: AiUsage | null;
  durationMs: number;
}

export interface AiStreamErrorEvent {
  type: 'error';
  error: AiError;
  durationMs: number;
}

export interface AiStreamCancelledEvent {
  type: 'cancelled';
  durationMs: number;
}

export type AiStreamEvent =
  | AiStreamStartEvent
  | AiStreamDeltaEvent
  | AiStreamDoneEvent
  | AiStreamErrorEvent
  | AiStreamCancelledEvent;

export interface AiStreamEventPayload {
  requestId: string;
  event: AiStreamEvent;
}

export interface AiStreamStartResult {
  accepted: boolean;
  requestId: string;
  error?: AiError;
}

export interface AiCancelResult {
  cancelled: boolean;
}

export interface AiModelListResult {
  ok: boolean;
  providerId: string;
  models: string[];
  error: AiError | null;
}

export interface AiStatus {
  ready: boolean;
  activeProviderId: string | null;
  activeProviderName: string | null;
  protocol: ProviderProtocol | null;
  model: string | null;
  credentialState: 'configured' | 'missing' | 'error' | null;
  networkPermission: 'granted' | 'denied' | 'unset';
  supportedProtocols: ProviderProtocol[];
  detail: string;
}

/** Main-process provider contract. Renderer code must never import this at runtime. */
export interface AiProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string | null;
}

export interface AiProviderStreamOptions {
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal: AbortSignal;
}

export type AiProviderChunk =
  | { type: 'delta'; text: string }
  | { type: 'finish'; finishReason: string | null; usage: AiUsage | null };

export interface AiProvider {
  readonly protocol: ProviderProtocol;
  streamChat(
    config: AiProviderConfig,
    options: AiProviderStreamOptions,
  ): AsyncIterable<AiProviderChunk>;
  listModels(config: AiProviderConfig, signal: AbortSignal): Promise<string[]>;
}

export const AI_LIMITS = {
  maxMessages: 100,
  maxContentLength: 100_000,
  maxModelLength: 120,
  maxRequestIdLength: 80,
  maxConcurrentStreamsPerRenderer: 4,
} as const;

export const AI_CHAT_ROLES: readonly AiChatRole[] = ['system', 'user', 'assistant'];

export const AI_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function aiErrorMessage(error: AiError): string {
  return `${error.message}${error.retryable ? ' You can retry.' : ''}`;
}
