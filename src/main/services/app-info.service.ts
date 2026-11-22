import { app } from 'electron';
import type { AppInfo } from '../../shared/types';
import { probeNodeSqlite } from '../utils/sqlite-probe';

const startedAt = Date.now();

export function getAppInfo(): AppInfo {
  const sqlite = probeNodeSqlite();

  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome ?? 'unknown',
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    sqliteAvailable: sqlite.available,
    sqliteDetail: sqlite.detail,
    startedAt,
  };
}
