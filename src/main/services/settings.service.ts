import type { AppSettings, SettingKey } from '../../shared/settings';
import { DEFAULT_SETTINGS, isSettingKey, isValidSettingValue, SETTING_KEYS } from '../../shared/settings';
import type { DatabaseService } from './database.service';

interface SettingRow {
  key: string;
  value_json: string;
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  getAll(): AppSettings {
    const rows = this.database.db
      .prepare('SELECT key, value_json FROM settings')
      .all() as unknown as SettingRow[];

    const stored = new Map<string, unknown>();
    for (const row of rows) {
      if (!isSettingKey(row.key)) {
        continue;
      }
      try {
        stored.set(row.key, JSON.parse(row.value_json));
      } catch {
        // Corrupt rows fall back to the documented default instead of
        // crashing the settings surface.
      }
    }

    const result = { ...DEFAULT_SETTINGS };
    for (const key of SETTING_KEYS) {
      const value = stored.get(key);
      if (value !== undefined && isValidSettingValue(key, value)) {
        Object.assign(result, { [key]: value });
      }
    }

    return result;
  }

  get<K extends SettingKey>(key: K): AppSettings[K] {
    const row = this.database.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get(key) as { value_json?: unknown } | undefined;

    if (row && typeof row.value_json === 'string') {
      try {
        const parsed: unknown = JSON.parse(row.value_json);
        if (isValidSettingValue(key, parsed)) {
          return parsed;
        }
      } catch {
        // Fall through to the default.
      }
    }

    return DEFAULT_SETTINGS[key];
  }

  set<K extends SettingKey>(key: K, value: unknown): AppSettings[K] {
    if (!isSettingKey(key)) {
      throw new SettingsValidationError('Unknown setting key');
    }
    if (!isValidSettingValue(key, value)) {
      throw new SettingsValidationError(`Invalid value for setting "${key}"`);
    }

    this.database.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), Date.now());

    return value;
  }

  reset<K extends SettingKey>(key: K): AppSettings[K] {
    if (!isSettingKey(key)) {
      throw new SettingsValidationError('Unknown setting key');
    }

    this.database.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return DEFAULT_SETTINGS[key];
  }

  resetAll(): AppSettings {
    this.database.db.prepare('DELETE FROM settings').run();
    return { ...DEFAULT_SETTINGS };
  }
}
