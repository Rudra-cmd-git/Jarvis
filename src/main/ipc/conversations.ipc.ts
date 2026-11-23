import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  CONVERSATION_ID_PATTERN,
  CONVERSATION_MESSAGE_MAX_LENGTH,
  CONVERSATION_MODEL_MAX_LENGTH,
  CONVERSATION_ROLES,
  CONVERSATION_TITLE_MAX_LENGTH,
  type AppendMessageInput,
  type ConversationInput,
  type ConversationRole,
} from '../../shared/conversations';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asEnum,
  asInteger,
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

function parseConversationId(value: unknown): string {
  return asString(value, 'id', { min: 1, max: 120, pattern: CONVERSATION_ID_PATTERN });
}

function parseCreateInput(value: unknown): ConversationInput {
  if (value === undefined || value === null) {
    return {};
  }
  const payload = asRecord(value, 'input');
  assertKeys(payload, ['title', 'model'], 'input');
  const input: ConversationInput = {};
  if (payload.title !== undefined) {
    input.title = asString(payload.title, 'title', {
      min: 1,
      max: CONVERSATION_TITLE_MAX_LENGTH,
    });
  }
  if (payload.model !== undefined) {
    if (payload.model === null) {
      input.model = null;
    } else {
      input.model = asString(payload.model, 'model', {
        min: 1,
        max: CONVERSATION_MODEL_MAX_LENGTH,
      });
    }
  }
  return input;
}

function parseAppendMessage(value: unknown): AppendMessageInput {
  const payload = asRecord(value, 'message');
  assertKeys(payload, ['conversationId', 'role', 'content', 'tokenCount', 'metadata'], 'message');
  const input: AppendMessageInput = {
    conversationId: parseConversationId(payload.conversationId),
    role: asEnum<ConversationRole>(payload.role, CONVERSATION_ROLES, 'role'),
    content: asString(payload.content, 'content', {
      min: 1,
      max: CONVERSATION_MESSAGE_MAX_LENGTH,
    }),
  };
  if (payload.tokenCount !== undefined) {
    if (payload.tokenCount === null) {
      input.tokenCount = null;
    } else {
      input.tokenCount = asInteger(payload.tokenCount, 'tokenCount', { min: 0, max: 1_000_000 });
    }
  }
  if (payload.metadata !== undefined) {
    if (payload.metadata === null) {
      input.metadata = null;
    } else {
      const record = asRecord(payload.metadata, 'metadata');
      input.metadata = record;
    }
  }
  return input;
}

export function registerConversationsIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_LIST);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().conversations.list();
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_GET);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_GET, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id'], 'payload');
    const id = parseConversationId(payload.id);
    try {
      return getCoreServices().conversations.get(id);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Conversation could not be loaded.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_CREATE);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_CREATE, async (event, ...args) => {
    assertTrustedRenderer(event);
    if (args.length > 1) {
      throw new Error('Unexpected IPC arguments');
    }
    const input = args.length === 0 ? {} : parseCreateInput(args[0]);
    try {
      return getCoreServices().conversations.create(input);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Conversation could not be created.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_RENAME);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_RENAME, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id', 'title'], 'payload');
    const id = parseConversationId(payload.id);
    const title = asString(payload.title, 'title', {
      min: 1,
      max: CONVERSATION_TITLE_MAX_LENGTH,
    });
    try {
      return getCoreServices().conversations.rename(id, title);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Conversation could not be renamed.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_DELETE);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id'], 'payload');
    const id = parseConversationId(payload.id);
    try {
      return { removed: getCoreServices().conversations.remove(id) };
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Conversation could not be deleted.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_SET_MODEL);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_SET_MODEL, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id', 'model'], 'payload');
    const id = parseConversationId(payload.id);
    const model =
      payload.model === null
        ? null
        : asString(payload.model, 'model', { min: 1, max: CONVERSATION_MODEL_MAX_LENGTH });
    try {
      return getCoreServices().conversations.setModel(id, model);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Conversation model could not be updated.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_APPEND_MESSAGE);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_APPEND_MESSAGE, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const input = parseAppendMessage(args[0]);
    try {
      return getCoreServices().conversations.appendMessage(input);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Message could not be saved.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONVERSATIONS_LIST_MESSAGES);
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST_MESSAGES, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id'], 'payload');
    const id = parseConversationId(payload.id);
    try {
      return getCoreServices().conversations.listMessages(id);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Messages could not be loaded.'));
    }
  });
}
