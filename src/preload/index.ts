import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '../shared/ipc-channels';
import type {
  AiCancelResult,
  AiChatRequest,
  AiModelListResult,
  AiStatus,
  AiStreamEventPayload,
  AiStreamStartResult,
} from '../shared/ai';
import type {
  AppInfo,
  ActivityEntry,
  ActivityFilter,
  CoreStatus,
  JarvisApi,
  QuitResult,
  SecretStorageStatus,
  SystemMetrics,
} from '../shared/types';
import type {
  ControlAppEntry,
  ControlClipboardResult,
  ControlIndicatorEvent,
  ControlLaunchResult,
  ControlScreenshotResult,
  ControlStatus,
  ControlWindowResult,
} from '../shared/control';
import type { AppSettings, SettingKey } from '../shared/settings';
import type { PermissionCapability, PermissionOverview } from '../shared/permissions';
import type { ProviderInput, ProviderSummary } from '../shared/providers';
import type {
  AppendMessageInput,
  ConversationDetail,
  ConversationInput,
  ConversationMessage,
  ConversationSummary,
} from '../shared/conversations';

const allowedChannels = new Set<string>(Object.values(IPC_CHANNELS));

function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  if (!allowedChannels.has(channel)) {
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: JarvisApi = {
  getAppInfo: () => invoke<AppInfo>(IPC_CHANNELS.APP_GET_INFO),
  getSystemMetrics: () => invoke<SystemMetrics>(IPC_CHANNELS.SYSTEM_GET_METRICS),
  quitApp: () => invoke<QuitResult>(IPC_CHANNELS.APP_QUIT),

  getDatabaseStatus: () => invoke<CoreStatus>(IPC_CHANNELS.DATABASE_GET_STATUS),

  getSettings: () => invoke<AppSettings>(IPC_CHANNELS.SETTINGS_GET_ALL),
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) =>
    invoke<AppSettings>(IPC_CHANNELS.SETTINGS_SET, { key, value }),
  resetSetting: (key: SettingKey) => invoke<AppSettings>(IPC_CHANNELS.SETTINGS_RESET, { key }),

  getSecretStatus: () => invoke<SecretStorageStatus>(IPC_CHANNELS.SECRETS_GET_STATUS),
  setSecret: (id: string, value: string) =>
    invoke<SecretStorageStatus>(IPC_CHANNELS.SECRETS_SET, { id, value }),
  deleteSecret: (id: string) => invoke<SecretStorageStatus>(IPC_CHANNELS.SECRETS_DELETE, { id }),

  listProviders: () => invoke<ProviderSummary[]>(IPC_CHANNELS.PROVIDERS_LIST),
  saveProvider: (input: ProviderInput) =>
    invoke<ProviderSummary>(IPC_CHANNELS.PROVIDERS_SAVE, input),
  removeProvider: (id: string) =>
    invoke<{ removed: boolean }>(IPC_CHANNELS.PROVIDERS_REMOVE, { id }),
  setActiveProvider: (id: string) =>
    invoke<ProviderSummary[]>(IPC_CHANNELS.PROVIDERS_SET_ACTIVE, { id }),

  listPermissions: () => invoke<PermissionOverview>(IPC_CHANNELS.PERMISSIONS_LIST),
  setPermission: (capability: PermissionCapability, action) =>
    invoke<PermissionOverview>(IPC_CHANNELS.PERMISSIONS_SET, { capability, action }),

  listActivity: (filter?: ActivityFilter) =>
    invoke<ActivityEntry[]>(IPC_CHANNELS.ACTIVITY_LIST, filter ?? {}),

  listConversations: () =>
    invoke<ConversationSummary[]>(IPC_CHANNELS.CONVERSATIONS_LIST),
  getConversation: (id: string) =>
    invoke<ConversationDetail>(IPC_CHANNELS.CONVERSATIONS_GET, { id }),
  createConversation: (input?: ConversationInput) =>
    invoke<ConversationSummary>(IPC_CHANNELS.CONVERSATIONS_CREATE, input ?? {}),
  renameConversation: (id: string, title: string) =>
    invoke<ConversationSummary>(IPC_CHANNELS.CONVERSATIONS_RENAME, { id, title }),
  deleteConversation: (id: string) =>
    invoke<{ removed: boolean }>(IPC_CHANNELS.CONVERSATIONS_DELETE, { id }),
  setConversationModel: (id: string, model: string | null) =>
    invoke<ConversationSummary>(IPC_CHANNELS.CONVERSATIONS_SET_MODEL, { id, model }),
  appendConversationMessage: (input: AppendMessageInput) =>
    invoke<ConversationMessage>(IPC_CHANNELS.CONVERSATIONS_APPEND_MESSAGE, input),
  listConversationMessages: (id: string) =>
    invoke<ConversationMessage[]>(IPC_CHANNELS.CONVERSATIONS_LIST_MESSAGES, { id }),

  getControlStatus: () => invoke<ControlStatus>(IPC_CHANNELS.CONTROL_GET_STATUS),
  addControlApp: (entry: ControlAppEntry) =>
    invoke<ControlAppEntry[]>(IPC_CHANNELS.CONTROL_ADD_APP, entry),
  removeControlApp: (id: string) =>
    invoke<ControlAppEntry[]>(IPC_CHANNELS.CONTROL_REMOVE_APP, { id }),
  launchControlApp: (id: string) =>
    invoke<ControlLaunchResult>(IPC_CHANNELS.CONTROL_LAUNCH_APP, { id }),
  readControlClipboard: () =>
    invoke<ControlClipboardResult>(IPC_CHANNELS.CONTROL_READ_CLIPBOARD),
  captureControlScreenshot: () =>
    invoke<ControlScreenshotResult>(IPC_CHANNELS.CONTROL_CAPTURE_SCREENSHOT),
  controlWindowAction: (action: 'minimize' | 'maximize' | 'restore' | 'focus') =>
    invoke<ControlWindowResult>(IPC_CHANNELS.CONTROL_WINDOW_ACTION, { action }),
  emergencyStop: () => invoke<{ paused: boolean }>(IPC_CHANNELS.CONTROL_EMERGENCY_STOP),
  resumeControl: () => invoke<{ paused: boolean }>(IPC_CHANNELS.CONTROL_RESUME),
  onControlEvent: (listener: (payload: ControlIndicatorEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: ControlIndicatorEvent): void => {
      if (!payload || typeof payload.kind !== 'string' || typeof payload.active !== 'boolean') {
        return;
      }
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.CONTROL_EVENT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONTROL_EVENT, handler);
    };
  },

  getAiStatus: () => invoke<AiStatus>(IPC_CHANNELS.AI_GET_STATUS),
  listAiModels: (providerId?: string) =>
    invoke<AiModelListResult>(
      IPC_CHANNELS.AI_LIST_MODELS,
      providerId === undefined ? {} : { providerId },
    ),
  startChatStream: (requestId: string, request: AiChatRequest) =>
    invoke<AiStreamStartResult>(IPC_CHANNELS.AI_STREAM_START, { requestId, request }),
  cancelChatStream: (requestId: string) =>
    invoke<AiCancelResult>(IPC_CHANNELS.AI_STREAM_CANCEL, { requestId }),
  onChatStreamEvent: (listener: (payload: AiStreamEventPayload) => void) => {
    const handler = (_event: IpcRendererEvent, payload: AiStreamEventPayload): void => {
      if (!payload || typeof payload.requestId !== 'string' || !payload.event) {
        return;
      }
      if (typeof (payload.event as { type?: unknown }).type !== 'string') {
        return;
      }
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_EVENT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_EVENT, handler);
    };
  },
};

contextBridge.exposeInMainWorld('jarvis', api);
