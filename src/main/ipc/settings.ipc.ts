import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AppSettings, SettingKey } from '../../shared/settings';
import { isSettingKey, isValidSettingValue } from '../../shared/settings';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  IpcValidationError,
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
} from '../utils/validation';

function parseKey(payload: Record<string, unknown>): SettingKey {
  const key = asString(payload.key, 'key', { min: 1, max: 80 });
  if (!isSettingKey(key)) {
    throw new IpcValidationError('Unknown setting key.');
  }
  return key;
}

export function registerSettingsIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET_ALL);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async (event, ...args): Promise<AppSettings> => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().settings.getAll();
  });

  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SET);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (event, ...args): Promise<AppSettings> => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);

    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['key', 'value'], 'payload');
    const key = parseKey(payload);

    if (!isValidSettingValue(key, payload.value)) {
      throw new IpcValidationError(`Invalid value for setting "${key}".`);
    }

    const services = getCoreServices();
    services.settings.set(key, payload.value);
    services.activity.tryRecord({
      category: 'settings',
      severity: 'info',
      action: 'settings.updated',
      outcome: 'success',
      detail: `Setting ${key} was updated.`,
    });

    return services.settings.getAll();
  });

  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_RESET);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, async (event, ...args): Promise<AppSettings> => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);

    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['key'], 'payload');
    const key = parseKey(payload);

    const services = getCoreServices();
    services.settings.reset(key);
    services.activity.tryRecord({
      category: 'settings',
      severity: 'info',
      action: 'settings.reset',
      outcome: 'success',
      detail: `Setting ${key} was reset to its default.`,
    });

    return services.settings.getAll();
  });
}
