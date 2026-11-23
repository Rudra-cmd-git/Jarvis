import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { DatabaseService } from '../../src/main/services/database.service';
import { PermissionsService } from '../../src/main/services/permissions.service';
import { VoiceService } from '../../src/main/services/voice.service';

let directory: string;
let database: DatabaseService;
let permissions: PermissionsService;
let activity: ActivityLogService;
let voice: VoiceService;

const SESSION_ID = 'voice-session-0001';

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-voice-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  activity = new ActivityLogService(database);
  permissions = new PermissionsService(database, activity);
  voice = new VoiceService(permissions, activity);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('VoiceService', () => {
  it('requires microphone permission before starting a session', () => {
    const denied = voice.startSession(1, SESSION_ID, 'web-speech', 'en-US');
    expect(denied.accepted).toBe(false);
    expect(denied.error?.code).toBe('permission_denied');
    expect(voice.getStatus().activeSessions).toBe(0);

    permissions.grant('microphone.record');
    expect(voice.startSession(1, SESSION_ID, 'web-speech', 'en-US').accepted).toBe(true);
    expect(voice.getStatus().activeSessions).toBe(1);
  });

  it('rejects invalid session identifiers and languages', () => {
    permissions.grant('microphone.record');
    expect(voice.startSession(1, 'short', 'web-speech', 'en-US').accepted).toBe(false);
    expect(voice.startSession(1, SESSION_ID, 'web-speech', 'bad language').accepted).toBe(false);
  });

  it('ends only the originating renderer session and logs duration', () => {
    permissions.grant('microphone.record');
    voice.startSession(7, SESSION_ID, 'web-speech', 'hi-IN');
    expect(voice.endSession(8, SESSION_ID, 'completed', 12).ended).toBe(false);
    const ended = voice.endSession(7, SESSION_ID, 'completed', 12);
    expect(ended.ended).toBe(true);
    expect(ended.durationMs).toBeGreaterThanOrEqual(0);
    expect(voice.getStatus().activeSessions).toBe(0);

    const actions = activity.list({ category: 'app' }).map((entry) => entry.action);
    expect(actions).toContain('voice.session_started');
    expect(actions).toContain('voice.session_completed');
  });

  it('never logs transcript text and records cancellations', () => {
    permissions.grant('microphone.record');
    voice.startSession(1, SESSION_ID, 'web-speech', 'en-US');
    voice.endSession(1, SESSION_ID, 'cancelled', 42);

    const entries = activity.list({ category: 'app' });
    expect(JSON.stringify(entries)).not.toContain('hello transcript');
    expect(entries.map((entry) => entry.action)).toContain('voice.session_cancelled');
  });

  it('cancels all sessions for a destroyed renderer', () => {
    permissions.grant('microphone.record');
    voice.startSession(3, SESSION_ID, 'web-speech', 'en-US');
    voice.cancelAll(3);
    expect(voice.getStatus().activeSessions).toBe(0);
    expect(activity.list({ category: 'app' }).map((entry) => entry.action)).toContain(
      'voice.session_cancelled',
    );
  });
});
