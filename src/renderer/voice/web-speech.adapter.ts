import type {
  SpeechRecognitionAdapter,
  SpeechRecognitionEvent,
  SpeechRecognitionStartOptions,
  VoiceError,
} from '../../shared/voice';
import { VOICE_LIMITS } from '../../shared/voice';

export interface SpeechResultAlternative {
  transcript?: string;
  confidence?: number;
}

export interface SpeechResult {
  isFinal: boolean;
  0?: SpeechResultAlternative;
  length: number;
}

export interface SpeechResultEvent {
  resultIndex?: number;
  results: ArrayLike<SpeechResult>;
}

export interface SpeechErrorEvent {
  error?: string;
  message?: string;
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionCtor = new () => RecognitionLike;

interface WebSpeechAdapterOptions {
  getConstructor?: () => RecognitionCtor | undefined;
  timeoutMs?: number;
  now?: () => number;
}

function browserRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
}

function mapRecognitionError(event: SpeechErrorEvent): VoiceError {
  switch (event.error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code: 'permission_denied',
        message: 'Microphone or speech service access was denied.',
        retryable: true,
      };
    case 'no-speech':
      return {
        code: 'no_speech',
        message: 'No speech was detected. Hold the microphone and try again.',
        retryable: true,
      };
    case 'network':
      return {
        code: 'network',
        message: 'The speech service could not be reached. Check your connection.',
        retryable: true,
      };
    case 'aborted':
      return {
        code: 'aborted',
        message: 'Listening was cancelled.',
        retryable: false,
      };
    case 'audio-capture':
      return {
        code: 'no_microphone',
        message: 'No microphone was found or it is unavailable.',
        retryable: false,
      };
    default:
      return {
        code: 'unknown',
        message: event.message || 'Speech recognition failed.',
        retryable: true,
      };
  }
}

/**
 * Chromium Web Speech adapter. It may send audio to an external recognition
 * service; the UI discloses this. The shared adapter contract allows a local
 * engine to replace it without changing the voice session layer.
 */
export class WebSpeechRecognitionAdapter implements SpeechRecognitionAdapter {
  readonly id = 'web-speech';
  readonly label = 'Chromium Web Speech';
  readonly requiresNetwork = true;

  private readonly getConstructor: () => RecognitionCtor | undefined;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private current: RecognitionLike | null = null;
  private onEvent: ((event: SpeechRecognitionEvent) => void) | null = null;
  private sawFinal = false;
  private errorEmitted = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebSpeechAdapterOptions = {}) {
    this.getConstructor = options.getConstructor ?? browserRecognitionCtor;
    this.timeoutMs = options.timeoutMs ?? VOICE_LIMITS.sessionTimeoutMs;
    this.now = options.now ?? Date.now;
  }

  isSupported(): boolean {
    return typeof this.getConstructor() === 'function';
  }

  start(options: SpeechRecognitionStartOptions): void {
    const constructor = this.getConstructor();
    if (typeof constructor !== 'function') {
      options.onEvent({
        type: 'error',
        error: {
          code: 'unsupported',
          message: 'Speech recognition is not available in this browser.',
          retryable: false,
        },
      });
      options.onEvent({ type: 'end' });
      return;
    }

    this.cleanup();
    this.onEvent = options.onEvent;

    const recognition = new constructor();
    this.current = recognition;
    recognition.lang = options.language;
    recognition.continuous = false;
    recognition.interimResults = options.interimResults;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => this.emit({ type: 'ready' });
    recognition.onaudiostart = () => this.emit({ type: 'audio-start' });
    recognition.onsoundstart = () => this.emit({ type: 'sound-start' });
    recognition.onresult = (event) => {
      const first = event.resultIndex ?? 0;
      for (let index = first; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result[0];
        const text = alternative?.transcript?.trim();
        if (!text) {
          continue;
        }
        const final = Boolean(result.isFinal);
        if (final) {
          this.sawFinal = true;
        }
        this.emit({
          type: 'transcript',
          transcript: {
            text,
            final,
            confidence: typeof alternative?.confidence === 'number' ? alternative.confidence : null,
            timestamp: this.now(),
          },
        });
      }
    };
    recognition.onerror = (event) => {
      this.errorEmitted = true;
      this.emit({ type: 'error', error: mapRecognitionError(event) });
    };
    recognition.onend = () => {
      this.clearTimeout();
      this.emit({ type: 'end' });
      this.cleanup();
    };

    try {
      recognition.start();
    } catch (cause) {
      this.errorEmitted = true;
      this.emit({
        type: 'error',
        error: {
          code: 'unknown',
          message: cause instanceof Error ? cause.message : 'Listening could not start.',
          retryable: true,
        },
      });
      return;
    }

    this.timeoutId = setTimeout(() => {
      if (this.sawFinal || this.errorEmitted) {
        return;
      }
      this.errorEmitted = true;
      this.emit({
        type: 'error',
        error: {
          code: 'timeout',
          message: 'No speech was detected in time. Try again.',
          retryable: true,
        },
      });
      try {
        recognition.abort();
      } catch {
        // The recognition may already have ended.
      }
    }, this.timeoutMs);
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      // The recognition may already have ended.
    }
  }

  abort(): void {
    this.errorEmitted = true;
    this.clearTimeout();
    try {
      this.current?.abort();
    } catch {
      // The recognition may already have ended.
    }
  }

  private emit(event: SpeechRecognitionEvent): void {
    try {
      this.onEvent?.(event);
    } catch {
      // A listener failure must not leave the microphone active.
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private cleanup(): void {
    this.clearTimeout();
    this.current = null;
    this.onEvent = null;
    this.sawFinal = false;
    this.errorEmitted = false;
  }
}
