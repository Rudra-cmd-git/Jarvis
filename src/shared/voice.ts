export type VoiceMode = 'text' | 'voice';

export type VoiceSessionState =
  | 'idle'
  | 'permission-needed'
  | 'listening'
  | 'processing'
  | 'error';

export type VoiceErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'no_microphone'
  | 'network'
  | 'no_speech'
  | 'aborted'
  | 'timeout'
  | 'unknown';

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
  retryable: boolean;
}

export interface VoiceTranscript {
  text: string;
  final: boolean;
  confidence: number | null;
  timestamp: number;
}

export type SpeechRecognitionEvent =
  | { type: 'ready' }
  | { type: 'audio-start' }
  | { type: 'sound-start' }
  | { type: 'transcript'; transcript: VoiceTranscript }
  | { type: 'error'; error: VoiceError }
  | { type: 'end' };

export interface SpeechRecognitionStartOptions {
  language: string;
  interimResults: boolean;
  onEvent: (event: SpeechRecognitionEvent) => void;
}

/**
 * Replaceable speech-to-text boundary. The first implementation uses Chromium
 * Web Speech; a local engine can later implement the same contract.
 */
export interface SpeechRecognitionAdapter {
  readonly id: string;
  readonly label: string;
  readonly requiresNetwork: boolean;
  isSupported(): boolean;
  start(options: SpeechRecognitionStartOptions): void;
  stop(): void;
  abort(): void;
}

export interface VoiceSessionStartResult {
  accepted: boolean;
  sessionId: string;
  error?: VoiceError;
}

export interface VoiceSessionEndResult {
  ended: boolean;
  durationMs: number;
}

export interface VoiceStatus {
  permission: 'granted' | 'denied' | 'unset';
  activeSessions: number;
}

export const VOICE_LIMITS = {
  maxTranscriptLength: 2_000,
  sessionTimeoutMs: 12_000,
  maxSessionIdLength: 80,
} as const;

export const VOICE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export const VOICE_LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;

export const VOICE_KEY_PATTERN = /^[A-Za-z0-9]{1,24}$/;

export const VOICE_MODES: readonly VoiceMode[] = ['text', 'voice'];
