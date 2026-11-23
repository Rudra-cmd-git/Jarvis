import type {
  AiProvider,
  AiProviderChunk,
  AiProviderConfig,
  AiProviderStreamOptions,
  AiUsage,
} from '../../../shared/ai';
import type { ProviderProtocol } from '../../../shared/providers';
import { AiProviderError, createAiError, httpStatusError } from './ai-errors';
import { SseDecoder } from './sse';

interface OpenAiCompatibleOptions {
  protocol?: ProviderProtocol;
  includeAuth?: boolean;
  fetchImpl?: typeof fetch;
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
  /** A few compatible servers put the finish reason at the top level. */
  finish_reason?: unknown;
  error?: {
    message?: unknown;
  };
}

interface ParsedStreamData {
  done: boolean;
  text: string;
  finishReason: string | null;
  usage: AiUsage | null;
}

function endpoint(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (typeof part === 'object' && part !== null) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapUsage(usage: OpenAiStreamChunk['usage']): AiUsage | null {
  if (!usage) {
    return null;
  }
  return {
    promptTokens: numberOrNull(usage.prompt_tokens),
    completionTokens: numberOrNull(usage.completion_tokens),
    totalTokens: numberOrNull(usage.total_tokens),
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly protocol: ProviderProtocol;
  private readonly includeAuth: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleOptions = {}) {
    this.protocol = options.protocol ?? 'openai-compatible';
    this.includeAuth = options.includeAuth ?? true;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(config: AiProviderConfig, stream: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json',
    };
    if (this.includeAuth && config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  private parseStreamData(data: string): ParsedStreamData {
    const trimmed = data.trim();
    if (!trimmed) {
      return { done: false, text: '', finishReason: null, usage: null };
    }
    if (trimmed === '[DONE]') {
      return { done: true, text: '', finishReason: null, usage: null };
    }

    let chunk: OpenAiStreamChunk;
    try {
      chunk = JSON.parse(trimmed) as OpenAiStreamChunk;
    } catch {
      throw new AiProviderError(
        createAiError('invalid_response', 'The provider sent a malformed stream event.', false),
      );
    }

    if (chunk.error) {
      const message =
        typeof chunk.error.message === 'string' && chunk.error.message.trim()
          ? `The provider reported an error: ${chunk.error.message}`
          : 'The provider reported an error while streaming.';
      throw new AiProviderError(createAiError('http_error', message, false));
    }

    const choice = chunk.choices?.[0];
    return {
      done: false,
      // Streaming responses use `delta`; a few compatible servers answer the
      // stream request with one non-streaming `message` payload instead.
      text: contentText(choice?.delta?.content ?? choice?.message?.content),
      finishReason:
        typeof choice?.finish_reason === 'string' && choice.finish_reason
          ? choice.finish_reason
          : typeof chunk.finish_reason === 'string' && chunk.finish_reason
            ? chunk.finish_reason
            : null,
      usage: mapUsage(chunk.usage),
    };
  }

  async *streamChat(
    config: AiProviderConfig,
    options: AiProviderStreamOptions,
  ): AsyncIterable<AiProviderChunk> {
    const body: Record<string, unknown> = {
      model: options.model,
      stream: true,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    };
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (this.protocol === 'openai-compatible') {
      // Ollama's compatibility layer does not implement every OpenAI-only
      // field, so only request usage from full OpenAI-compatible endpoints.
      body.stream_options = { include_usage: true };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint(config.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: this.headers(config, true),
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      if (isAbortError(error) || options.signal.aborted) {
        throw new AiProviderError(createAiError('aborted', 'The request was cancelled.', false));
      }
      throw new AiProviderError(
        createAiError('network_error', 'The provider could not be reached.', true),
      );
    }

    if (!response.ok) {
      throw new AiProviderError(httpStatusError(response.status));
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      // Some compatible servers ignore `stream: true` and answer with JSON.
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError(
          createAiError('invalid_response', 'The provider returned unreadable JSON.', false),
        );
      }
      const parsed = this.parseStreamData(JSON.stringify(payload));
      if (parsed.text) {
        yield { type: 'delta', text: parsed.text };
      }
      yield {
        type: 'finish',
        finishReason: parsed.finishReason,
        usage: parsed.usage,
      };
      return;
    }

    if (!response.body) {
      throw new AiProviderError(
        createAiError('invalid_response', 'The provider returned an empty stream.', false),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseDecoder();
    let finishReason: string | null = null;
    let usage: AiUsage | null = null;
    let finished = false;

    const handleData = (data: string): string => {
      const parsed = this.parseStreamData(data);
      if (parsed.done) {
        finished = true;
        return '';
      }
      if (parsed.finishReason) {
        finishReason = parsed.finishReason;
      }
      usage = parsed.usage ?? usage;
      return parsed.text;
    };

    try {
      while (!finished) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        for (const event of sse.push(decoder.decode(result.value, { stream: true }))) {
          const text = handleData(event.data);
          if (text) {
            yield { type: 'delta', text };
          }
          if (finished) {
            break;
          }
        }
      }

      if (!finished) {
        const trailing = [...sse.push(decoder.decode()), ...sse.flush()];
        for (const event of trailing) {
          const text = handleData(event.data);
          if (text) {
            yield { type: 'delta', text };
          }
          if (finished) {
            break;
          }
        }
      }

      yield { type: 'finish', finishReason, usage };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      if (isAbortError(error) || options.signal.aborted) {
        throw new AiProviderError(createAiError('aborted', 'The request was cancelled.', false));
      }
      throw new AiProviderError(
        createAiError('network_error', 'The provider stream ended unexpectedly.', true),
      );
    } finally {
      if (!finished) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed or aborted.
        }
      }
      reader.releaseLock();
    }
  }

  async listModels(config: AiProviderConfig, signal: AbortSignal): Promise<string[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint(config.baseUrl, 'models'), {
        method: 'GET',
        headers: this.headers(config, false),
        signal,
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw new AiProviderError(createAiError('aborted', 'The request was cancelled.', false));
      }
      throw new AiProviderError(
        createAiError('network_error', 'The provider could not be reached.', true),
      );
    }

    if (!response.ok) {
      throw new AiProviderError(httpStatusError(response.status));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiProviderError(
        createAiError('invalid_response', 'The provider returned unreadable JSON.', false),
      );
    }

    const record =
      typeof payload === 'object' && payload !== null
        ? (payload as { data?: unknown; models?: unknown })
        : {};

    const ids = new Set<string>();
    const collect = (entries: unknown): void => {
      if (!Array.isArray(entries)) {
        return;
      }
      for (const entry of entries) {
        if (typeof entry === 'string' && entry.trim()) {
          ids.add(entry.trim());
        } else if (typeof entry === 'object' && entry !== null) {
          const id = (entry as { id?: unknown; name?: unknown }).id;
          const name = (entry as { name?: unknown }).name;
          if (typeof id === 'string' && id.trim()) {
            ids.add(id.trim());
          } else if (typeof name === 'string' && name.trim()) {
            ids.add(name.trim());
          }
        }
      }
    };

    collect(record.data);
    collect(record.models);

    return [...ids].sort((left, right) => left.localeCompare(right));
  }
}
