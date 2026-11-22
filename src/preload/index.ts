import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '../shared/ipc-channels';
import type { AppInfo, JarvisApi, QuitResult, SystemMetrics } from '../shared/types';

const allowedChannels = new Set<string>(Object.values(IPC_CHANNELS));

function invoke<T>(channel: IpcChannel): Promise<T> {
  if (!allowedChannels.has(channel)) {
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel) as Promise<T>;
}

const api: JarvisApi = {
  getAppInfo: () => invoke<AppInfo>(IPC_CHANNELS.APP_GET_INFO),
  getSystemMetrics: () => invoke<SystemMetrics>(IPC_CHANNELS.SYSTEM_GET_METRICS),
  quitApp: () => invoke<QuitResult>(IPC_CHANNELS.APP_QUIT),
};

contextBridge.exposeInMainWorld('jarvis', api);
