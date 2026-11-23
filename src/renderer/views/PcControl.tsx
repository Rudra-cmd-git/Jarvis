import { useState } from 'react';
import { Button } from '../components/common/Button';
import { DataRow } from '../components/common/DataRow';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { StatusPill } from '../components/common/StatusPill';
import { useControl } from '../state/control-context';
import { useCore } from '../state/core-context';
import type { PermissionCapability } from '../../shared/permissions';
import type {
  ControlClipboardResult,
  ControlScreenshotResult,
  ControlWindowResult,
} from '../../shared/control';
import type { ViewId } from '../../shared/types';

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function PcControlView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  void onNavigate;
  const { permissions, setPermission } = useCore();
  const {
    status,
    allowlist,
    indicator,
    loading,
    error,
    refresh,
    addApp,
    removeApp,
    launch,
    readClipboard,
    captureScreenshot,
    windowAction,
    emergencyStop,
    resume,
  } = useControl();

  const [form, setForm] = useState({ id: '', name: '', path: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ControlClipboardResult | null>(null);
  const [screenshot, setScreenshot] = useState<ControlScreenshotResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const permissionState = (capability: PermissionCapability): string =>
    permissions?.permissions.find((entry) => entry.capability === capability)?.state ?? 'unset';

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setFormError(null);
    setNote(null);
    try {
      await action();
      setNote(success);
    } catch (cause) {
      setFormError(messageOf(cause, 'The control action failed.'));
    } finally {
      setBusy(null);
    }
  };

  const handleGrant = async (capability: PermissionCapability) => {
    await run(`grant-${capability}`, async () => {
      await setPermission(capability, 'grant');
    }, 'Permission granted.');
  };

  const paused = Boolean(status?.paused);
  const canLaunch = !paused && permissionState('app.launch') === 'granted';
  const canClipboard = !paused && permissionState('clipboard.read') === 'granted';
  const canCapture = !paused && permissionState('screen.capture') === 'granted';

  return (
    <main className="view" data-view="pc-control">
      <PageHeader
        viewId="pc-control"
        eyebrow="PERMISSION-GATED WINDOWS CONTROL"
        title="PC Control"
        subtitle="Only explicitly allowlisted applications and audited actions are available. No unrestricted shell execution exists."
        actions={
          <>
            <StatusPill tone={paused ? 'danger' : 'good'}>{paused ? 'PAUSED' : 'ACTIVE'}</StatusPill>
            {paused ? (
              <Button variant="primary" disabled={busy === 'resume'} onClick={() => void run('resume', async () => { await resume(); }, 'PC control resumed.')}>
                Resume control
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={busy === 'stop'}
                onClick={() => void run('stop', async () => { await emergencyStop(); }, 'Emergency stop engaged.')}
                data-action="emergency-stop"
              >
                Emergency stop
              </Button>
            )}
          </>
        }
      />

      {(loading || error) && !error && <LoadingState label="control-status" rows={3} />}
      {error && (
        <ErrorState title="Control services unavailable" message={error} onRetry={() => void refresh()} />
      )}

      {indicator?.active && (
        <p className="settings-note settings-note--warn" data-testid="control-indicator-detail">
          {indicator.label}…
        </p>
      )}
      {formError && <p className="settings-note settings-note--danger">{formError}</p>}
      {note && <p className="settings-note settings-note--good">{note}</p>}

      <section className="grid grid--2">
        <Panel title="Safety gates" eyebrow="VERIFIED STATUS">
          <DataRow label="Control state" value={paused ? 'Paused' : 'Active'} tone={paused ? 'danger' : 'good'} />
          <DataRow label="Allowlisted applications" value={String(status?.allowlistCount ?? allowlist.length)} />
          <DataRow label="Screenshot storage" value={status?.screenshotDirectory ?? '—'} />
          <DataRow label="Unrestricted shell execution" value="Forbidden by design" tone="danger" />
          <DataRow label="Activity log" value="Enabled (SQLite)" tone="good" />
          <DataRow label="Emergency stop" value={paused ? 'Engaged' : 'Available'} tone={paused ? 'danger' : 'good'} />
        </Panel>

        <Panel title="Permissions" eyebrow="EXPLICIT CONSENT">
          {(['app.launch', 'screen.capture', 'clipboard.read'] as const).map((capability) => {
            const state = permissionState(capability);
            return (
              <div className="permission-row" key={capability} data-capability={capability}>
                <div className="permission-copy">
                  <strong>{capability}</strong>
                  <StatusPill tone={state === 'granted' ? 'good' : 'warn'}>{state}</StatusPill>
                </div>
                {state !== 'granted' && (
                  <Button
                    variant="primary"
                    disabled={busy === `grant-${capability}`}
                    onClick={() => void handleGrant(capability)}
                    data-action="grant-control-permission"
                  >
                    Grant
                  </Button>
                )}
              </div>
            );
          })}
          <p className="settings-note">
            Microphone and screen-awareness permissions unlock in later milestones when their
            services exist. Locked capabilities can never be granted by the UI.
          </p>
        </Panel>
      </section>

      <Panel title="Application allowlist" eyebrow="ONLY THESE APPLICATIONS CAN LAUNCH">
        <div className="provider-form">
          <label className="field">
            <span>Identifier</span>
            <input
              className="field-input"
              aria-label="Application id"
              value={form.id}
              onChange={(event) => setForm({ ...form, id: event.target.value })}
              placeholder="notepad"
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="field-input"
              aria-label="Application name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Notepad"
            />
          </label>
          <label className="field field--wide">
            <span>Absolute application path</span>
            <input
              className="field-input"
              aria-label="Application path"
              value={form.path}
              onChange={(event) => setForm({ ...form, path: event.target.value })}
              placeholder="C:\\Windows\\System32\\notepad.exe"
              spellCheck={false}
            />
          </label>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={busy === 'add-app' || !form.id || !form.name || !form.path}
              onClick={() =>
                void run('add-app', async () => {
                  await addApp({
                    id: form.id.trim(),
                    name: form.name.trim(),
                    path: form.path.trim(),
                    enabled: true,
                  });
                  setForm({ id: '', name: '', path: '' });
                }, 'Application added to the allowlist.')
              }
              data-action="add-control-app"
            >
              Add application
            </Button>
          </div>
        </div>

        {allowlist.length === 0 ? (
          <p className="settings-note">No applications are allowlisted yet.</p>
        ) : (
          <ul className="provider-list">
            {allowlist.map((entry) => (
              <li key={entry.id} className="provider-card" data-app-id={entry.id}>
                <div className="provider-head">
                  <div>
                    <strong>{entry.name}</strong>
                    <span className="provider-url mono">{entry.path}</span>
                  </div>
                  <StatusPill tone={entry.enabled ? 'good' : 'warn'}>
                    {entry.enabled ? 'Allowed' : 'Disabled'}
                  </StatusPill>
                </div>
                <div className="provider-actions">
                  <Button
                    variant="primary"
                    disabled={!canLaunch || busy === `launch-${entry.id}`}
                    onClick={() =>
                      void run(`launch-${entry.id}`, async () => {
                        const result = await launch(entry.id);
                        if (!result.launched) {
                          throw new Error('The application could not be started.');
                        }
                      }, `${entry.name} launched.`)
                    }
                    data-action="launch-app"
                  >
                    Launch
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === `remove-${entry.id}`}
                    onClick={() => {
                      if (!window.confirm(`Remove ${entry.name} from the allowlist?`)) {
                        return;
                      }
                      void run(`remove-${entry.id}`, async () => {
                        await removeApp(entry.id);
                      }, 'Application removed.');
                    }}
                    data-action="remove-control-app"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Safe actions" eyebrow="AUDITED · CONFIRMED · REVERSIBLE WHERE POSSIBLE">
        <div className="action-grid">
          <button
            className="action-tile"
            type="button"
            disabled={!canClipboard || busy === 'clipboard'}
            onClick={() =>
              void run('clipboard', async () => {
                setClipboard(await readClipboard());
              }, 'Clipboard read.')
            }
            data-action="read-clipboard"
          >
            <strong>Read clipboard</strong>
            <span>Read clipboard text without logging its contents.</span>
          </button>
          <button
            className="action-tile"
            type="button"
            disabled={!canCapture || busy === 'screenshot'}
            onClick={() =>
              void run('screenshot', async () => {
                setScreenshot(await captureScreenshot());
              }, 'Screenshot saved locally.')
            }
            data-action="capture-screenshot"
          >
            <strong>Capture screenshot</strong>
            <span>Save a screenshot to the local JARVIS data folder.</span>
          </button>
          <button
            className="action-tile"
            type="button"
            disabled={paused || busy === 'window'}
            onClick={() =>
              void run('window', async () => {
                await windowAction('focus' as ControlWindowResult['action']);
              }, 'Window focused.')
            }
            data-action="focus-window"
          >
            <strong>Focus JARVIS</strong>
            <span>Bring the JARVIS window to the foreground.</span>
          </button>
        </div>
        {clipboard && (
          <p className="settings-note" data-testid="clipboard-result">
            Clipboard ({clipboard.length} chars{clipboard.truncated ? ', truncated' : ''}):{' '}
            <span className="mono">{clipboard.text.slice(0, 120)}</span>
          </p>
        )}
        {screenshot && (
          <p className="settings-note" data-testid="screenshot-result">
            Saved {screenshot.bytes} bytes to <span className="mono">{screenshot.filePath}</span>
          </p>
        )}
      </Panel>
    </main>
  );
}
