import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { ConversationService } from '../../src/main/services/conversation.service';
import { DatabaseService } from '../../src/main/services/database.service';

let directory: string;
let database: DatabaseService;
let conversations: ConversationService;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-conversation-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  conversations = new ConversationService(database, new ActivityLogService(database));
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('ConversationService', () => {
  it('creates, lists and retrieves conversations with messages', () => {
    const created = conversations.create({ title: 'First chat', model: 'model-a' });
    expect(created.title).toBe('First chat');
    expect(created.model).toBe('model-a');
    expect(created.messageCount).toBe(0);

    const message = conversations.appendMessage({
      conversationId: created.id,
      role: 'user',
      content: 'Hello',
    });
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello');

    const assistant = conversations.appendMessage({
      conversationId: created.id,
      role: 'assistant',
      content: 'Hi there',
      tokenCount: 4,
      metadata: { finishReason: 'stop' },
    });
    expect(assistant.tokenCount).toBe(4);

    const detail = conversations.get(created.id);
    expect(detail.conversation.messageCount).toBe(2);
    expect(detail.messages.map((entry) => entry.role)).toEqual(['user', 'assistant']);
    expect(detail.messages[1].metadata).toEqual({ finishReason: 'stop' });
    expect(conversations.list()).toHaveLength(1);
  });

  it('renames, changes model and deletes a conversation with its messages', () => {
    const created = conversations.create({ title: 'Rename me' });
    const renamed = conversations.rename(created.id, 'Renamed');
    expect(renamed.title).toBe('Renamed');

    const withModel = conversations.setModel(created.id, 'model-b');
    expect(withModel.model).toBe('model-b');

    conversations.appendMessage({
      conversationId: created.id,
      role: 'user',
      content: 'message',
    });
    expect(conversations.remove(created.id)).toBe(true);
    expect(conversations.list()).toHaveLength(0);
    expect(() => conversations.get(created.id)).toThrow();
  });

  it('orders messages by creation time and rejects invalid input', () => {
    const created = conversations.create();
    conversations.appendMessage({ conversationId: created.id, role: 'user', content: 'first' });
    conversations.appendMessage({ conversationId: created.id, role: 'assistant', content: 'second' });

    const messages = conversations.listMessages(created.id);
    expect(messages.map((entry) => entry.content)).toEqual(['first', 'second']);

    expect(() => conversations.create({ title: '' })).toThrow();
    expect(() =>
      conversations.appendMessage({ conversationId: created.id, role: 'user', content: '   ' }),
    ).toThrow();
    expect(() => conversations.get('missing')).toThrow();
    expect(conversations.remove('missing')).toBe(false);
  });

  it('stores a preview from the latest message', () => {
    const created = conversations.create({ title: 'Preview' });
    conversations.appendMessage({ conversationId: created.id, role: 'user', content: 'x'.repeat(200) });
    const listed = conversations.list()[0];
    expect(listed.preview).toHaveLength(140);
  });
});
