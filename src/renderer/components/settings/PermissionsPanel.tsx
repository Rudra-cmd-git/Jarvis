import { useState } from 'react';
import { Button } from '../common/Button';
import { Panel } from '../common/Panel';
import { StatusPill } from '../common/StatusPill';
import { useCore } from '../../state/core-context';
import type { PermissionCapability } from '../../../shared/permissions';

function stateTone(state: string): 'good' | 'danger' | 'neutral' {
  if (state === 'granted') {
    return 'good';
  }
  if (state === 'denied') {
    return 'danger';
  }
  return 'neutral';
}

export function PermissionsPanel() {
  const { permissions, setPermission } = useCore();
  const [busy, setBusy] = useState<PermissionCapability | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (capability: PermissionCapability, action: 'grant' | 'deny' | 'revoke') => {
    setBusy(capability);
    setError(null);
    try {
      await setPermission(capability, action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The permission could not be updated.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Permissions" eyebrow="EXPLICIT CONSENT">
      <p className="settings-note">
        Only capabilities enforced by real code can be granted. Planned capabilities are listed so
        the boundary is visible, but their controls stay locked until the feature exists.
      </p>

      {error && <p className="settings-note settings-note--danger">{error}</p>}

      <ul className="permission-list">
        {(permissions?.permissions ?? []).map((permission) => (
          <li key={permission.capability} className="permission-row" data-capability={permission.capability}>
            <div className="permission-copy">
              <div className="permission-title">
                <strong>{permission.label}</strong>
                <StatusPill tone={stateTone(permission.state)}>{permission.state}</StatusPill>
                <StatusPill tone={permission.risk === 'high' ? 'danger' : 'warn'} dot={false}>
                  {permission.risk} risk
                </StatusPill>
                {!permission.available && (
                  <StatusPill tone="neutral" dot={false}>
                    not enforced yet
                  </StatusPill>
                )}
              </div>
              <p>{permission.description}</p>
              <span className="permission-note">{permission.availabilityNote}</span>
            </div>
            <div className="permission-actions">
              <Button
                variant="primary"
                disabled={!permission.available || busy === permission.capability || permission.state === 'granted'}
                onClick={() => void run(permission.capability, 'grant')}
                data-action="grant-permission"
              >
                Grant
              </Button>
              <Button
                variant="danger"
                disabled={!permission.available || busy === permission.capability || permission.state === 'denied'}
                onClick={() => void run(permission.capability, 'deny')}
                data-action="deny-permission"
              >
                Deny
              </Button>
              <Button
                disabled={!permission.available || busy === permission.capability || permission.state === 'unset'}
                onClick={() => void run(permission.capability, 'revoke')}
                data-action="revoke-permission"
              >
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
