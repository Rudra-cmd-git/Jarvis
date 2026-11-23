import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  SpeechRecognitionEvent,
  VoiceError,
  VoiceMode,
  VoiceSessionState,
  VoiceStatus,
} from '../../shared/voice';
import { VOICE_LIMITS } from '../../shared/voice';
import { WebSpeechRecognitionAdapter } from '../voice/web-speech.adapter';
import { useCore } from './core-context';

interface VoiceState {
  adapterId: string;
  adapterLabel: string;
  adapterAvailable: boolean;
  adapterRequiresNetwork: boolean;
  permission: 'granted' | 'denied' | 'unset';
  status: VoiceStatus | null;
  state: VoiceSessionState;
  listening: boolean;
  processing: boolean;
  preview: string;
  pendingTranscript: string;
  error: VoiceError | null;
  mode: VoiceMode;
  language: string;
  pushToTalkKey: string;
  interimResults: boolean;
  grantPermission: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  retry: () => Promise<void>;
  consumePendingTranscript: () => string;
  setMode: (mode: VoiceMode) => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  setPushToTalkKey: (key: string) => Promise<void>;
  setInterimResults: (enabled: boolean) => Promise<void>;
}

const VoiceContext = createContext<VoiceState | null>(null);

function newSessionId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  return `voice${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { settings, permissions, updateSetting, setPermission } = useCore();
  const adapter = useMemo(() => new WebSpeechRecognitionAdapter(), []);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [preview, setPreview] = useState('');
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const sessionId = useRef<string | null>(null);
  const finalText = useRef('');
  const outcome = useRef<'completed' | 'cancelled' | 'failed'>('completed');

  const permission =
    permissions?.permissions.find((entry) => entry.capability === 'microphone.record')?.state ??
    status?.permission ??
    'unset';

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await window.jarvis.getVoiceStatus());
    } catch {
      // Permission state remains available from the core context.
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, permissions]);

  const finish = useCallback((nextOutcome?: 'completed' | 'cancelled' | 'failed') => {
    const id = sessionId.current;
    if (!id) {
      return;
    }
    sessionId.current = null;
    const result = nextOutcome ?? outcome.current;
    void window.jarvis
      .endVoiceSession(id, result, finalText.current.length)
      .catch(() => undefined);
    setState(result === 'failed' ? 'error' : 'idle');
  }, []);

  const handleEvent = useCallback(
    (event: SpeechRecognitionEvent) => {
      if (event.type === 'ready' || event.type === 'audio-start' || event.type === 'sound-start') {
        return;
      }
      if (event.type === 'transcript') {
        const transcript = event.transcript;
        if (!transcript.text) {
          return;
        }
        if (transcript.final) {
          finalText.current = `${finalText.current} ${transcript.text}`.trim();
          setPendingTranscript(finalText.current.slice(0, VOICE_LIMITS.maxTranscriptLength));
          setPreview(finalText.current);
        } else {
          setPreview(
            `${finalText.current} ${transcript.text}`.trim().slice(0, VOICE_LIMITS.maxTranscriptLength),
          );
        }
        return;
      }
      if (event.type === 'error') {
        setError(event.error);
        outcome.current = 'failed';
        setState('error');
        return;
      }
      if (event.type === 'end') {
        finish();
      }
    },
    [adapter, finish],
  );

  const start = useCallback(async () => {
    if (sessionId.current) {
      return;
    }
    if (permission !== 'granted') {
      setError({
        code: 'permission_denied',
        message: 'Grant microphone permission before using voice input.',
        retryable: true,
      });
      setState('permission-needed');
      return;
    }
    if (!adapter.isSupported()) {
      setError({
        code: 'unsupported',
        message: 'Speech recognition is not supported by this browser.',
        retryable: false,
      });
      setState('error');
      return;
    }

    const id = newSessionId();
    const started = await window.jarvis.startVoiceSession(
      id,
      adapter.id,
      settings['voice.language'],
    );
    if (!started.accepted) {
      setError(started.error ?? null);
      setState('permission-needed');
      return;
    }

    sessionId.current = id;
    finalText.current = '';
    outcome.current = 'completed';
    setError(null);
    setPreview('');
    setPendingTranscript('');
    setState('listening');

    adapter.start({
      language: settings['voice.language'],
      interimResults: settings['voice.interimResults'],
      onEvent: handleEvent,
    });
  }, [adapter, handleEvent, permission, settings]);

  const stop = useCallback(() => {
    if (!sessionId.current) {
      return;
    }
    setState('processing');
    adapter.stop();
  }, [adapter]);

  const cancel = useCallback(() => {
    if (!sessionId.current) {
      return;
    }
    outcome.current = 'cancelled';
    adapter.abort();
    finish('cancelled');
    setPreview('');
  }, [adapter, finish]);

  const retry = useCallback(async () => {
    setError(null);
    setState('idle');
    await start();
  }, [start]);

  const grantPermission = useCallback(async () => {
    await setPermission('microphone.record', 'grant');
    await refreshStatus();
  }, [refreshStatus, setPermission]);

  const consumePendingTranscript = useCallback(() => {
    const text = pendingTranscript;
    setPendingTranscript('');
    return text;
  }, [pendingTranscript]);

  const setMode = useCallback(
    async (mode: VoiceMode) => updateSetting('voice.mode', mode),
    [updateSetting],
  );
  const setLanguage = useCallback(
    async (language: string) => updateSetting('voice.language', language),
    [updateSetting],
  );
  const setPushToTalkKey = useCallback(
    async (key: string) => updateSetting('voice.pushToTalkKey', key),
    [updateSetting],
  );
  const setInterimResults = useCallback(
    async (enabled: boolean) => updateSetting('voice.interimResults', enabled),
    [updateSetting],
  );

  useEffect(() => {
    const stopOnBlur = (): void => {
      if (sessionId.current) {
        cancel();
      }
    };
    window.addEventListener('blur', stopOnBlur);
    const onVisibility = (): void => {
      if (document.hidden) {
        stopOnBlur();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', stopOnBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cancel]);

  const value = useMemo<VoiceState>(
    () => ({
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      adapterAvailable: adapter.isSupported(),
      adapterRequiresNetwork: adapter.requiresNetwork,
      permission,
      status,
      state,
      listening: state === 'listening',
      processing: state === 'processing',
      preview,
      pendingTranscript,
      error,
      mode: settings['voice.mode'],
      language: settings['voice.language'],
      pushToTalkKey: settings['voice.pushToTalkKey'],
      interimResults: settings['voice.interimResults'],
      grantPermission,
      start,
      stop,
      cancel,
      retry,
      consumePendingTranscript,
      setMode,
      setLanguage,
      setPushToTalkKey,
      setInterimResults,
    }),
    [
      adapter,
      permission,
      status,
      state,
      preview,
      pendingTranscript,
      error,
      settings,
      grantPermission,
      start,
      stop,
      cancel,
      retry,
      consumePendingTranscript,
      setMode,
      setLanguage,
      setPushToTalkKey,
      setInterimResults,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceState {
  const value = useContext(VoiceContext);
  if (!value) {
    throw new Error('useVoice must be used inside VoiceProvider');
  }
  return value;
}
