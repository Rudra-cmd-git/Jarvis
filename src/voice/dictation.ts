import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../store/app-context";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognition(): RecognitionConstructor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as RecognitionConstructor) ?? (w.webkitSpeechRecognition as RecognitionConstructor) ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

export interface DictationState {
  listening: boolean;
  transcribing: boolean;
  interim: string;
  error: string | null;
  mode: "web" | "whisper" | "none";
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

export function useDictation(onFinal: (text: string) => void): DictationState {
  const { settings, sttMode, setCoreState, setTask, refreshActivity } = useApp();
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const finalRef = useRef("");
  const cancelledRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const cleanup = useCallback(() => {
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      try {
        mediaRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setListening(false);
    setInterim("");
    setCoreState("idle");
    setTask("Standing by");
  }, [setCoreState, setTask]);

  const finishWeb = useCallback(() => {
    const text = finalRef.current.trim();
    cleanup();
    if (text && !cancelledRef.current) {
      onFinalRef.current(text);
    }
    finalRef.current = "";
  }, [cleanup]);

  const startWeb = useCallback(async () => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setError("This Windows WebView does not expose Web Speech recognition. Switch to a Whisper-compatible local server in Settings → Voice.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = settings?.voice.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    finalRef.current = "";
    cancelledRef.current = false;

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += transcript;
        else interimText += transcript;
      }
      setInterim(interimText || finalRef.current);
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";
      const message =
        code === "not-allowed" || code === "permission-denied"
          ? "Microphone permission was denied. Allow microphone access in Windows settings."
          : code === "no-speech"
            ? "No speech was detected. Try again."
            : code === "network"
              ? "The browser speech service is unreachable. Configure a Whisper server in Settings → Voice."
              : `Speech recognition error: ${code}`;
      setError(message);
      cancelledRef.current = true;
      cleanup();
    };
    recognition.onend = () => finishWeb();

    recognitionRef.current = recognition;
    setError(null);
    setInterim("");
    setCoreState("listening");
    setTask("Listening");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
      cleanup();
    }
  }, [cleanup, finishWeb, setCoreState, setTask, settings?.voice.language]);

  const startWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setListening(false);
        setInterim("");
        if (cancelledRef.current || blob.size < 1000) {
          cleanup();
          return;
        }
        setTranscribing(true);
        setCoreState("thinking");
        setTask("Transcribing speech");
        try {
          const base64 = await blobToBase64(blob);
          const text = await api.voiceTranscribe(base64, mime || "audio/webm");
          onFinalRef.current(text);
        } catch (e) {
          setError(String(e));
        } finally {
          setTranscribing(false);
          setCoreState("idle");
          setTask("Standing by");
          void refreshActivity();
        }
      };
      recorder.start();
      mediaRef.current = recorder;
      setError(null);
      setInterim("");
      setCoreState("listening");
      setTask("Listening");
      setListening(true);
      window.setTimeout(() => {
        if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      }, 60000);
    } catch (e) {
      const message =
        e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")
          ? "Microphone permission was denied. Allow microphone access in Windows settings."
          : "No microphone is available or it is in use.";
      setError(message);
      cleanup();
    }
  }, [cleanup, refreshActivity, setCoreState, setTask]);

  const start = useCallback(async () => {
    setError(null);
    if (sttMode === "none") {
      setError("No speech recognition is available. Configure Web Speech or a Whisper-compatible server.");
      return;
    }
    if (sttMode === "web") await startWeb();
    else await startWhisper();
  }, [sttMode, startWeb, startWhisper]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    finalRef.current = "";
    setError(null);
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      cleanup();
      return;
    }
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    cleanup();
  }, [cleanup]);

  useEffect(() => () => {
    cancelledRef.current = true;
    recognitionRef.current?.abort?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { listening, transcribing, interim, error, mode: sttMode, start, stop, cancel };
}
