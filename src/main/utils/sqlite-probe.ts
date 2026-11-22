export interface SqliteProbeResult {
  available: boolean;
  detail: string;
}

/**
 * Uses a runtime require so a missing node:sqlite module cannot prevent the
 * main process from loading. The result drives the database choice in M3.
 */
export function probeNodeSqlite(): SqliteProbeResult {
  try {
    const sqlite = require('node:sqlite') as { DatabaseSync?: unknown };
    if (typeof sqlite.DatabaseSync !== 'function') {
      return { available: false, detail: 'node:sqlite present but DatabaseSync is missing' };
    }
    return { available: true, detail: 'node:sqlite DatabaseSync available' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, detail: `node:sqlite unavailable: ${message}` };
  }
}
