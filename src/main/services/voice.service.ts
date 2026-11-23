import type { VoiceError, VoiceSessionEndResult, VoiceSessionStartResult, VoiceStatus } from '../../shared/voice';
import { VOICE_LANGUAGE_PATTERN, VOICE_SESSION_ID_PATTERN } from '../../shared/voice';
import type { ActivityLogService } from './activity-log.service';
import type { PermissionsService } from './permissions.service';

interface ActiveSession {
  senderId: number;
  startedAt: number;
  adapterId: string;
  language: string;
}

function voiceError(message: string, retryable = false): VoiceError {
  return { code: 'permission_denied', message, retryable };
}

export class VoiceService {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly permissions: PermissionsService,
    private readonly activity: ActivityLogService,
    private readonly now: () => number = Date.now,
  ) {}

  getStatus(): VoiceStatus {
    return {
      permission: this.permissions.getState('microphone.record'),
      activeSessions: this.sessions.size,
    };
  }

  startSession(
    senderId: number,
    sessionId: string,
    adapterId: string,
    language: string,
  ): VoiceSessionStartResult {
    if (!VOICE_SESSION_ID_PATTERN.test(sessionId)) {
      return {
        accepted: false,
        sessionId,
        error: { code: 'unknown', message: 'Invalid voice session identifier.', retryable: false },
      };
    }
    if (!VOICE_LANGUAGE_PATTERN.test(language)) {
      return {
        accepted: false,
        sessionId,
        error: { code: 'unknown', message: 'Invalid recognition language.', retryable: false },
      };
    }
    if (this.sessions.has(sessionId)) {
      return {
        accepted: false,
        sessionId,
        error: { code: 'unknown', message: 'A voice session with this identifier is active.', retryable: false },
      };
    }

    if (this.permissions.getState('microphone.record') !== 'granted') {
      this.activity.tryRecord({
        category: 'app',
        severity: 'warning',
        action: 'voice.session_denied',
        outcome: 'denied',
        detail: 'microphone.record',
      });
      return {
        accepted: false,
        sessionId,
        error: voiceError(
          'Microphone permission is required. Grant “Use the microphone” in Settings.',
        ),
      };
    }

    this.sessions.set(sessionId, {
      senderId,
      startedAt: this.now(),
      adapterId,
      language,
    });

    this.activity.tryRecord({
      category: 'app',
      severity: 'info',
      action: 'voice.session_started',
      outcome: 'info',
      detail: `${adapterId} · ${language}`,
    });

    return { accepted: true, sessionId };
  }

  endSession(
    senderId: number,
    sessionId: string,
    outcome: 'completed' | 'cancelled' | 'failed',
    characterCount: number,
  ): VoiceSessionEndResult {
    const session = this.sessions.get(sessionId);
    if (!session || session.senderId !== senderId) {
      return { ended: false, durationMs: 0 };
    }

    const durationMs = this.now() - session.startedAt;
    this.sessions.delete(sessionId);
    this.activity.tryRecord({
      category: 'app',
      severity: outcome === 'failed' ? 'warning' : 'info',
      action: `voice.session_${outcome}`,
      outcome: outcome === 'failed' ? 'failure' : 'success',
      detail: `${session.adapterId} · ${characterCount} char(s) · ${durationMs}ms`,
    });

    return { ended: true, durationMs };
  }

  cancelAll(senderId: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.senderId === senderId) {
        this.endSession(senderId, sessionId, 'cancelled', 0);
      }
    }
  }

  shutdown(): void {
    this.sessions.clear();
  }
}
