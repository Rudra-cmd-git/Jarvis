import { randomUUID } from 'node:crypto';
import type {
  AppendMessageInput,
  ConversationDetail,
  ConversationInput,
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
} from '../../shared/conversations';
import {
  CONVERSATION_ID_PATTERN,
  CONVERSATION_MESSAGE_MAX_LENGTH,
  CONVERSATION_MODEL_MAX_LENGTH,
  CONVERSATION_ROLES,
  CONVERSATION_TITLE_MAX_LENGTH,
} from '../../shared/conversations';
import type { ActivityLogService } from './activity-log.service';
import type { DatabaseService } from './database.service';

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  model: string | null;
  message_count: number;
  preview: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
  token_count: number | null;
  metadata_json: string | null;
}

export class ConversationNotFoundError extends Error {
  readonly code = 'CONVERSATION_NOT_FOUND';
  constructor() {
    super('Conversation not found.');
    this.name = 'ConversationNotFoundError';
  }
}

export class ConversationValidationError extends Error {
  readonly code = 'CONVERSATION_VALIDATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'ConversationValidationError';
  }
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRole(value: unknown): value is ConversationRole {
  return typeof value === 'string' && (CONVERSATION_ROLES as readonly string[]).includes(value);
}

export class ConversationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity?: ActivityLogService,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  list(): ConversationSummary[] {
    const rows = this.database.db
      .prepare(
        `SELECT c.id, c.title, c.created_at, c.updated_at, c.model,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
                (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS preview
         FROM conversations c
         ORDER BY c.updated_at DESC, c.created_at DESC`,
      )
      .all() as unknown as ConversationRow[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      model: row.model,
      messageCount: Number(row.message_count ?? 0),
      preview: row.preview ? row.preview.slice(0, 140) : null,
    }));
  }

  get(id: string): ConversationDetail {
    const conversation = this.getRow(id);
    if (!conversation) {
      throw new ConversationNotFoundError();
    }
    return {
      conversation: this.toSummary(conversation, this.messageCount(id), this.preview(id)),
      messages: this.listMessages(id),
    };
  }

  create(input: ConversationInput = {}): ConversationSummary {
    const title = this.validateTitle(input.title ?? 'New conversation');
    const model =
      input.model === undefined || input.model === null
        ? null
        : this.validateModel(input.model);
    const id = this.createId();
    const now = this.now();

    this.database.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at, model)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, title, now, now, model);

    this.activity?.tryRecord({
      category: 'app',
      severity: 'info',
      action: 'conversation.created',
      outcome: 'success',
      detail: `${title} (${id})`,
    });

    return {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      model,
      messageCount: 0,
      preview: null,
    };
  }

  rename(id: string, title: string): ConversationSummary {
    const existing = this.getRow(id);
    if (!existing) {
      throw new ConversationNotFoundError();
    }
    const nextTitle = this.validateTitle(title);
    const now = this.now();
    this.database.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(nextTitle, now, id);

    this.activity?.tryRecord({
      category: 'app',
      severity: 'info',
      action: 'conversation.renamed',
      outcome: 'success',
      detail: `${nextTitle} (${id})`,
    });

    return this.toSummary(
      { ...existing, title: nextTitle, updated_at: now },
      this.messageCount(id),
      this.preview(id),
    );
  }

  remove(id: string): boolean {
    const existing = this.getRow(id);
    if (!existing) {
      return false;
    }
    this.database.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);

    this.activity?.tryRecord({
      category: 'app',
      severity: 'info',
      action: 'conversation.deleted',
      outcome: 'success',
      detail: `${existing.title} (${id})`,
    });

    return true;
  }

  setModel(id: string, model: string | null): ConversationSummary {
    const existing = this.getRow(id);
    if (!existing) {
      throw new ConversationNotFoundError();
    }
    const nextModel = model === null ? null : this.validateModel(model);
    const now = this.now();
    this.database.db
      .prepare('UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?')
      .run(nextModel, now, id);

    return this.toSummary(
      { ...existing, model: nextModel, updated_at: now },
      this.messageCount(id),
      this.preview(id),
    );
  }

  appendMessage(input: AppendMessageInput): ConversationMessage {
    if (!isRole(input.role)) {
      throw new ConversationValidationError('Invalid message role.');
    }
    const conversation = this.getRow(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError();
    }
    const content = input.content.trim();
    if (content.length < 1 || content.length > CONVERSATION_MESSAGE_MAX_LENGTH) {
      throw new ConversationValidationError('Message content has an invalid length.');
    }
    if (input.tokenCount !== undefined && input.tokenCount !== null && !Number.isInteger(input.tokenCount)) {
      throw new ConversationValidationError('Token count must be an integer.');
    }

    const id = this.createId();
    const createdAt = this.now();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    this.database.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.conversationId, input.role, content, createdAt, input.tokenCount ?? null, metadataJson);

    this.database.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(createdAt, input.conversationId);

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content,
      createdAt,
      tokenCount: input.tokenCount ?? null,
      metadata: input.metadata ?? null,
    };
  }

  listMessages(conversationId: string): ConversationMessage[] {
    const conversation = this.getRow(conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError();
    }
    const rows = this.database.db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at, token_count, metadata_json
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(conversationId) as unknown as MessageRow[];

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: isRole(row.role) ? row.role : 'assistant',
      content: row.content,
      createdAt: row.created_at,
      tokenCount: row.token_count,
      metadata: parseMetadata(row.metadata_json),
    }));
  }

  private getRow(id: string): ConversationRow | undefined {
    if (!CONVERSATION_ID_PATTERN.test(id)) {
      return undefined;
    }
    return this.database.db
      .prepare(
        `SELECT c.id, c.title, c.created_at, c.updated_at, c.model,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
                (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS preview
         FROM conversations c
         WHERE c.id = ?`,
      )
      .get(id) as unknown as ConversationRow | undefined;
  }

  private messageCount(id: string): number {
    const row = this.database.db
      .prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?')
      .get(id) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  private preview(id: string): string | null {
    const row = this.database.db
      .prepare(
        `SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(id) as { content?: string } | undefined;
    return row?.content ? row.content.slice(0, 140) : null;
  }

  private toSummary(
    row: ConversationRow,
    messageCount: number,
    preview: string | null,
  ): ConversationSummary {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      model: row.model,
      messageCount,
      preview,
    };
  }

  private validateTitle(value: string): string {
    const title = value.trim();
    if (title.length < 1 || title.length > CONVERSATION_TITLE_MAX_LENGTH) {
      throw new ConversationValidationError(
        `Title must be between 1 and ${CONVERSATION_TITLE_MAX_LENGTH} characters.`,
      );
    }
    return title;
  }

  private validateModel(value: string): string {
    const model = value.trim();
    if (model.length < 1 || model.length > CONVERSATION_MODEL_MAX_LENGTH) {
      throw new ConversationValidationError('Model identifier has an invalid length.');
    }
    return model;
  }
}
