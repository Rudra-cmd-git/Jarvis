import { useState } from 'react';
import { Button } from '../common/Button';
import { Panel } from '../common/Panel';
import { StatusPill } from '../common/StatusPill';
import { useCore } from '../../state/core-context';
import {
  PROVIDER_PRESETS,
  PROVIDER_PROTOCOLS,
  providerSecretId,
  type ProviderInput,
  type ProviderProtocol,
  type ProviderSummary,
} from '../../../shared/providers';

interface FormState {
  id?: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  models: string;
  enabled: boolean;
  priority: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  protocol: 'openai-compatible',
  baseUrl: '',
  models: '',
  enabled: true,
  priority: '100',
};

function toForm(provider: ProviderSummary): FormState {
  return {
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    models: provider.modelIds.join(', '),
    enabled: provider.enabled,
    priority: String(provider.priority),
  };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function CredentialEditor({
  provider,
  canManage,
}: {
  provider: ProviderSummary;
  canManage: boolean;
}) {
  const { setSecret, deleteSecret } = useCore();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, success: string) => {
    setPending(true);
    setError(null);
    setNote(null);
    try {
      await action();
      setValue('');
      setNote(success);
    } catch (cause) {
      setError(messageOf(cause, 'The credential operation failed.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="credential-editor">
      <div className="credential-row">
        <input
          type="password"
          className="field-input"
          placeholder="API key (write-only)"
          aria-label={`API key for ${provider.name}`}
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={!canManage || pending}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          variant="primary"
          disabled={!canManage || pending || value.trim().length === 0}
          onClick={() =>
            void run(
              () => setSecret(providerSecretId(provider.id), value.trim()),
              'Key encrypted and stored.',
            )
          }
          data-action="save-key"
        >
          Save key
        </Button>
        <Button
          variant="danger"
          disabled={!canManage || pending || provider.credentialState !== 'configured'}
          onClick={() => {
            if (!window.confirm(`Delete the stored credential for ${provider.name}?`)) {
              return;
            }
            void run(
              () => deleteSecret(providerSecretId(provider.id)),
              'Stored key removed.',
            );
          }}
          data-action="delete-key"
        >
          Remove key
        </Button>
      </div>
      {!canManage && (
        <p className="settings-note settings-note--warn">
          Grant “Store encrypted API credentials” below before saving keys.
        </p>
      )}
      {note && <p className="settings-note settings-note--good">{note}</p>}
      {error && <p className="settings-note settings-note--danger">{error}</p>}
    </div>
  );
}

export function ProvidersPanel() {
  const { providers, settings, permissions, saveProvider, removeProvider, activateProvider } =
    useCore();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManageCredentials =
    permissions?.permissions.find((entry) => entry.capability === 'credentials.manage')?.state ===
    'granted';

  const activeProvider = providers.find((provider) => provider.isActive) ?? null;

  const applyPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }
    setForm((current) => ({
      ...current,
      name: preset.label,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      models: preset.modelIds.join(', '),
    }));
  };

  const submit = async () => {
    setPending(true);
    setFormError(null);
    try {
      const input: ProviderInput = {
        id: form.id,
        name: form.name,
        protocol: form.protocol,
        baseUrl: form.baseUrl,
        modelIds: form.models.split(','),
        enabled: form.enabled,
        priority: Number(form.priority),
      };
      await saveProvider(input);
      setForm(EMPTY_FORM);
    } catch (cause) {
      setFormError(messageOf(cause, 'The provider could not be saved.'));
    } finally {
      setPending(false);
    }
  };

  const runProviderAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setFormError(null);
    try {
      await action();
    } catch (cause) {
      setFormError(messageOf(cause, 'The provider operation failed.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title="AI providers"
      eyebrow="CONFIGURATION · WRITE-ONLY KEYS"
      action={
        <StatusPill tone={activeProvider ? 'good' : 'neutral'}>
          {activeProvider ? `Active: ${activeProvider.name}` : 'No active provider'}
        </StatusPill>
      }
    >
      <p className="settings-note">
        Providers are stored in SQLite. API keys are encrypted by Electron safeStorage in the main
        process and are never sent back to this interface.
      </p>

      {providers.length === 0 ? (
        <p className="settings-note">No providers are configured yet.</p>
      ) : (
        <ul className="provider-list">
          {providers.map((provider) => (
            <li key={provider.id} className="provider-card" data-provider-id={provider.id}>
              <div className="provider-head">
                <div>
                  <strong>{provider.name}</strong>
                  <span className="provider-url mono">{provider.baseUrl}</span>
                </div>
                <div className="provider-pills">
                  {provider.isActive && <StatusPill tone="good">Active</StatusPill>}
                  <StatusPill tone={provider.enabled ? 'neutral' : 'warn'}>
                    {provider.enabled ? 'Enabled' : 'Disabled'}
                  </StatusPill>
                  <StatusPill
                    tone={
                      provider.credentialState === 'configured'
                        ? 'good'
                        : provider.credentialState === 'error'
                          ? 'danger'
                          : 'warn'
                    }
                  >
                    {provider.credentialState === 'configured'
                      ? 'Key stored'
                      : provider.credentialState === 'error'
                        ? 'Key unreadable'
                        : 'No key'}
                  </StatusPill>
                </div>
              </div>

              <div className="provider-meta">
                <span className="mono">{provider.protocol}</span>
                <span>Priority {provider.priority}</span>
                <span>{provider.modelIds.join(' · ')}</span>
              </div>

              <div className="provider-actions">
                <Button
                  variant="primary"
                  disabled={!provider.enabled || provider.isActive || busyId === provider.id}
                  onClick={() =>
                    void runProviderAction(provider.id, () => activateProvider(provider.id))
                  }
                  data-action="activate-provider"
                >
                  {provider.isActive ? 'Active provider' : 'Set active'}
                </Button>
                <Button
                  disabled={busyId === provider.id}
                  onClick={() => {
                    setForm(toForm(provider));
                    setFormError(null);
                  }}
                  data-action="edit-provider"
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  disabled={busyId === provider.id}
                  onClick={() => {
                    if (!window.confirm(`Remove provider “${provider.name}” and its stored key?`)) {
                      return;
                    }
                    void runProviderAction(provider.id, () => removeProvider(provider.id));
                  }}
                  data-action="remove-provider"
                >
                  Remove
                </Button>
              </div>

              <CredentialEditor provider={provider} canManage={canManageCredentials} />
            </li>
          ))}
        </ul>
      )}

      <div className="settings-subhead">
        <span className="eyebrow">{form.id ? 'EDIT PROVIDER' : 'ADD PROVIDER'}</span>
      </div>

      <div className="provider-form">
        <label className="field">
          <span>Preset</span>
          <select
            className="field-input"
            value=""
            disabled={Boolean(form.id)}
            onChange={(event) => applyPreset(event.target.value)}
            aria-label="Provider preset"
          >
            <option value="">Choose a preset to prefill…</option>
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Name</span>
          <input
            className="field-input"
            value={form.name}
            maxLength={80}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="My provider"
            aria-label="Provider name"
          />
        </label>

        <label className="field">
          <span>Protocol</span>
          <select
            className="field-input"
            value={form.protocol}
            onChange={(event) =>
              setForm({ ...form, protocol: event.target.value as ProviderProtocol })
            }
            aria-label="Provider protocol"
          >
            {PROVIDER_PROTOCOLS.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocol}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--wide">
          <span>Base URL</span>
          <input
            className="field-input"
            value={form.baseUrl}
            maxLength={500}
            onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            aria-label="Provider base URL"
          />
        </label>

        <label className="field field--wide">
          <span>Model identifiers (comma separated)</span>
          <input
            className="field-input"
            value={form.models}
            onChange={(event) => setForm({ ...form, models: event.target.value })}
            placeholder="model-a, model-b"
            spellCheck={false}
            aria-label="Provider models"
          />
        </label>

        <label className="field">
          <span>Priority</span>
          <input
            className="field-input"
            type="number"
            min={0}
            max={1000}
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
            aria-label="Provider priority"
          />
        </label>

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
          />
          <span>Enabled</span>
        </label>

        <div className="form-actions">
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={pending}
            data-action="save-provider"
          >
            {pending ? 'Saving…' : form.id ? 'Update provider' : 'Add provider'}
          </Button>
          {form.id && (
            <Button disabled={pending} onClick={() => setForm(EMPTY_FORM)}>
              Cancel edit
            </Button>
          )}
        </div>
      </div>

      {formError && <p className="settings-note settings-note--danger">{formError}</p>}
      <p className="settings-note">
        Default model: <span className="mono">{settings['ai.defaultModel'] || 'not selected'}</span>
      </p>
    </Panel>
  );
}
