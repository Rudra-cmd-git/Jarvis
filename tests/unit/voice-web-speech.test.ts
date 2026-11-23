import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechRecognitionEvent } from '../../src/shared/voice';
import {
  WebSpeechRecognitionAdapter,
  type RecognitionCtor,
  type RecognitionLike,
  type SpeechErrorEvent,
  type SpeechResultEvent,
} from '../../src/renderer/voice/web-speech.adapter';

class FakeRecognition implements RecognitionLike {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onsoundstart: (() => void) | null = null;
  onresult: ((event: SpeechResultEvent) => void) | null = null;
  onerror: ((event: SpeechErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => undefined);
  stop = vi.fn(() => undefined);
  abort = vi.fn(() => undefined);

  constructor() {
    FakeRecognition.instances.push(this);
  }

  emitResult(resultIndex: number, results: Array<{ transcript: string; final: boolean; confidence?: number }>): void {
    this.onresult?.({
      resultIndex,
      results: results.map((entry) => ({
        isFinal: entry.final,
        0: { transcript: entry.transcript, confidence: entry.confidence ?? 0.9 },
        length: 1,
      })),
    });
  }

  emitError(error: string): void {
    this.onerror?.({ error });
  }

  emitEnd(): void {
    this.onend?.();
  }
}

function ctor(): RecognitionCtor {
  return FakeRecognition as unknown as RecognitionCtor;
}

function makeAdapter(timeoutMs = 10_000): {
  adapter: WebSpeechRecognitionAdapter;
  events: SpeechRecognitionEvent[];
} {
  const events: SpeechRecognitionEvent[] = [];
  const adapter = new WebSpeechRecognitionAdapter({
    getConstructor: () => ctor(),
    timeoutMs,
  });
  return { adapter, events };
}

beforeEach(() => {
  FakeRecognition.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WebSpeechRecognitionAdapter', () => {
  it('reports unsupported browsers without touching a microphone', () => {
    const events: SpeechRecognitionEvent[] = [];
    const adapter = new WebSpeechRecognitionAdapter({ getConstructor: () => undefined });

    expect(adapter.isSupported()).toBe(false);
    adapter.start({
      language: 'en-US',
      interimResults: true,
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual(['error', 'end']);
    expect(events[0]).toMatchObject({ error: { code: 'unsupported' } });
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('emits ready, interim and final transcripts in order', () => {
    const { adapter, events } = makeAdapter();
    adapter.start({ language: 'en-US', interimResults: true, onEvent: (e) => events.push(e) });
    const recognition = FakeRecognition.instances[0];

    recognition.onstart?.();
    recognition.onaudiostart?.();
    recognition.emitResult(0, [{ transcript: 'hello', final: false }]);
    recognition.emitResult(0, [{ transcript: 'hello world', final: true, confidence: 0.95 }]);
    recognition.emitEnd();

    expect(events.map((event) => event.type)).toEqual([
      'ready',
      'audio-start',
      'transcript',
      'transcript',
      'end',
    ]);
    expect(events[2]).toMatchObject({
      transcript: { text: 'hello', final: false },
    });
    expect(events[3]).toMatchObject({
      transcript: { text: 'hello world', final: true, confidence: 0.95 },
    });
    expect(recognition.lang).toBe('en-US');
    expect(recognition.interimResults).toBe(true);
  });

  it('normalizes network and microphone errors', () => {
    const network = makeAdapter();
    network.adapter.start({
      language: 'en-US',
      interimResults: false,
      onEvent: (e) => network.events.push(e),
    });
    FakeRecognition.instances[0].emitError('network');
    expect(network.events.at(-1)).toMatchObject({ error: { code: 'network', retryable: true } });

    const microphone = makeAdapter();
    microphone.adapter.start({
      language: 'en-US',
      interimResults: false,
      onEvent: (e) => microphone.events.push(e),
    });
    FakeRecognition.instances[1].emitError('audio-capture');
    expect(microphone.events.at(-1)).toMatchObject({ error: { code: 'no_microphone' } });
  });

  it('aborts without emitting a timeout error', () => {
    vi.useFakeTimers();
    const { adapter, events } = makeAdapter(20);
    adapter.start({ language: 'en-US', interimResults: false, onEvent: (e) => events.push(e) });
    const recognition = FakeRecognition.instances[0];

    adapter.abort();
    vi.advanceTimersByTime(100);

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'error' && event.error.code === 'timeout')).toBe(false);
  });

  it('times out when no final transcript arrives', () => {
    vi.useFakeTimers();
    const { adapter, events } = makeAdapter(20);
    adapter.start({ language: 'en-US', interimResults: false, onEvent: (e) => events.push(e) });

    vi.advanceTimersByTime(25);

    expect(events.some((event) => event.type === 'error' && event.error.code === 'timeout')).toBe(true);
    expect(FakeRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
  });

  it('stops the underlying recognition on request', () => {
    const { adapter } = makeAdapter();
    adapter.start({ language: 'en-US', interimResults: false, onEvent: () => undefined });
    adapter.stop();
    expect(FakeRecognition.instances[0].stop).toHaveBeenCalledTimes(1);
  });
});
