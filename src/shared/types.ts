import type { AppSettings, SettingKey } from './settings';
import type { PermissionCapability, PermissionOverview } from './permissions';
import type { ProviderInput, ProviderSummary } from './providers';
import type {
  AppendMessageInput,
  ConversationDetail,
  ConversationInput,
  ConversationMessage,
  ConversationSummary,
} from './conversations';
import type {
  AiCancelResult,
  AiChatRequest,
  AiModelListResult,
  AiStatus,
  AiStreamEventPayload,
  AiStreamStartResult,
} from './ai';
import type {
  ControlAppEntry,
  ControlClipboardResult,
  ControlIndicatorEvent,
  ControlLaunchResult,
  ControlScreenshotResult,
  ControlStatus,
  ControlWindowAction,
  ControlWindowResult,
} from './control';

export type ViewId =
  | 'dashboard'
  | 'chat'
  | 'pc-control'
  | 'automation'
  | 'developer-hub'
  | 'knowledge'
  | 'productivity'
  | 'settings';

export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  sqliteAvailable: boolean;
  sqliteDetail: string;
  startedAt: number;
}

export interface CpuMetrics {
  usagePercent: number;
  cores: number;
  model: string;
}

export interface MemoryMetrics {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface StorageMetrics {
  available: boolean;
  mount: string;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  usagePercent: number | null;
  detail: string;
}

export interface ProcessMetrics {
  pid: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  uptimeSeconds: number;
}

export interface SystemIdentity {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptimeSeconds: number;
}

export interface SystemMetrics {
  sampledAt: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  storage: StorageMetrics;
  process: ProcessMetrics;
  system: SystemIdentity;
}

export interface QuitResult {
  accepted: boolean;
}

export type ActivityCategory =
  | 'app'
  | 'database'
  | 'settings'
  | 'provider'
  | 'permission'
  | 'security'
  | 'control';

export type ActivitySeverity = 'info' | 'warning' | 'error';

export type ActivityOutcome = 'success' | 'failure' | 'allowed' | 'denied' | 'info';

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  'app',
  'database',
  'settings',
  'provider',
  'permission',
  'security',
  'control',
];

export const ACTIVITY_SEVERITIES: readonly ActivitySeverity[] = ['info', 'warning', 'error'];

export interface ActivityEntry {
  id: string;
  timestamp: number;
  category: ActivityCategory;
  severity: ActivitySeverity;
  action: string;
  outcome: ActivityOutcome;
  detail: string | null;
}

export interface ActivityFilter {
  category?: ActivityCategory;
  severity?: ActivitySeverity;
  limit?: number;
  query?: string;
}

export interface MigrationInfo {
  version: number;
  name: string;
  appliedAt: number;
}

export interface DatabaseStatus {
  initialized: boolean;
  filePath: string;
  schemaVersion: number;
  journalMode: string;
  appliedMigrations: MigrationInfo[];
  error: string | null;
}

export interface SecretStorageStatus {
  available: boolean;
  backend: string;
  entryCount: number;
  error: string | null;
}

export interface CoreStatus {
  database: DatabaseStatus;
  secretStorage: SecretStorageStatus;
}

export type PermissionAction = 'grant' | 'deny' | 'revoke';

export interface JarvisApi {
  getAppInfo(): Promise<AppInfo>;
  getSystemMetrics(): Promise<SystemMetrics>;
  quitApp(): Promise<QuitResult>;

  getDatabaseStatus(): Promise<CoreStatus>;

  getSettings(): Promise<AppSettings>;
  setSetting<K extends SettingKey>(key: K, value: AppSettings[K]): Promise<AppSettings>;
  resetSetting(key: SettingKey): Promise<AppSettings>;

  getSecretStatus(): Promise<SecretStorageStatus>;
  setSecret(id: string, value: string): Promise<SecretStorageStatus>;
  deleteSecret(id: string): Promise<SecretStorageStatus>;

  listProviders(): Promise<ProviderSummary[]>;
  saveProvider(input: ProviderInput): Promise<ProviderSummary>;
  removeProvider(id: string): Promise<{ removed: boolean }>;
  setActiveProvider(id: string): Promise<ProviderSummary[]>;

  listPermissions(): Promise<PermissionOverview>;
  setPermission(
    capability: PermissionCapability,
    action: PermissionAction,
  ): Promise<PermissionOverview>;

  listActivity(filter?: ActivityFilter): Promise<ActivityEntry[]>;

  listConversations(): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<ConversationDetail>;
  createConversation(input?: ConversationInput): Promise<ConversationSummary>;
  renameConversation(id: string, title: string): Promise<ConversationSummary>;
  deleteConversation(id: string): Promise<{ removed: boolean }>;
  setConversationModel(id: string, model: string | null): Promise<ConversationSummary>;
  appendConversationMessage(input: AppendMessageInput): Promise<ConversationMessage>;
  listConversationMessages(id: string): Promise<ConversationMessage[]>;

  getAiStatus(): Promise<AiStatus>;
  listAiModels(providerId?: string): Promise<AiModelListResult>;
  startChatStream(requestId: string, request: AiChatRequest): Promise<AiStreamStartResult>;
  cancelChatStream(requestId: string): Promise<AiCancelResult>;
  onChatStreamEvent(listener: (payload: AiStreamEventPayload) => void): () => void;

  getControlStatus(): Promise<ControlStatus>;
  addControlApp(entry: ControlAppEntry): Promise<ControlAppEntry[]>;
  removeControlApp(id: string): Promise<ControlAppEntry[]>;
  launchControlApp(id: string): Promise<ControlLaunchResult>;
  readControlClipboard(): Promise<ControlClipboardResult>;
  captureControlScreenshot(): Promise<ControlScreenshotResult>;
  controlWindowAction(action: ControlWindowAction['action']): Promise<ControlWindowResult>;
  emergencyStop(): Promise<{ paused: boolean }>;
  resumeControl(): Promise<{ paused: boolean }>;
  onControlEvent(listener: (payload: ControlIndicatorEvent) => void): () => void;
}
