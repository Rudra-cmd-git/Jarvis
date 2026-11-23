import { describe, expect, it, vi } from 'vitest';
import type { AiProviderConfig, AiProviderChunk, AiProviderStreamOptions } from '../../src/shared/ai';
import { OpenAiCompatibleProvider } from '../../src/main/services/ai/openai-compatible.provider';

const config: AiProviderConfig = {
  id: 'stub',
  name: 'Stub Provider',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.test/v1/',
  apiKey: 'sk-dummy-key-123456',
};

function streamOptions(signal: AbortSignal): AiProviderStreamOptions {
  return {
    model: 'test-model',
    messages: [{ role: 'user', content: 'hello' }],
    signal,
  };
}

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(
  provider: OpenAiCompatibleProvider,
  options: AiProviderStreamOptions,
): Promise<AiProviderChunk[]> {
  const chunks: AiProviderChunk[] = [];
  for await (const chunk of provider.streamChat(config, options)) {
    chunks.push(chunk);
  }
  return chunks;
}

function headersOf(call: unknown): Record<string, string> {
  const args = call as [string, RequestInit];
  return args[1].headers as Record<string, string>;
}

function bodyOf(call: unknown): Record<string, unknown> {
  const args = call as [string, RequestInit];
  return JSON.parse(args[1].body as string) as Record<string, unknown>;
}

describe('OpenAiCompatibleProvider', () => {
  it('streams deltas, finish reason and usage through SSE', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[],"finish_reason":"stop","usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const provider = new OpenAiCompatibleProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const chunks = await collect(provider, streamOptions(new AbortController().signal));

    expect(chunks.filter((chunk) => chunk.type === 'delta')).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
    ]);
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      'https://api.test/v1/chat/completions',
    );
    expect(headersOf(fetchImpl.mock.calls[0])).toMatchObject({
      Authorization: 'Bearer sk-dummy-key-123456',
      Accept: 'text/event-stream',
    });
    expect(bodyOf(fetchImpl.mock.calls[0])).toMatchObject({
      model: 'test-model',
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('normalizes HTTP failures without exposing provider response bodies', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"error":{"message":"sk-secret-from-provider"}}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new OpenAiCompatibleProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(collect(provider, streamOptions(new AbortController().signal))).rejects.toMatchObject({
      aiError: { code: 'http_error', retryable: false },
    });
  });

  it('marks rate limits as retryable and malformed frames as invalid responses', async () => {
    const limited = new OpenAiCompatibleProvider({
      fetchImpl: (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(collect(limited, streamOptions(new AbortController().signal))).rejects.toMatchObject({
      aiError: { code: 'rate_limited', retryable: true },
    });

    const malformed = new OpenAiCompatibleProvider({
      fetchImpl: (async () => sseResponse(['data: not-json\n\n'])) as unknown as typeof fetch,
    });
    await expect(collect(malformed, streamOptions(new AbortController().signal))).rejects.toMatchObject({
      aiError: { code: 'invalid_response', retryable: false },
    });
  });

  it('maps cancellation to a normalized aborted error', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
          );
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              streamController.error(error);
            },
            { once: true },
          );
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const provider = new OpenAiCompatibleProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const iterator = provider
      .streamChat(config, streamOptions(controller.signal))
      [Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: 'delta', text: 'partial' });
    controller.abort();

    await expect(iterator.next()).rejects.toMatchObject({ aiError: { code: 'aborted' } });
  });

  it('lists models from the OpenAI-compatible endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new OpenAiCompatibleProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const models = await provider.listModels(config, new AbortController().signal);

    expect(models).toEqual(['a-model', 'z-model']);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      'https://api.test/v1/models',
    );
  });

  it('omits authorization and OpenAI-only fields for local Ollama providers', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n']));
    const provider = new OpenAiCompatibleProvider({
      protocol: 'ollama',
      includeAuth: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await collect(provider, streamOptions(new AbortController().signal));

    expect(headersOf(fetchImpl.mock.calls[0]).Authorization).toBeUndefined();
    expect(bodyOf(fetchImpl.mock.calls[0]).stream_options).toBeUndefined();
  });
});
