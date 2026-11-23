import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { SecretStorageStatus } from '../../shared/types';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

const SECRET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;

interface SecretPayload {
  id: string;
  value: string;
}

function parseSecretPayload(payload: Record<string, unknown>): SecretPayload {
  return {
    id: asString(payload.id, 'id', { min: 1, max: 120, pattern: SECRET_ID_PATTERN }),
    // The value is intentionally never echoed in validation messages.
    value: asString(payload.value, 'value', { min: 1, max: 8192 }),
  };
}

export function registerSecretsIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.SECRETS_GET_STATUS);
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_GET_STATUS,
    async (event, ...args): Promise<SecretStorageStatus> => {
      assertTrustedRenderer(event);
      assertNoArguments(args);
      return getCoreServices().secrets.status();
    },
  );

  ipcMain.removeHandler(IPC_CHANNELS.SECRETS_SET);
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_SET,
    async (event, ...args): Promise<SecretStorageStatus> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(payload, ['id', 'value'], 'payload');
      const { id, value } = parseSecretPayload(payload);

      const services = getCoreServices();
      try {
        services.permissions.require('credentials.manage');
        services.secrets.setSecret(id, value);
        services.activity.tryRecord({
          category: 'security',
          severity: 'info',
          action: 'secret.stored',
          outcome: 'success',
          detail: `Credential ${id} was encrypted and stored.`,
        });
        return services.secrets.status();
      } catch (error) {
        services.activity.tryRecord({
          category: 'security',
          severity: 'error',
          action: 'secret.store_failed',
          outcome: 'failure',
          detail: `Credential ${id} could not be stored: ${toPublicErrorMessage(
            error,
            'unknown error',
          )}`,
        });
        throw new Error(toPublicErrorMessage(error, 'Credential could not be stored.'));
      }
    },
  );

  ipcMain.removeHandler(IPC_CHANNELS.SECRETS_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_DELETE,
    async (event, ...args): Promise<SecretStorageStatus> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(payload, ['id'], 'payload');
      const id = asString(payload.id, 'id', { min: 1, max: 120, pattern: SECRET_ID_PATTERN });

      const services = getCoreServices();
      try {
        services.permissions.require('credentials.manage');
        const removed = services.secrets.deleteSecret(id);
        services.activity.tryRecord({
          category: 'security',
          severity: 'info',
          action: removed ? 'secret.deleted' : 'secret.delete_noop',
          outcome: 'success',
          detail: `Credential ${id} ${removed ? 'was deleted' : 'was not present'}.`,
        });
        return services.secrets.status();
      } catch (error) {
        services.activity.tryRecord({
          category: 'security',
          severity: 'error',
          action: 'secret.delete_failed',
          outcome: 'failure',
          detail: `Credential ${id} could not be deleted: ${toPublicErrorMessage(
            error,
            'unknown error',
          )}`,
        });
        throw new Error(toPublicErrorMessage(error, 'Credential could not be deleted.'));
      }
    },
  );
}
