import { ArrowUp, Command, Mic, MicOff, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { useApp } from "../../store/app-context";
import { useDictation } from "../../voice/dictation";
import { cn } from "../../lib/utils";

export function CommandBar({ placeholder = "Give JARVIS an instruction…" }: { placeholder?: string }) {
  const { setView, setHandoffPrompt } = useApp();
  const { push } = useToast();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const dictation = useDictation((text) => {
    setValue((prev) => (prev ? `${prev} ${text}` : text));
    push("Transcript ready — review before sending.", "info");
    inputRef.current?.focus();
  });

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setHandoffPrompt(text);
    setValue("");
    setView("chat");
  };

  return (
    <div className="space-y-1.5">
      <div className="panel flex items-center gap-2 rounded-xl px-2.5 py-2 focus-within:border-[var(--accent-line)]">
        <Command size={15} className="ml-1 shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={dictation.listening ? dictation.interim || value : value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={dictation.listening ? "Listening…" : placeholder}
          aria-label="Command input"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          disabled={dictation.listening}
        />
        <button
          type="button"
          onClick={() => (dictation.listening ? dictation.stop() : void dictation.start())}
          aria-label={dictation.listening ? "Stop listening" : "Push to talk"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-ring",
            dictation.listening
              ? "border-amber/50 bg-amber/15 text-amber"
              : "border-line text-muted hover:border-[var(--accent-line)] hover:text-[var(--accent)]",
          )}
        >
          {dictation.listening ? <Square size={13} /> : <Mic size={15} />}
        </button>
        <Button size="icon" variant="primary" onClick={submit} disabled={!value.trim()} aria-label="Send command">
          <ArrowUp size={15} />
        </Button>
      </div>
      {dictation.error ? (
        <div className="flex items-start gap-1.5 px-1 text-[10.5px] leading-relaxed text-amber">
          <MicOff size={12} className="mt-0.5 shrink-0" />
          {dictation.error}
        </div>
      ) : null}
    </div>
  );
}
