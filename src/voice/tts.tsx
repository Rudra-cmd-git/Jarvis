import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../store/app-context";

interface TtsValue {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  voices: SpeechSynthesisVoice[];
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

const TtsContext = createContext<TtsValue | null>(null);

export function TtsProvider({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !settings?.voice.ttsEnabled) return;
      const clean = text
        .replace(/```[\s\S]*?```/g, " code block ")
        .replace(/[#*_`>]/g, "")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .slice(0, 6000)
        .trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const cfg = settings.voice;
      const chosen =
        voices.find((v) => v.name === cfg.voice) ??
        voices.find((v) => v.lang === cfg.language) ??
        null;
      if (chosen) utterance.voice = chosen;
      utterance.rate = cfg.rate;
      utterance.pitch = cfg.pitch;
      utterance.lang = cfg.language;
      utterance.onstart = () => {
        setSpeaking(true);
        setPaused(false);
      };
      utterance.onend = () => {
        setSpeaking(false);
        setPaused(false);
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setPaused(false);
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [settings, supported, voices],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const value = useMemo(
    () => ({ supported, speaking, paused, voices, speak, stop, pause, resume }),
    [supported, speaking, paused, voices, speak, stop, pause, resume],
  );

  return <TtsContext.Provider value={value}>{children}</TtsContext.Provider>;
}

export function useTts(): TtsValue {
  const ctx = useContext(TtsContext);
  if (!ctx) throw new Error("useTts must be used inside TtsProvider");
  return ctx;
}
