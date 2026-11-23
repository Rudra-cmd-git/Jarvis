import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { DatabaseService } from '../../src/main/services/database.service';
import {
  PermissionDeniedError,
  PermissionsService,
} from '../../src/main/services/permissions.service';

let directory: string;
let database: DatabaseService;
let activity: ActivityLogService;
let permissions: PermissionsService;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-permissions-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  activity = new ActivityLogService(database);
  permissions = new PermissionsService(database, activity);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('PermissionsService', () => {
  it('lists every catalog capability with an unset initial state', () => {
    const overview = permissions.list();

    expect(overview.permissions.length).toBeGreaterThan(0);
    expect(overview.permissions.every((entry) => entry.state === 'unset')).toBe(true);
    expect(overview.permissions.filter((entry) => entry.available).map((entry) => entry.capability)).toEqual([
      'credentials.manage',
      'network.request',
    ]);
  });

  it('grants, denies, revokes, and persists decisions', () => {
    permissions.grant('credentials.manage');
    expect(permissions.isGranted('credentials.manage')).toBe(true);

    database.close();
    database = new DatabaseService(path.join(directory, 'jarvis.db'));
    database.initialize();
    permissions = new PermissionsService(database);

    expect(permissions.isGranted('credentials.manage')).toBe(true);

    permissions.deny('credentials.manage');
    expect(permissions.isGranted('credentials.manage')).toBe(false);
    expect(permissions.getState('credentials.manage')).toBe('denied');

    permissions.revoke('credentials.manage');
    expect(permissions.getState('credentials.manage')).toBe('unset');
  });

  it('throws a typed denial when a capability is not granted', () => {
    expect(() => permissions.require('credentials.manage')).toThrow(PermissionDeniedError);
    permissions.grant('credentials.manage');
    expect(() => permissions.require('credentials.manage')).not.toThrow();
  });

  it('refuses to record consent for capabilities that are not enforced', () => {
    expect(() => permissions.grant('system.exec')).toThrow(/not enforced yet/);
    expect(() => permissions.deny('files.read')).toThrow(/not enforced yet/);
    expect(permissions.getState('system.exec')).toBe('unset');
  });

  it('records permission changes in the activity log', () => {
    permissions.grant('credentials.manage');
    permissions.revoke('credentials.manage');

    const entries = activity.list({ category: 'permission' });
    expect(entries.map((entry) => entry.action)).toEqual([
      'permission.revoked',
      'permission.granted',
    ]);
  });
});
