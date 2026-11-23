import { ipcMain, type WebContents } from 'electron';
import {
  AI_CHAT_ROLES,
  AI_LIMITS,
  AI_REQUEST_ID_PATTERN,
  type AiChatRequest,
  type AiChatRole,
  type AiStreamEventPayload,
} from '../../shared/ai';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  IpcValidationError,
  asEnum,
  asInteger,
  asNumber,
  asOptionalString,
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
} from '../utils/validation';

const MODEL_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,120}$/;

function parseRequestId(value: unknown): string {
  return asString(value, 'requestId', {
    min: 8,
    max: AI_LIMITS.maxRequestIdLength,
    pattern: AI_REQUEST_ID_PATTERN,
  });
}

function parseChatRequest(value: unknown): AiChatRequest {
  const payload = asRecord(value, 'request');
  assertKeys(payload, ['messages', 'model', 'temperature', 'maxTokens'], 'request');

  if (!Array.isArray(payload.messages)) {
    throw new IpcValidationError('request.messages must be an array.');
  }
  if (payload.messages.length < 1 || payload.messages.length > AI_LIMITS.maxMessages) {
    throw new IpcValidationError('request.messages has an invalid number of items.');
  }

  let totalContentLength = 0;
  const messages = payload.messages.map((entry, index) => {
    const field = `messages[${index}]`;
    const message = asRecord(entry, field);
    assertKeys(message, ['role', 'content'], field);

    const role = asEnum<AiChatRole>(message.role, AI_CHAT_ROLES, `${field}.role`);
    const content = asString(message.content, `${field}.content`, {
      min: 1,
      max: AI_LIMITS.maxContentLength,
    });
    totalContentLength += content.length;
    if (totalContentLength > AI_LIMITS.maxContentLength * 4) {
      throw new IpcValidationError('The request is too large.');
    }

    return { role, content };
  });

  const request: AiChatRequest = { messages };

  if (payload.model !== undefined) {
    request.model = asString(payload.model, 'model', {
      min: 1,
      max: AI_LIMITS.maxModelLength,
      pattern: MODEL_PATTERN,
    });
  }
  if (payload.temperature !== undefined) {
    request.temperature = asNumber(payload.temperature, 'temperature', { min: 0, max: 2 });
  }
  if (payload.maxTokens !== undefined) {
    request.maxTokens = asInteger(payload.maxTokens, 'maxTokens', { min: 1, max: 32_768 });
  }

  return request;
}

function sendStreamEvent(sender: WebContents, payload: AiStreamEventPayload): void {
  try {
    if (!sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.AI_STREAM_EVENT, payload);
    }
  } catch {
    // A closed renderer must not break the stream runner.
  }
}

const trackedSenders = new Set<number>();

function trackSender(sender: WebContents): void {
  if (trackedSenders.has(sender.id)) {
    return;
  }
  trackedSenders.add(sender.id);
  sender.once('destroyed', () => {
    trackedSenders.delete(sender.id);
    try {
      getCoreServices().ai.cancelAll(sender.id);
    } catch {
      // Core services may already be shut down.
    }
  });
}

export function registerAiIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.AI_GET_STATUS);
  ipcMain.handle(IPC_CHANNELS.AI_GET_STATUS, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().ai.getStatus();
  });

  ipcMain.removeHandler(IPC_CHANNELS.AI_LIST_MODELS);
  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['providerId'], 'payload');
    const providerId = asOptionalString(payload.providerId, 'providerId', {
      min: 1,
      max: 120,
    });
    return getCoreServices().ai.listModels(providerId);
  });

  ipcMain.removeHandler(IPC_CHANNELS.AI_STREAM_START);
  ipcMain.handle(IPC_CHANNELS.AI_STREAM_START, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['requestId', 'request'], 'payload');
    const requestId = parseRequestId(payload.requestId);
    const request = parseChatRequest(payload.request);
    const sender = event.sender;
    trackSender(sender);
    return getCoreServices().ai.startStream(sender.id, requestId, request, (streamEvent) =>
      sendStreamEvent(sender, streamEvent),
    );
  });

  ipcMain.removeHandler(IPC_CHANNELS.AI_STREAM_CANCEL);
  ipcMain.handle(IPC_CHANNELS.AI_STREAM_CANCEL, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['requestId'], 'payload');
    const requestId = parseRequestId(payload.requestId);
    return getCoreServices().ai.cancelStream(event.sender.id, requestId);
  });
}
