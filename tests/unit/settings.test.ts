import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/main/services/database.service';
import {
  SettingsService,
  SettingsValidationError,
} from '../../src/main/services/settings.service';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

let directory: string;
let database: DatabaseService;
let settings: SettingsService;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-settings-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  settings = new SettingsService(database);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('SettingsService', () => {
  it('returns documented defaults before anything is stored', () => {
    expect(settings.getAll()).toEqual(DEFAULT_SETTINGS);
    expect(settings.get('ui.reduceMotion')).toBe(false);
    expect(settings.get('ai.activeProviderId')).toBeNull();
  });

  it('persists typed values and survives reopen', () => {
    settings.set('ui.reduceMotion', true);
    settings.set('ui.compactSidebar', true);
    settings.set('ai.defaultModel', 'gpt-4o-mini');

    expect(settings.getAll()).toMatchObject({
      'ui.reduceMotion': true,
      'ui.compactSidebar': true,
      'ai.defaultModel': 'gpt-4o-mini',
    });

    database.close();
    database = new DatabaseService(path.join(directory, 'jarvis.db'));
    database.initialize();
    settings = new SettingsService(database);

    expect(settings.get('ui.reduceMotion')).toBe(true);
    expect(settings.get('ai.defaultModel')).toBe('gpt-4o-mini');
  });

  it('rejects invalid keys and values', () => {
    expect(() => settings.set('ui.unknown' as never, true)).toThrow(SettingsValidationError);
    expect(() => settings.set('ui.reduceMotion', 'yes' as never)).toThrow(SettingsValidationError);
    expect(() => settings.set('ai.defaultModel', 42 as never)).toThrow(SettingsValidationError);
  });

  it('resets a single key and all keys', () => {
    settings.set('ui.reduceMotion', true);
    settings.set('ui.compactSidebar', true);

    expect(settings.reset('ui.reduceMotion')).toBe(false);
    expect(settings.get('ui.reduceMotion')).toBe(false);
    expect(settings.get('ui.compactSidebar')).toBe(true);

    expect(settings.resetAll()).toEqual(DEFAULT_SETTINGS);
    expect(settings.getAll()).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores corrupt stored JSON instead of crashing', () => {
    database.db
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('ui.reduceMotion', '{not json', Date.now());

    expect(settings.get('ui.reduceMotion')).toBe(false);
    expect(settings.getAll()['ui.reduceMotion']).toBe(false);
  });
});
