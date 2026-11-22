import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { SystemMetrics } from '../../shared/types';
import { systemMonitor } from '../services/system-monitor.service';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';

export function registerSystemIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_GET_METRICS);
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_METRICS, async (event, ...args): Promise<SystemMetrics> => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return systemMonitor.getMetrics();
  });
}
