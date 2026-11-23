import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { CoreStatus } from '../../shared/types';
import { getCoreStatus } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';

export function registerDatabaseIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.DATABASE_GET_STATUS);
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_GET_STATUS,
    async (event, ...args): Promise<CoreStatus> => {
      assertTrustedRenderer(event);
      assertNoArguments(args);
      return getCoreStatus();
    },
  );
}
