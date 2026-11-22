export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  APP_QUIT: 'app:quit',
  SYSTEM_GET_METRICS: 'system:get-metrics',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
