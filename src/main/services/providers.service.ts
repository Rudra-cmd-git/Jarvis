import { randomUUID } from 'node:crypto';
import {
  normalizeModelIds,
  providerSecretId,
  validateProviderInput,
  type ProviderInput,
  type ProviderProtocol,
  type ProviderSummary,
  type ProviderValidationErrors,
} from '../../shared/providers';
import type { ActivityLogService } from './activity-log.service';
import type { DatabaseService } from './database.service';
import type { SecretsService } from './secrets.service';
import type { SettingsService } from './settings.service';

interface ProviderRow {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  model_ids_json: string;
  enabled: number;
  priority: number;
  created_at: number;
  updated_at: number;
}

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export class ProviderValidationError extends Error {
  readonly code = 'PROVIDER_VALIDATION_FAILED';
  readonly errors: ProviderValidationErrors;

  constructor(errors: ProviderValidationErrors) {
    super(Object.values(errors)[0] ?? 'Provider configuration is invalid.');
    this.name = 'ProviderValidationError';
    this.errors = errors;
  }
}

export class ProviderNotFoundError extends Error {
  readonly code = 'PROVIDER_NOT_FOUND';

  constructor() {
    super('Provider not found.');
    this.name = 'ProviderNotFoundError';
  }
}

function parseModels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeModelIds(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return [];
  }
}

export class ProvidersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
    private readonly secrets: SecretsService,
    private readonly activity: ActivityLogService,
  ) {}

  list(): ProviderSummary[] {
    const rows = this.database.db
      .prepare(
        `SELECT id, name, protocol, base_url, model_ids_json, enabled, priority, created_at, updated_at
         FROM provider_configs
         ORDER BY enabled DESC, priority ASC, name COLLATE NOCASE ASC`,
      )
      .all() as unknown as ProviderRow[];

    const activeId = this.settings.get('ai.activeProviderId');
    return rows.map((row) => this.toSummary(row, activeId));
  }

  save(input: ProviderInput): ProviderSummary {
    const validation = validateProviderInput(input);
    if (!validation.valid) {
      throw new ProviderValidationError(validation.errors);
    }

    const id = input.id ?? randomUUID();
    if (!PROVIDER_ID_PATTERN.test(id)) {
      throw new ProviderValidationError({ id: 'Provider identifier is invalid.' });
    }

    const existing = input.id ? this.getRow(id) : undefined;
    if (input.id && !existing) {
      throw new ProviderNotFoundError();
    }

    const now = Date.now();
    const name = input.name.trim();
    const baseUrl = input.baseUrl.trim();
    const modelIds = normalizeModelIds(input.modelIds);
    const createdAt = existing?.created_at ?? now;

    this.database.db
      .prepare(
        `INSERT INTO provider_configs
           (id, name, protocol, base_url, model_ids_json, enabled, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           protocol = excluded.protocol,
           base_url = excluded.base_url,
           model_ids_json = excluded.model_ids_json,
           enabled = excluded.enabled,
           priority = excluded.priority,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        name,
        input.protocol,
        baseUrl,
        JSON.stringify(modelIds),
        input.enabled ? 1 : 0,
        input.priority,
        createdAt,
        now,
      );

    this.activity.tryRecord({
      category: 'provider',
      severity: 'info',
      action: existing ? 'provider.updated' : 'provider.created',
      outcome: 'success',
      detail: `${name} (${id})`,
    });

    const row = this.getRow(id);
    if (!row) {
      throw new ProviderNotFoundError();
    }
    return this.toSummary(row, this.settings.get('ai.activeProviderId'));
  }

  remove(id: string): boolean {
    if (!PROVIDER_ID_PATTERN.test(id)) {
      throw new ProviderValidationError({ id: 'Provider identifier is invalid.' });
    }

    const row = this.getRow(id);
    if (!row) {
      return false;
    }

    this.database.db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id);

    try {
      this.secrets.deleteSecret(providerSecretId(id));
    } catch {
      this.activity.tryRecord({
        category: 'security',
        severity: 'warning',
        action: 'provider.credential_cleanup_failed',
        outcome: 'failure',
        detail: `Provider ${id} was removed but its stored credential could not be deleted.`,
      });
    }

    if (this.settings.get('ai.activeProviderId') === id) {
      this.settings.set('ai.activeProviderId', null);
      this.settings.set('ai.defaultModel', '');
    }

    this.activity.tryRecord({
      category: 'provider',
      severity: 'info',
      action: 'provider.removed',
      outcome: 'success',
      detail: `${row.name} (${id})`,
    });

    return true;
  }

  setActive(id: string): ProviderSummary[] {
    if (!PROVIDER_ID_PATTERN.test(id)) {
      throw new ProviderValidationError({ id: 'Provider identifier is invalid.' });
    }

    const row = this.getRow(id);
    if (!row) {
      throw new ProviderNotFoundError();
    }
    if (row.enabled !== 1) {
      throw new ProviderValidationError({ enabled: 'Enable the provider before making it active.' });
    }

    this.settings.set('ai.activeProviderId', id);
    const models = parseModels(row.model_ids_json);
    if (!models.includes(this.settings.get('ai.defaultModel')) && models.length > 0) {
      this.settings.set('ai.defaultModel', models[0]);
    }

    this.activity.tryRecord({
      category: 'provider',
      severity: 'info',
      action: 'provider.activated',
      outcome: 'success',
      detail: `${row.name} (${id})`,
    });

    return this.list();
  }

  get(id: string): ProviderSummary | undefined {
    if (!PROVIDER_ID_PATTERN.test(id)) {
      return undefined;
    }
    const row = this.getRow(id);
    return row ? this.toSummary(row, this.settings.get('ai.activeProviderId')) : undefined;
  }

  getRow(id: string): ProviderRow | undefined {
    return this.database.db
      .prepare(
        `SELECT id, name, protocol, base_url, model_ids_json, enabled, priority, created_at, updated_at
         FROM provider_configs WHERE id = ?`,
      )
      .get(id) as unknown as ProviderRow | undefined;
  }

  private toSummary(row: ProviderRow, activeId: string | null): ProviderSummary {
    let credentialState: ProviderSummary['credentialState'];
    try {
      credentialState = this.secrets.hasSecret(providerSecretId(row.id)) ? 'configured' : 'missing';
    } catch {
      credentialState = 'error';
    }

    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol as ProviderProtocol,
      baseUrl: row.base_url,
      modelIds: parseModels(row.model_ids_json),
      enabled: row.enabled === 1,
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      credentialState,
      isActive: activeId === row.id,
    };
  }
}
