import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AppInfo, QuitResult } from '../../shared/types';
import { getAppInfo } from '../services/app-info.service';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';

export function registerAppIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.APP_GET_INFO);
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async (event, ...args): Promise<AppInfo> => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getAppInfo();
  });

  ipcMain.removeHandler(IPC_CHANNELS.APP_QUIT);
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async (event, ...args): Promise<QuitResult> => {
    assertTrustedRenderer(event);
    assertNoArguments(args);

    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options = {
      type: 'question' as const,
      title: 'Quit J.A.R.V.I.S.?',
      message: 'Stop the local assistant window?',
      detail: 'No background tasks are running in this build.',
      buttons: ['Stay', 'Quit JARVIS'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };

    const result = focusedWindow
      ? await dialog.showMessageBox(focusedWindow, options)
      : await dialog.showMessageBox(options);

    const accepted = result.response === 1;

    if (accepted) {
      try {
        getCoreServices().activity.tryRecord({
          category: 'app',
          severity: 'info',
          action: 'app.quit_confirmed',
          outcome: 'success',
          detail: 'Quit was confirmed by the user.',
        });
      } catch {
        // Shutdown must not be blocked by a logging failure.
      }

      setImmediate(() => {
        app.quit();
      });
    }

    return { accepted };
  });
}
