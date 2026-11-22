export type AiCoreStatus = 'idle' | 'loading' | 'listening' | 'thinking' | 'speaking' | 'error';

const CAPTIONS: Record<AiCoreStatus, [string, string]> = {
  idle: ['CORE IDLE', 'Monitoring local system'],
  loading: ['INITIALIZING', 'Reading real system state'],
  listening: ['LISTENING', 'Voice input is not enabled yet'],
  thinking: ['PROCESSING', 'Waiting for an AI provider'],
  speaking: ['RESPONDING', 'Response playback is not enabled yet'],
  error: ['LINK ERROR', 'System telemetry is unavailable'],
};

export function AiCore({ status }: { status: AiCoreStatus }) {
  const [title, subtitle] = CAPTIONS[status];

  return (
    <div className={`core core--${status}`}>
      <div className="core-halo" aria-hidden="true" />
      <div className="core-ring core-ring--outer" aria-hidden="true" />
      <div className="core-ring core-ring--middle" aria-hidden="true" />
      <div className="core-ring core-ring--inner" aria-hidden="true" />
      <div className="core-sphere" aria-hidden="true">
        <span className="core-glyph">J</span>
      </div>
      <div className="core-caption">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
