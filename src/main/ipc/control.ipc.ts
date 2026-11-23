import { ipcMain, type WebContents } from 'electron';
import type { ControlAppEntry, ControlIndicatorEvent } from '../../shared/control';
import {
  CONTROL_APP_ID_PATTERN,
  CONTROL_APP_PATH_PATTERN,
  CONTROL_WINDOW_ACTIONS,
  type ControlWindowAction,
} from '../../shared/control';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asBoolean,
  asEnum,
  asRecord,
  asString,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

function parseAppEntry(value: unknown): ControlAppEntry {
  const payload = asRecord(value, 'entry');
  assertKeys(payload, ['id', 'name', 'path', 'enabled'], 'entry');
  return {
    id: asString(payload.id, 'id', { min: 1, max: 80, pattern: CONTROL_APP_ID_PATTERN }),
    name: asString(payload.name, 'name', { min: 1, max: 80 }),
    path: asString(payload.path, 'path', { min: 1, max: 500, pattern: CONTROL_APP_PATH_PATTERN }),
    enabled: asBoolean(payload.enabled, 'enabled'),
  };
}

function sendIndicator(
  sender: WebContents,
  kind: ControlIndicatorEvent['kind'],
  active: boolean,
  label: string,
): void {
  try {
    if (!sender.isDestroyed()) {
      const payload: ControlIndicatorEvent = { kind, active, label, timestamp: Date.now() };
      sender.send(IPC_CHANNELS.CONTROL_EVENT, payload);
    }
  } catch {
    // A closed renderer must not break the control action.
  }
}

export function registerControlIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_GET_STATUS);
  ipcMain.handle(IPC_CHANNELS.CONTROL_GET_STATUS, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().control.getStatus();
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_ADD_APP);
  ipcMain.handle(IPC_CHANNELS.CONTROL_ADD_APP, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const entry = parseAppEntry(args[0]);
    try {
      return getCoreServices().control.addAllowlist(entry);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Application could not be added.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_REMOVE_APP);
  ipcMain.handle(IPC_CHANNELS.CONTROL_REMOVE_APP, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id'], 'payload');
    const id = asString(payload.id, 'id', { min: 1, max: 80, pattern: CONTROL_APP_ID_PATTERN });
    try {
      return getCoreServices().control.removeAllowlist(id);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Application could not be removed.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_LAUNCH_APP);
  ipcMain.handle(IPC_CHANNELS.CONTROL_LAUNCH_APP, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['id'], 'payload');
    const id = asString(payload.id, 'id', { min: 1, max: 80, pattern: CONTROL_APP_ID_PATTERN });
    const sender = event.sender;
    sendIndicator(sender, 'launch', true, 'Launching application');
    try {
      return await getCoreServices().control.launchApp(id);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Application could not be launched.'));
    } finally {
      sendIndicator(sender, 'launch', false, 'Launching application');
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_READ_CLIPBOARD);
  ipcMain.handle(IPC_CHANNELS.CONTROL_READ_CLIPBOARD, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    const sender = event.sender;
    sendIndicator(sender, 'clipboard', true, 'Reading clipboard');
    try {
      return await getCoreServices().control.readClipboard();
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Clipboard could not be read.'));
    } finally {
      sendIndicator(sender, 'clipboard', false, 'Reading clipboard');
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_CAPTURE_SCREENSHOT);
  ipcMain.handle(IPC_CHANNELS.CONTROL_CAPTURE_SCREENSHOT, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    const sender = event.sender;
    sendIndicator(sender, 'screenshot', true, 'Capturing screen');
    try {
      return await getCoreServices().control.captureScreenshot();
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Screenshot could not be captured.'));
    } finally {
      sendIndicator(sender, 'screenshot', false, 'Capturing screen');
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_WINDOW_ACTION);
  ipcMain.handle(IPC_CHANNELS.CONTROL_WINDOW_ACTION, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertArgumentCount(args, 1);
    const payload = asRecord(args[0], 'payload');
    assertKeys(payload, ['action'], 'payload');
    const action = asEnum<ControlWindowAction['action']>(
      payload.action,
      CONTROL_WINDOW_ACTIONS,
      'action',
    );
    try {
      return getCoreServices().control.windowAction(event.sender.id, action);
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Window action failed.'));
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_EMERGENCY_STOP);
  ipcMain.handle(IPC_CHANNELS.CONTROL_EMERGENCY_STOP, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    sendIndicator(event.sender, 'emergency-stop', true, 'Emergency stop');
    try {
      return getCoreServices().control.emergencyStop();
    } finally {
      sendIndicator(event.sender, 'emergency-stop', false, 'Emergency stop');
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.CONTROL_RESUME);
  ipcMain.handle(IPC_CHANNELS.CONTROL_RESUME, async (event, ...args) => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    try {
      return getCoreServices().control.resume();
    } catch (error) {
      throw new Error(toPublicErrorMessage(error, 'Control could not be resumed.'));
    }
  });
}
