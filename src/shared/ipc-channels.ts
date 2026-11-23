export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  APP_QUIT: 'app:quit',
  SYSTEM_GET_METRICS: 'system:get-metrics',
  DATABASE_GET_STATUS: 'database:get-status',
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  SECRETS_GET_STATUS: 'secrets:get-status',
  SECRETS_SET: 'secrets:set',
  SECRETS_DELETE: 'secrets:delete',
  PROVIDERS_LIST: 'providers:list',
  PROVIDERS_SAVE: 'providers:save',
  PROVIDERS_REMOVE: 'providers:remove',
  PROVIDERS_SET_ACTIVE: 'providers:set-active',
  PERMISSIONS_LIST: 'permissions:list',
  PERMISSIONS_SET: 'permissions:set',
  ACTIVITY_LIST: 'activity:list',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
