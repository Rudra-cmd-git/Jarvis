export type ViewId =
  | "dashboard"
  | "chat"
  | "conversations"
  | "memory"
  | "tools"
  | "automations"
  | "integrations"
  | "settings";

export interface Permissions {
  appsLaunch: boolean;
  webOpen: boolean;
  filesRead: boolean;
  filesSearch: boolean;
  notesWrite: boolean;
  notesDelete: boolean;
  systemInfo: boolean;
  externalSend: boolean;
}

export interface VoiceSettings {
  ttsEnabled: boolean;
  autoSpeak: boolean;
  rate: number;
  pitch: number;
  voice: string;
  sttMode: "auto" | "web" | "whisper";
  whisperUrl: string;
  whisperModel: string;
  language: string;
}

export interface SearchSettings {
  provider: "none" | "brave" | "tavily" | "searxng";
  searxUrl: string;
  maxResults: number;
  enabled: boolean;
}

export interface AppSettings {
  theme: string;
  accent: string;
  reducedMotion: boolean;
  memoryEnabled: boolean;
  notifications: boolean;
  startupView: string;
  historyLimit: number;
  requireApprovals: boolean;
  activeProviderId: string | null;
  backupProviderId: string | null;
  permissions: Permissions;
  voice: VoiceSettings;
  search: SearchSettings;
}

export interface Provider {
  id: string;
  name: string;
  kind: "openai" | "gemini" | "custom";
  baseUrl: string;
  model: string;
  enabled: boolean;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  hasKey: boolean;
}

export interface ProviderInput {
  id?: string | null;
  name: string;
  kind: "openai" | "gemini" | "custom";
  baseUrl: string;
  model: string;
  enabled: boolean;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  models: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  providerId: string | null;
  model: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

export interface Memory {
  id: string;
  kind: "preference" | "fact" | "note";
  content: string;
  createdAt: string;
  pinned: boolean;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  lastRunAt: string | null;
}

export interface ActivityEntry {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  createdAt: string;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  permission: string;
  category: string;
  requiresApproval: boolean;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  detail: unknown;
}

export interface ApprovalRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  preview: string;
}

export type ToolOutcome =
  | { status: "completed"; result: ToolResult }
  | { status: "approvalRequired"; approval: ApprovalRequest }
  | { status: "denied"; reason: string };

export interface ChatResult {
  conversationId: string;
  message: Message;
  tool: { tool: string; args: Record<string, unknown>; reason: string } | null;
  providerName: string;
  model: string;
  fallbackUsed: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchHealth {
  provider: string;
  enabled: boolean;
  hasKey: boolean;
  configured: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
  dataDir: string;
  tauriVersion: string;
}

export interface SystemSnapshot {
  cpuName: string;
  cores: number;
  loadPercent: number;
  totalMemGb: number;
  freeMemGb: number;
  os: string;
}

export type CoreState = "offline" | "idle" | "connecting" | "thinking" | "streaming" | "speaking" | "error" | "listening";

export interface ChatStatusEvent {
  requestId: string;
  phase: "connecting" | "streaming" | "fallback" | "done" | "error";
  provider?: string;
  model?: string;
  detail?: string;
  fallbackUsed?: boolean;
}

export interface ChatDeltaEvent {
  requestId: string;
  text: string;
}
