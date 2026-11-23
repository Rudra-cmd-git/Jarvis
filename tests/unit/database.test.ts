import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/main/services/database.service';
import type { Migration } from '../../src/main/services/migrations';
import { LATEST_SCHEMA_VERSION } from '../../src/main/services/migrations';

const tempDirectories: string[] = [];

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-db-test-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('DatabaseService', () => {
  it('creates the schema, records migrations, and reports status', () => {
    const filePath = path.join(tempDir(), 'jarvis.db');
    const database = new DatabaseService(filePath);

    const status = database.initialize();

    expect(status.initialized).toBe(true);
    expect(status.error).toBeNull();
    expect(status.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(status.appliedMigrations).toHaveLength(LATEST_SCHEMA_VERSION);
    expect(status.journalMode.toLowerCase()).toBe('wal');
    expect(fs.existsSync(filePath)).toBe(true);

    const tables = database.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as unknown as Array<{ name: string }>;
    const names = tables.map((row) => row.name);

    expect(names).toContain('schema_migrations');
    expect(names).toContain('settings');
    expect(names).toContain('provider_configs');
    expect(names).toContain('permissions');
    expect(names).toContain('activity_log');
    expect(names).toContain('conversations');
    expect(names).toContain('messages');

    database.close();
  });

  it('persists data across reopen and does not re-apply migrations', () => {
    const filePath = path.join(tempDir(), 'jarvis.db');
    const first = new DatabaseService(filePath);
    first.initialize();
    first.db
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('ui.compactSidebar', 'true', Date.now());
    first.close();

    const second = new DatabaseService(filePath);
    const status = second.initialize();
    const row = second.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get('ui.compactSidebar') as { value_json?: string } | undefined;

    expect(status.appliedMigrations).toHaveLength(LATEST_SCHEMA_VERSION);
    expect(row?.value_json).toBe('true');

    second.close();
  });

  it('rolls back a failed transaction', () => {
    const database = new DatabaseService(path.join(tempDir(), 'jarvis.db'));
    database.initialize();

    expect(() =>
      database.transaction(() => {
        database.db
          .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
          .run('ui.reduceMotion', 'true', Date.now());
        throw new Error('deliberate failure');
      }),
    ).toThrow('deliberate failure');

    const row = database.db
      .prepare('SELECT key FROM settings WHERE key = ?')
      .get('ui.reduceMotion');
    expect(row).toBeUndefined();

    database.close();
  });

  it('rolls back a failed migration and reports the failure', () => {
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'ok',
        up: (db) => {
          db.exec('CREATE TABLE first_table (id TEXT PRIMARY KEY)');
        },
      },
      {
        version: 2,
        name: 'broken',
        up: (db) => {
          db.exec('CREATE TABLE second_table (id TEXT PRIMARY KEY)');
          db.exec('THIS IS NOT SQL');
        },
      },
    ];

    const filePath = path.join(tempDir(), 'jarvis.db');
    const database = new DatabaseService(filePath, migrations);

    expect(() => database.initialize()).toThrow(/Migration 2/);
    expect(database.getStatus().initialized).toBe(false);
    expect(database.getStatus().error).toContain('Migration 2');

    // Reopening must not leave a half-applied version 2.
    const reopened = new DatabaseService(filePath, migrations);
    expect(() => reopened.initialize()).toThrow(/Migration 2/);
  });

  it('refuses a database written by a newer schema', () => {
    const filePath = path.join(tempDir(), 'jarvis.db');
    const newer: Migration[] = [
      {
        version: 1,
        name: 'base',
        up: (db) => {
          db.exec('CREATE TABLE base_table (id TEXT PRIMARY KEY)');
        },
      },
      {
        version: 2,
        name: 'future',
        up: (db) => {
          db.exec('CREATE TABLE future_table (id TEXT PRIMARY KEY)');
        },
      },
    ];

    const database = new DatabaseService(filePath, newer);
    database.initialize();
    database.close();

    const older = new DatabaseService(filePath, []);
    expect(() => older.initialize()).toThrow(/newer than this application supports/);
  });
});
