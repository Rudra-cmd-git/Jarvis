import { Button } from '../common/Button';
import { DataRow } from '../common/DataRow';
import { Panel } from '../common/Panel';
import { StatusPill } from '../common/StatusPill';
import { useVoice } from '../../state/voice-context';
import type { VoiceMode } from '../../../shared/voice';

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
];

const KEYS = [
  { value: 'Space', label: 'Space' },
  { value: 'KeyM', label: 'M' },
  { value: 'KeyV', label: 'V' },
  { value: 'ShiftLeft', label: 'Left Shift' },
];

export function VoicePanel() {
  const {
    adapterLabel,
    adapterAvailable,
    adapterRequiresNetwork,
    permission,
    state,
    mode,
    language,
    pushToTalkKey,
    interimResults,
    grantPermission,
    setMode,
    setLanguage,
    setPushToTalkKey,
    setInterimResults,
  } = useVoice();

  return (
    <Panel
      title="Voice input"
      eyebrow="PUSH-TO-TALK · EXPLICIT CONSENT"
      action={<StatusPill tone={adapterAvailable ? 'good' : 'warn'}>{adapterAvailable ? 'READY' : 'UNSUPPORTED'}</StatusPill>}
    >
      <DataRow label="Recognition adapter" value={adapterLabel} />
      <DataRow label="Microphone permission" value={permission} tone={permission === 'granted' ? 'good' : 'warn'} />
      <DataRow label="Session state" value={state} />

      {permission !== 'granted' && (
        <div className="form-actions">
          <Button variant="primary" onClick={() => void grantPermission()} data-action="grant-microphone-settings">
            Grant microphone permission
          </Button>
        </div>
      )}

      <div className="provider-form">
        <label className="field">
          <span>Input mode</span>
          <select
            className="field-input"
            aria-label="Voice input mode"
            value={mode}
            onChange={(event) => void setMode(event.target.value as VoiceMode)}
          >
            <option value="text">Text</option>
            <option value="voice">Voice-first</option>
          </select>
        </label>
        <label className="field">
          <span>Recognition language</span>
          <select
            className="field-input"
            aria-label="Speech recognition language"
            value={language}
            onChange={(event) => void setLanguage(event.target.value)}
          >
            {LANGUAGES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Push-to-talk key</span>
          <select
            className="field-input"
            aria-label="Push-to-talk key"
            value={pushToTalkKey}
            onChange={(event) => void setPushToTalkKey(event.target.value)}
          >
            {KEYS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={interimResults}
            aria-label="Show interim transcript"
            onChange={(event) => void setInterimResults(event.target.checked)}
          />
          <span>Show live partial transcript</span>
        </label>
      </div>

      {adapterRequiresNetwork && (
        <p className="settings-note settings-note--warn">
          {adapterLabel} uses Chromium Web Speech, which may send audio to an external recognition
          service. JARVIS does not record or store audio. A local recognition engine can replace
          this adapter without changing the voice session layer.
        </p>
      )}
      <p className="settings-note">
        Hold the microphone button in Chat or the configured push-to-talk key while speaking. The
        microphone stops immediately when you release it or switch away from the window. Recognized
        text is inserted into the composer and is never sent automatically.
      </p>
    </Panel>
  );
}
