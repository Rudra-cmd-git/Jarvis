import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

/**
 * Migrations are append-only. Never edit an applied migration: add a new one.
 * Version 1 also creates conversation tables so later milestones can persist
 * history without a destructive schema change.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-core-schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE provider_configs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          protocol TEXT NOT NULL,
          base_url TEXT NOT NULL,
          model_ids_json TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          priority INTEGER NOT NULL DEFAULT 100,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE permissions (
          capability TEXT PRIMARY KEY,
          decision TEXT NOT NULL CHECK (decision IN ('granted', 'denied')),
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE activity_log (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          action TEXT NOT NULL,
          outcome TEXT NOT NULL,
          detail TEXT
        );

        CREATE INDEX idx_activity_timestamp ON activity_log (timestamp DESC);
        CREATE INDEX idx_activity_category ON activity_log (category);
        CREATE INDEX idx_activity_severity ON activity_log (severity);

        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          token_count INTEGER,
          metadata_json TEXT,
          FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
        );

        CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
      `);
    },
  },
  {
    version: 2,
    name: 'conversation-model-selection',
    up: (db) => {
      db.exec('ALTER TABLE conversations ADD COLUMN model TEXT;');
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);
