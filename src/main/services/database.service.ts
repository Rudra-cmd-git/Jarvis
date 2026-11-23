import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseStatus, MigrationInfo } from '../../shared/types';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, type Migration } from './migrations';

interface MigrationRow {
  version: number;
  name: string;
  applied_at: number;
}

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`;

function validateMigrations(migrations: readonly Migration[]): void {
  const versions = new Set<number>();

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error('Migration versions must be positive integers');
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  const sorted = [...versions].sort((a, b) => a - b);
  sorted.forEach((version, index) => {
    if (version !== index + 1) {
      throw new Error('Migration versions must be contiguous starting at 1');
    }
  });
}

function toSafeMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unknown database error';
}

export class DatabaseService {
  private readonly filePath: string;
  private readonly migrations: readonly Migration[];
  private connection: DatabaseSync | null = null;
  private status: DatabaseStatus;

  constructor(filePath: string, migrations: readonly Migration[] = MIGRATIONS) {
    validateMigrations(migrations);
    this.filePath = filePath;
    this.migrations = [...migrations].sort((a, b) => a.version - b.version);
    this.status = {
      initialized: false,
      filePath,
      schemaVersion: 0,
      journalMode: 'unknown',
      appliedMigrations: [],
      error: null,
    };
  }

  initialize(): DatabaseStatus {
    if (this.connection) {
      return this.getStatus();
    }

    try {
      if (this.filePath !== ':memory:') {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      }

      const db = new DatabaseSync(this.filePath);
      this.connection = db;

      db.exec('PRAGMA busy_timeout = 5000');
      db.exec('PRAGMA foreign_keys = ON');
      db.exec(`PRAGMA journal_mode = ${this.filePath === ':memory:' ? 'MEMORY' : 'WAL'}`);
      db.exec(MIGRATION_TABLE_SQL);

      const appliedRows = db
        .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
        .all() as unknown as MigrationRow[];

      const appliedVersions = new Set(appliedRows.map((row) => row.version));
      const highestApplied = appliedRows.reduce((highest, row) => Math.max(highest, row.version), 0);
      const highestKnown = this.migrations.reduce(
        (highest, migration) => Math.max(highest, migration.version),
        LATEST_SCHEMA_VERSION,
      );

      if (highestApplied > highestKnown) {
        throw new Error(
          `Database schema version ${highestApplied} is newer than this application supports (${highestKnown})`,
        );
      }

      for (const migration of this.migrations) {
        if (appliedVersions.has(migration.version)) {
          continue;
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          migration.up(db);
          db.prepare(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          ).run(migration.version, migration.name, Date.now());
          db.exec('COMMIT');
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // SQLite may already have rolled back after a fatal statement.
          }
          throw new Error(
            `Migration ${migration.version} (${migration.name}) failed: ${toSafeMessage(error)}`,
          );
        }
      }

      const journalRow = db.prepare('PRAGMA journal_mode').get() as
        | { journal_mode?: unknown }
        | undefined;
      const applied = this.readAppliedMigrations();

      this.status = {
        initialized: true,
        filePath: this.filePath,
        schemaVersion: applied.reduce((highest, row) => Math.max(highest, row.version), 0),
        journalMode: typeof journalRow?.journal_mode === 'string' ? journalRow.journal_mode : 'unknown',
        appliedMigrations: applied,
        error: null,
      };

      return this.getStatus();
    } catch (error) {
      const message = toSafeMessage(error);
      this.status = {
        ...this.status,
        initialized: false,
        error: message,
      };
      this.close();
      throw new Error(message);
    }
  }

  getStatus(): DatabaseStatus {
    return {
      ...this.status,
      appliedMigrations: [...this.status.appliedMigrations],
    };
  }

  get db(): DatabaseSync {
    if (!this.connection) {
      throw new Error('Database is not initialized');
    }
    return this.connection;
  }

  transaction<T>(work: () => T): T {
    const db = this.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
      throw error;
    }
  }

  close(): void {
    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        // Closing an already-broken connection must not mask the real error.
      }
      this.connection = null;
    }
    this.status = { ...this.status, initialized: false };
  }

  private readAppliedMigrations(): MigrationInfo[] {
    if (!this.connection) {
      return [];
    }

    const rows = this.connection
      .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
      .all() as unknown as MigrationRow[];

    return rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
    }));
  }
}
