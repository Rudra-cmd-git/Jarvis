import type { PermissionCapability } from './permissions';

export type ControlActionId =
  | 'app.launch'
  | 'clipboard.read'
  | 'screen.capture'
  | 'window.minimize'
  | 'window.maximize'
  | 'window.restore'
  | 'window.focus';

export interface ControlAppEntry {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

export interface ControlCapability {
  id: ControlActionId;
  label: string;
  permission: PermissionCapability | null;
  available: boolean;
}

export interface ControlStatus {
  paused: boolean;
  allowlistCount: number;
  capabilities: ControlCapability[];
  screenshotDirectory: string;
}

export interface ControlLaunchResult {
  launched: boolean;
  appId: string;
}

export interface ControlClipboardResult {
  text: string;
  length: number;
  truncated: boolean;
}

export interface ControlScreenshotResult {
  filePath: string;
  bytes: number;
  capturedAt: number;
}

export interface ControlWindowAction {
  action: 'minimize' | 'maximize' | 'restore' | 'focus';
}

export interface ControlWindowResult {
  action: ControlWindowAction['action'];
  applied: boolean;
}

export interface ControlIndicatorEvent {
  kind: 'launch' | 'clipboard' | 'screenshot' | 'emergency-stop';
  active: boolean;
  label: string;
  timestamp: number;
}

export const CONTROL_ACTION_IDS: readonly ControlActionId[] = [
  'app.launch',
  'clipboard.read',
  'screen.capture',
  'window.minimize',
  'window.maximize',
  'window.restore',
  'window.focus',
];

export const CONTROL_WINDOW_ACTIONS: readonly ControlWindowAction['action'][] = [
  'minimize',
  'maximize',
  'restore',
  'focus',
];

export const CONTROL_APP_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const CONTROL_APP_PATH_PATTERN = /^(?:[A-Za-z]:\\|\\\\)[^\u0000-\u001f]{1,499}$/;
export const CONTROL_CLIPBOARD_MAX_LENGTH = 4_000;
