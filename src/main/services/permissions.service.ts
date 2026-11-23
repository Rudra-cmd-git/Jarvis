import {
  PERMISSION_CATALOG,
  getPermissionDescriptor,
  isPermissionCapability,
  type PermissionCapability,
  type PermissionOverview,
  type PermissionState,
  type PermissionView,
} from '../../shared/permissions';
import type { ActivityLogService } from './activity-log.service';
import type { DatabaseService } from './database.service';

interface PermissionRow {
  capability: string;
  decision: string;
  updated_at: number;
}

export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor(capability: PermissionCapability) {
    const descriptor = getPermissionDescriptor(capability);
    super(`Permission not granted: ${descriptor.label}`);
    this.name = 'PermissionDeniedError';
  }
}

export class PermissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionValidationError';
  }
}

export class PermissionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity?: ActivityLogService,
  ) {}

  list(): PermissionOverview {
    const rows = this.database.db
      .prepare('SELECT capability, decision, updated_at FROM permissions')
      .all() as unknown as PermissionRow[];

    const stored = new Map<string, PermissionRow>();
    for (const row of rows) {
      if (isPermissionCapability(row.capability)) {
        stored.set(row.capability, row);
      }
    }

    const permissions: PermissionView[] = PERMISSION_CATALOG.map((descriptor) => {
      const row = stored.get(descriptor.capability);
      const decision: PermissionState =
        row?.decision === 'granted' || row?.decision === 'denied' ? row.decision : 'unset';

      return {
        ...descriptor,
        state: decision,
        updatedAt: row?.updated_at ?? null,
      };
    });

    return { permissions };
  }

  getState(capability: PermissionCapability): PermissionState {
    const row = this.database.db
      .prepare('SELECT decision FROM permissions WHERE capability = ?')
      .get(capability) as { decision?: unknown } | undefined;

    return row?.decision === 'granted' || row?.decision === 'denied' ? row.decision : 'unset';
  }

  grant(capability: PermissionCapability): PermissionOverview {
    return this.setDecision(capability, 'granted');
  }

  deny(capability: PermissionCapability): PermissionOverview {
    return this.setDecision(capability, 'denied');
  }

  revoke(capability: PermissionCapability): PermissionOverview {
    this.assertCapability(capability);
    this.database.db.prepare('DELETE FROM permissions WHERE capability = ?').run(capability);

    const descriptor = getPermissionDescriptor(capability);
    this.activity?.tryRecord({
      category: 'permission',
      severity: 'info',
      action: 'permission.revoked',
      outcome: 'info',
      detail: `${descriptor.label} (${capability})`,
    });

    return this.list();
  }

  isGranted(capability: PermissionCapability): boolean {
    return this.getState(capability) === 'granted';
  }

  require(capability: PermissionCapability): void {
    if (!this.isGranted(capability)) {
      throw new PermissionDeniedError(capability);
    }
  }

  private setDecision(
    capability: PermissionCapability,
    decision: 'granted' | 'denied',
  ): PermissionOverview {
    this.assertCapability(capability);

    // Defense in depth: the IPC handler checks this too, but the service must
    // never record consent for a capability that no code enforces.
    const descriptor = getPermissionDescriptor(capability);
    if (!descriptor.available) {
      throw new PermissionValidationError(
        'This capability is not enforced yet and cannot be changed.',
      );
    }

    this.database.db
      .prepare(
        `INSERT INTO permissions (capability, decision, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(capability) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at`,
      )
      .run(capability, decision, Date.now());

    this.activity?.tryRecord({
      category: 'permission',
      severity: 'info',
      action: decision === 'granted' ? 'permission.granted' : 'permission.denied',
      outcome: decision === 'granted' ? 'allowed' : 'denied',
      detail: `${descriptor.label} (${capability})`,
    });

    return this.list();
  }

  private assertCapability(capability: PermissionCapability): void {
    if (!isPermissionCapability(capability)) {
      throw new PermissionValidationError('Unknown permission capability');
    }
  }
}
