import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  PERMISSION_CATALOG,
  getPermissionDescriptor,
  type PermissionCapability,
  type PermissionOverview,
} from '../../shared/permissions';
import type { PermissionAction } from '../../shared/types';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  IpcValidationError,
  asEnum,
  asRecord,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

const CAPABILITIES = PERMISSION_CATALOG.map((entry) => entry.capability);
const ACTIONS: readonly PermissionAction[] = ['grant', 'deny', 'revoke'];

export function registerPermissionsIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.PERMISSIONS_LIST);
  ipcMain.handle(
    IPC_CHANNELS.PERMISSIONS_LIST,
    async (event, ...args): Promise<PermissionOverview> => {
      assertTrustedRenderer(event);
      assertNoArguments(args);
      return getCoreServices().permissions.list();
    },
  );

  ipcMain.removeHandler(IPC_CHANNELS.PERMISSIONS_SET);
  ipcMain.handle(
    IPC_CHANNELS.PERMISSIONS_SET,
    async (event, ...args): Promise<PermissionOverview> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(payload, ['capability', 'action'], 'payload');
      const capability = asEnum<PermissionCapability>(payload.capability, CAPABILITIES, 'capability');
      const action = asEnum<PermissionAction>(payload.action, ACTIONS, 'action');

      const descriptor = getPermissionDescriptor(capability);
      if (!descriptor.available) {
        throw new IpcValidationError(
          'This capability is not enforced yet and cannot be changed.',
        );
      }

      try {
        const services = getCoreServices();
        if (action === 'grant') {
          return services.permissions.grant(capability);
        }
        if (action === 'deny') {
          return services.permissions.deny(capability);
        }
        return services.permissions.revoke(capability);
      } catch (error) {
        throw new Error(toPublicErrorMessage(error, 'Permission could not be updated.'));
      }
    },
  );
}
