import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { DatabaseService } from '../../src/main/services/database.service';
import { redactSensitiveText } from '../../src/main/utils/redact';

let directory: string;
let database: DatabaseService;
let activity: ActivityLogService;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-activity-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  activity = new ActivityLogService(database);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('ActivityLogService', () => {
  it('records entries and returns newest first', () => {
    let now = 1000;
    const service = new ActivityLogService(database, {
      now: () => (now += 10),
      createId: () => `id-${now}`,
    });

    service.record({ category: 'app', severity: 'info', action: 'first', outcome: 'info' });
    service.record({ category: 'app', severity: 'info', action: 'second', outcome: 'info' });

    const entries = service.list();
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('second');
    expect(entries[1].action).toBe('first');
  });

  it('filters by category, severity, and query', () => {
    activity.record({ category: 'app', severity: 'info', action: 'app.start', outcome: 'info' });
    activity.record({
      category: 'database',
      severity: 'warning',
      action: 'database.slow',
      outcome: 'info',
    });
    activity.record({
      category: 'security',
      severity: 'error',
      action: 'secret.failed',
      outcome: 'failure',
      detail: 'credential rejected',
    });

    expect(activity.list({ category: 'database' })).toHaveLength(1);
    expect(activity.list({ severity: 'error' })[0].action).toBe('secret.failed');
    expect(activity.list({ query: 'credential' })[0].action).toBe('secret.failed');
    expect(activity.list({ query: 'app.' })[0].action).toBe('app.start');
  });

  it('caps the requested limit', () => {
    for (let index = 0; index < 5; index += 1) {
      activity.record({ category: 'app', severity: 'info', action: `event-${index}`, outcome: 'info' });
    }

    expect(activity.list({ limit: 2 })).toHaveLength(2);
    expect(activity.list({ limit: 0 })).toHaveLength(1);
    expect(activity.list({ limit: 10_000 })).toHaveLength(5);
  });

  it('redacts recognizable credentials before persisting', () => {
    const entry = activity.record({
      category: 'security',
      severity: 'info',
      action: 'provider.credential',
      outcome: 'success',
      detail: 'key sk-live-abcdef123456 and Authorization: Bearer abcdef123456',
    });

    expect(entry.detail).not.toContain('sk-live-abcdef123456');
    expect(entry.detail).not.toContain('abcdef123456');
    expect(entry.detail).toContain('[redacted-key]');
    expect(entry.detail).toContain('Bearer [redacted]');
  });

  it('rejects invalid categories, severities, and empty actions', () => {
    expect(() =>
      activity.record({ category: 'nope' as never, severity: 'info', action: 'x', outcome: 'info' }),
    ).toThrow();
    expect(() =>
      activity.record({ category: 'app', severity: 'nope' as never, action: 'x', outcome: 'info' }),
    ).toThrow();
    expect(() =>
      activity.record({ category: 'app', severity: 'info', action: '   ', outcome: 'info' }),
    ).toThrow();
  });
});

describe('redactSensitiveText', () => {
  it('handles api key assignments and control characters', () => {
    expect(redactSensitiveText('api_key="abc123"')).toBe('api_key=[redacted]');
    expect(redactSensitiveText('line\u0000break')).toBe('line break');
  });

  it('truncates long text with an ellipsis', () => {
    const result = redactSensitiveText('a'.repeat(100), 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('\u2026')).toBe(true);
  });
});
