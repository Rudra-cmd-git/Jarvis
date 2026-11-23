import { ipcMain, type WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { VOICE_LANGUAGE_PATTERN, VOICE_SESSION_ID_PATTERN } from '../../shared/voice';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asInteger,
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

const trackedSenders = new Set<number>();

function trackSender(sender: WebContents): void {
  if (trackedSenders.has(sender.id)) {
    return;
  }
  trackedSenders.add(sender.id);
  sender.once('destroyed', () => {
    trackedSenders.delete(sender.id);
    try {
      getCoreServices().voice.cancelAll(sender.id);
    } catch {
      // Core services may already be shut down.
    }
  });
}

export function registerVoiceIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.VOICE_GET_STATUS);
  ipcMain.handle(IPC_CHANNELS.VOICE_GET_STATUS, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().voice.getStatus();
  });

  ipcMain.removeHandler(IPC_CHANNELS.VOICE_SESSION_START);
  ipcMain.handle(IPC_CHANNELS.VOICE_SESSION_START, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['sessionId', 'adapterId', 'language'], 'payload');
    const sessionId = asString(payload.sessionId, 'sessionId', {
      min: 8,
      max: 80,
      pattern: VOICE_SESSION_ID_PATTERN,
    });
    const adapterId = asString(payload.adapterId, 'adapterId', { min: 1, max: 80 });
    const language = asString(payload.language, 'language', {
      min: 2,
      max: 35,
      pattern: VOICE_LANGUAGE_PATTERN,
    });
    trackSender(event.sender);
    try {
      return getCoreServices().voice.startSession(
        event.sender.id,
        sessionId,
        adapterId,
        language,
      );
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Voice session could not be started.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.VOICE_SESSION_END);
  ipcMain.handle(IPC_CHANNELS.VOICE_SESSION_END, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['sessionId', 'outcome', 'characterCount'], 'payload');
    const sessionId = asString(payload.sessionId, 'sessionId', {
      min: 8,
      max: 80,
      pattern: VOICE_SESSION_ID_PATTERN,
    });
    const outcome = asString(payload.outcome, 'outcome');
    if (outcome !== 'completed' && outcome !== 'cancelled' && outcome !== 'failed') {
      throw new Error('Unsupported voice session outcome.');
    }
    const characterCount = asInteger(payload.characterCount, 'characterCount', {
      min: 0,
      max: 100_000,
    });
    try {
      return getCoreServices().voice.endSession(
        event.sender.id,
        sessionId,
        outcome,
        characterCount,
      );
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Voice session could not be ended.'));
    }
  });
}
