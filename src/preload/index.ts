import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '../shared/ipc-channels';
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
import type { AppSettings, SettingKey } from '../shared/settings';
import type { PermissionCapability, PermissionOverview } from '../shared/permissions';
import type { ProviderInput, ProviderSummary } from '../shared/providers';

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
};

contextBridge.exposeInMainWorld('jarvis', api);
