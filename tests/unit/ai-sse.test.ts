import { describe, expect, it } from 'vitest';
import { SseDecoder } from '../../src/main/services/ai/sse';

function pushAll(decoder: SseDecoder, chunks: string[]): ReturnType<SseDecoder['push']> {
  return chunks.flatMap((chunk) => decoder.push(chunk));
}

describe('SseDecoder', () => {
  it('reassembles events split across arbitrary chunk boundaries', () => {
    const decoder = new SseDecoder();
    const events = pushAll(decoder, [
      'data: {"choices":[{"delta":{"',
      'content":"hello"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
    ]);

    expect(events.map((event) => event.data)).toEqual([
      '{"choices":[{"delta":{"content":"hello"}}]}',
      '{"choices":[{"delta":{"content":" world"}}]}',
    ]);
  });

  it('supports CRLF, comments, named events, ids and multi-line data', () => {
    const decoder = new SseDecoder();
    const events = pushAll(decoder, [
      ': keep-alive\r\n',
      'event: message\r\nid: 7\r\ndata: first\r\ndata: second\r\n\r\n',
    ]);

    expect(events).toEqual([{ event: 'message', data: 'first\nsecond', id: '7' }]);
  });

  it('flushes a trailing event that has no blank line', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: [DONE]\n')).toEqual([]);
    expect(decoder.flush()).toEqual([{ event: null, data: '[DONE]', id: null }]);
  });

  it('ignores unknown fields and empty data-only events', () => {
    const decoder = new SseDecoder();
    const events = pushAll(decoder, ['retry: 3000\n\n', 'data:\n\n', 'data: real\n\n']);

    expect(events).toEqual([{ event: null, data: 'real', id: null }]);
  });
});
