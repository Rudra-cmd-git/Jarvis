export type ConversationRole = 'system' | 'user' | 'assistant';

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string | null;
  messageCount: number;
  preview: string | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: number;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
}

export interface ConversationInput {
  title?: string;
  model?: string | null;
}

export interface AppendMessageInput {
  conversationId: string;
  role: ConversationRole;
  content: string;
  tokenCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

export const CONVERSATION_ROLES: readonly ConversationRole[] = ['system', 'user', 'assistant'];
export const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
export const CONVERSATION_TITLE_MAX_LENGTH = 120;
export const CONVERSATION_MODEL_MAX_LENGTH = 120;
export const CONVERSATION_MESSAGE_MAX_LENGTH = 100_000;
