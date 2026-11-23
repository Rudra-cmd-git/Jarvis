import { useState } from 'react';
import { Button } from '../common/Button';
import { Panel } from '../common/Panel';
import { useCore } from '../../state/core-context';
import type { SettingKey } from '../../../shared/settings';

function ToggleRow({
  settingKey,
  label,
  description,
  value,
}: {
  settingKey: SettingKey;
  label: string;
  description: string;
  value: boolean;
}) {
  const { updateSetting, resetSetting } = useCore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The setting could not be saved.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="toggle-row">
      <div className="toggle-copy">
        <strong>{label}</strong>
        <span>{description}</span>
        {error && <span className="settings-note settings-note--danger">{error}</span>}
      </div>
      <div className="toggle-actions">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          className={`switch${value ? ' switch--on' : ''}`}
          disabled={pending}
          onClick={() => void run(() => updateSetting(settingKey, !value))}
          data-setting={settingKey}
        >
          <span className="switch-thumb" aria-hidden="true" />
        </button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => void run(() => resetSetting(settingKey))}
          title="Restore the default value"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

export function AppearancePanel() {
  const { settings } = useCore();

  return (
    <Panel title="Interface behaviour" eyebrow="PERSISTED SETTINGS">
      <ToggleRow
        settingKey="ui.reduceMotion"
        label="Reduce motion"
        description="Disable ambient animation and transitions across the shell. Stored in SQLite and restored on launch."
        value={settings['ui.reduceMotion']}
      />
      <ToggleRow
        settingKey="ui.compactSidebar"
        label="Compact sidebar"
        description="Collapse navigation to icons and widen the working area. Stored in SQLite and restored on launch."
        value={settings['ui.compactSidebar']}
      />
      <p className="settings-note">
        These toggles are read from the database on startup and applied to the live shell immediately.
      </p>
    </Panel>
  );
}
