import { memo } from "react";
import type { CoreState } from "../../lib/types";
import { cn } from "../../lib/utils";

const META: Record<CoreState, { label: string; color: string; glow: string }> = {
  offline: { label: "OFFLINE", color: "#5b6d7d", glow: "rgba(91,109,125,0.25)" },
  idle: { label: "STANDBY", color: "#38e0ff", glow: "rgba(56,224,255,0.4)" },
  connecting: { label: "LINKING", color: "#5b8cff", glow: "rgba(91,140,255,0.45)" },
  thinking: { label: "PROCESSING", color: "#38e0ff", glow: "rgba(56,224,255,0.55)" },
  streaming: { label: "RESPONDING", color: "#38e0ff", glow: "rgba(56,224,255,0.55)" },
  speaking: { label: "SPEAKING", color: "#38e0a0", glow: "rgba(56,224,160,0.45)" },
  error: { label: "FAULT", color: "#ff5d6c", glow: "rgba(255,93,108,0.4)" },
  listening: { label: "LISTENING", color: "#ffb240", glow: "rgba(255,178,64,0.45)" },
};

function Bars({ active }: { active: boolean }) {
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {[0.45, 0.8, 0.55, 1, 0.65, 0.9, 0.5].map((h, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-ok/80", active && "anim-wave")}
          style={{
            height: `${h * 22}px`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

export const JarvisCore = memo(function JarvisCore({
  state,
  size = 300,
  compact = false,
}: {
  state: CoreState;
  size?: number;
  compact?: boolean;
}) {
  const meta = META[state];
  const active = state !== "offline";
  const fast = state === "thinking" || state === "connecting";
  const pulse = state === "listening" || state === "speaking";

  return (
    <div
      className="relative flex flex-col items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`JARVIS core: ${meta.label}`}
    >
      <div
        className="absolute rounded-full"
        style={{
          inset: "12%",
          background: `radial-gradient(circle, ${meta.glow} 0%, transparent 68%)`,
          filter: "blur(14px)",
        }}
      />

      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full overflow-visible">
        <circle cx="160" cy="160" r="150" fill="none" stroke="rgba(120,190,225,0.10)" strokeWidth="0.8" />
        <circle
          cx="160"
          cy="160"
          r="138"
          fill="none"
          stroke={meta.color}
          strokeOpacity="0.32"
          strokeWidth="0.9"
          strokeDasharray="2 10"
          className="anim-spin-slow"
          style={{ transformOrigin: "160px 160px", animationDuration: fast ? "8s" : "40s" }}
        />
        <circle
          cx="160"
          cy="160"
          r="122"
          fill="none"
          stroke={meta.color}
          strokeOpacity="0.45"
          strokeWidth="1.4"
          strokeDasharray="64 28 12 28"
          className="anim-spin-rev"
          style={{ transformOrigin: "160px 160px", animationDuration: fast ? "6s" : "22s" }}
        />
        <circle
          cx="160"
          cy="160"
          r="104"
          fill="none"
          stroke="rgba(150,210,240,0.22)"
          strokeWidth="0.8"
        />
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const r1 = 110;
          const r2 = i % 3 === 0 ? 118 : 114;
          return (
            <line
              key={i}
              x1={160 + Math.cos(angle) * r1}
              y1={160 + Math.sin(angle) * r1}
              x2={160 + Math.cos(angle) * r2}
              y2={160 + Math.sin(angle) * r2}
              stroke={meta.color}
              strokeOpacity={i % 3 === 0 ? 0.55 : 0.25}
              strokeWidth="1"
            />
          );
        })}
        <g className="anim-spin-slow" style={{ transformOrigin: "160px 160px", animationDuration: fast ? "5s" : "18s" }}>
          {[0, 90, 180, 270].map((deg) => {
            const angle = (deg * Math.PI) / 180;
            return (
              <circle
                key={deg}
                cx={160 + Math.cos(angle) * 122}
                cy={160 + Math.sin(angle) * 122}
                r="3.2"
                fill={meta.color}
                opacity="0.9"
              />
            );
          })}
        </g>
        <circle cx="160" cy="160" r="88" fill="none" stroke={meta.color} strokeOpacity="0.20" strokeWidth="1" />
        {pulse ? (
          <circle
            cx="160"
            cy="160"
            r="88"
            fill="none"
            stroke={meta.color}
            strokeWidth="1.2"
            opacity="0.5"
            style={{ transformOrigin: "160px 160px" }}
            className="anim-pulse"
          />
        ) : null}
      </svg>

      <div
        className={cn("relative flex items-center justify-center rounded-full", active && "anim-flicker")}
        style={{
          width: size * 0.34,
          height: size * 0.34,
          background: `radial-gradient(circle at 38% 32%, ${meta.color}33, ${meta.color}10 52%, rgba(4,8,14,0.95) 74%)`,
          border: `1px solid ${meta.color}55`,
          boxShadow: `0 0 42px -8px ${meta.glow}, inset 0 0 40px -14px ${meta.color}`,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          {state === "speaking" ? (
            <Bars active />
          ) : (
            <span
              className="block rounded-full"
              style={{
                width: 10,
                height: 10,
                background: meta.color,
                boxShadow: `0 0 20px 4px ${meta.glow}`,
              }}
            />
          )}
          {!compact ? (
            <span className="mono text-[9px] tracking-[0.28em]" style={{ color: meta.color }}>
              {meta.label}
            </span>
          ) : null}
        </div>
      </div>

      {!compact ? (
        <div className="absolute bottom-0 flex w-full items-center justify-between px-2 text-[9px] tracking-[0.24em] text-faint">
          <span className="mono">J.A.R.V.I.S</span>
          <span className="mono">MK IV</span>
        </div>
      ) : null}
    </div>
  );
});
