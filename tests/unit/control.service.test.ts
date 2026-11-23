import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { ControlError, type ControlPlatform } from '../../src/main/services/control-platform';
import { ControlService } from '../../src/main/services/control.service';
import { DatabaseService } from '../../src/main/services/database.service';
import { PermissionsService } from '../../src/main/services/permissions.service';
import { SettingsService } from '../../src/main/services/settings.service';
import type { ControlAppEntry } from '../../src/shared/control';

let directory: string;
let database: DatabaseService;
let settings: SettingsService;
let permissions: PermissionsService;
let activity: ActivityLogService;
let platform: ControlPlatform;
let control: ControlService;
let emergencyCalls: number;

const appEntry: ControlAppEntry = {
  id: 'notepad',
  name: 'Notepad',
  path: 'C:\\Windows\\System32\\notepad.exe',
  enabled: true,
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-control-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  settings = new SettingsService(database);
  permissions = new PermissionsService(database);
  activity = new ActivityLogService(database);
  emergencyCalls = 0;
  platform = {
    now: () => Date.now(),
    clipboardText: async () => 'hello clipboard',
    openPath: async () => null,
    captureScreenshot: async () => ({
      filePath: path.join(directory, 'screenshot.png'),
      bytes: 1024,
      capturedAt: Date.now(),
    }),
    windowAction: (_senderId, action) => action === 'focus',
  };
  control = new ControlService({
    settings,
    permissions,
    activity,
    platform,
    screenshotDirectory: path.join(directory, 'screenshots'),
    onEmergencyStop: () => {
      emergencyCalls += 1;
    },
  });
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('ControlService', () => {
  it('reports capabilities and paused state', () => {
    const status = control.getStatus();
    expect(status.paused).toBe(false);
    expect(status.allowlistCount).toBe(0);
    expect(status.capabilities.map((entry) => entry.id)).toContain('app.launch');
    expect(status.capabilities.find((entry) => entry.id === 'app.launch')?.permission).toBe(
      'app.launch',
    );
  });

  it('validates and persists the application allowlist', () => {
    expect(control.addAllowlist(appEntry)).toEqual([appEntry]);
    expect(settings.get('control.appAllowlist')).toEqual([appEntry]);
    expect(() => control.addAllowlist(appEntry)).toThrow(ControlError);
    expect(() => control.addAllowlist({ ...appEntry, id: 'second', path: 'relative.exe' })).toThrow(
      /absolute Windows path/,
    );
    expect(control.removeAllowlist('notepad')).toEqual([]);
    expect(() => control.removeAllowlist('notepad')).toThrow(ControlError);
  });

  it('blocks privileged actions until their permissions are granted', async () => {
    await expect(control.launchApp('notepad')).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(control.readClipboard()).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(control.captureScreenshot()).rejects.toMatchObject({ code: 'permission_denied' });

    control.addAllowlist(appEntry);
    permissions.grant('app.launch');
    permissions.grant('clipboard.read');
    permissions.grant('screen.capture');

    expect(await control.launchApp('notepad')).toEqual({ launched: true, appId: 'notepad' });
    expect((await control.readClipboard()).text).toBe('hello clipboard');
    expect((await control.captureScreenshot()).bytes).toBe(1024);
  });

  it('does not log clipboard contents and records control actions', async () => {
    permissions.grant('clipboard.read');
    await control.readClipboard();
    const entries = activity.list({ category: 'control' });
    expect(entries.map((entry) => entry.action)).toEqual(['control.clipboard_read']);
    expect(JSON.stringify(entries)).not.toContain('hello clipboard');
  });

  it('truncates long clipboard text without changing the reported length', async () => {
    platform.clipboardText = async () => 'x'.repeat(5_000);
    permissions.grant('clipboard.read');
    const result = await control.readClipboard();
    expect(result.text).toHaveLength(4_000);
    expect(result.length).toBe(5_000);
    expect(result.truncated).toBe(true);
  });

  it('applies window actions through the platform adapter', () => {
    const focusSpy = vi.spyOn(platform, 'windowAction');
    expect(control.windowAction(7, 'focus')).toEqual({ action: 'focus', applied: true });
    expect(focusSpy).toHaveBeenCalledWith(7, 'focus');
  });

  it('emergency stop blocks actions and can be resumed explicitly', async () => {
    control.addAllowlist(appEntry);
    permissions.grant('app.launch');
    expect(control.emergencyStop()).toEqual({ paused: true });
    expect(emergencyCalls).toBe(1);
    await expect(control.launchApp('notepad')).rejects.toMatchObject({ code: 'paused' });
    expect(control.getStatus().paused).toBe(true);
    expect(control.resume()).toEqual({ paused: false });
    expect(await control.launchApp('notepad')).toEqual({ launched: true, appId: 'notepad' });
  });
});
