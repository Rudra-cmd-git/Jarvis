import { randomUUID } from 'node:crypto';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_SEVERITIES,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityOutcome,
  type ActivitySeverity,
} from '../../shared/types';
import { redactSensitiveText } from '../utils/redact';
import type { DatabaseService } from './database.service';

export interface ActivityInput {
  category: ActivityCategory;
  severity: ActivitySeverity;
  action: string;
  outcome: ActivityOutcome;
  detail?: string | null;
}

interface ActivityRow {
  id: string;
  timestamp: number;
  category: string;
  severity: string;
  action: string;
  outcome: string;
  detail: string | null;
}

const CATEGORIES = ACTIVITY_CATEGORIES;
const SEVERITIES = ACTIVITY_SEVERITIES;

const OUTCOMES: readonly ActivityOutcome[] = ['success', 'failure', 'allowed', 'denied', 'info'];

export class ActivityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityValidationError';
  }
}

function isCategory(value: unknown): value is ActivityCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function isSeverity(value: unknown): value is ActivitySeverity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

function isOutcome(value: unknown): value is ActivityOutcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class ActivityLogService {
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(
    private readonly database: DatabaseService,
    options: { now?: () => number; createId?: () => string } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
  }

  record(input: ActivityInput): ActivityEntry {
    if (!isCategory(input.category)) {
      throw new ActivityValidationError('Invalid activity category');
    }
    if (!isSeverity(input.severity)) {
      throw new ActivityValidationError('Invalid activity severity');
    }
    if (!isOutcome(input.outcome)) {
      throw new ActivityValidationError('Invalid activity outcome');
    }

    const action = redactSensitiveText(input.action, 120);
    if (!action) {
      throw new ActivityValidationError('Activity action must not be empty');
    }

    const entry: ActivityEntry = {
      id: this.createId(),
      timestamp: this.now(),
      category: input.category,
      severity: input.severity,
      action,
      outcome: input.outcome,
      detail: input.detail ? redactSensitiveText(input.detail) : null,
    };

    this.database.db
      .prepare(
        `INSERT INTO activity_log (id, timestamp, category, severity, action, outcome, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.timestamp,
        entry.category,
        entry.severity,
        entry.action,
        entry.outcome,
        entry.detail,
      );

    return entry;
  }

  /**
   * Audit logging must never break the operation it describes.
   */
  tryRecord(input: ActivityInput): ActivityEntry | null {
    try {
      return this.record(input);
    } catch {
      console.error('[jarvis] Activity log write failed.');
      return null;
    }
  }

  list(filter: ActivityFilter = {}): ActivityEntry[] {
    if (filter.category !== undefined && !isCategory(filter.category)) {
      throw new ActivityValidationError('Invalid activity category filter');
    }
    if (filter.severity !== undefined && !isSeverity(filter.severity)) {
      throw new ActivityValidationError('Invalid activity severity filter');
    }

    const conditions: string[] = [];
    const parameters: Array<string | number> = [];

    if (filter.category) {
      conditions.push('category = ?');
      parameters.push(filter.category);
    }
    if (filter.severity) {
      conditions.push('severity = ?');
      parameters.push(filter.severity);
    }

    const query = filter.query?.trim().slice(0, 200);
    if (query) {
      conditions.push("(action LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')");
      const pattern = `%${escapeLike(query)}%`;
      parameters.push(pattern, pattern);
    }

    const rawLimit = filter.limit ?? 50;
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 50;

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.database.db
      .prepare(
        `SELECT id, timestamp, category, severity, action, outcome, detail
         FROM activity_log
         ${where}
         ORDER BY timestamp DESC, rowid DESC
         LIMIT ?`,
      )
      .all(...parameters, limit) as unknown as ActivityRow[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      category: row.category as ActivityCategory,
      severity: row.severity as ActivitySeverity,
      action: row.action,
      outcome: row.outcome as ActivityOutcome,
      detail: row.detail,
    }));
  }
}
