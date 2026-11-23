import type { ControlWindowAction, ControlAppEntry } from '../../shared/control';

export interface CapturedScreenshot {
  filePath: string;
  bytes: number;
  capturedAt: number;
}

/** Main-process boundary for OS interactions; implemented by the Electron adapter. */
export interface ControlPlatform {
  now(): number;
  clipboardText(): Promise<string>;
  openPath(targetPath: string): Promise<string | null>;
  captureScreenshot(directory: string): Promise<CapturedScreenshot>;
  windowAction(senderId: number, action: ControlWindowAction['action']): boolean;
}

export interface ControlServiceOptions {
  screenshotDirectory: string;
  platform: ControlPlatform;
  onEmergencyStop?: () => void;
}

export type ControlErrorCode =
  | 'permission_denied'
  | 'paused'
  | 'validation'
  | 'not_found'
  | 'platform_error';

export class ControlError extends Error {
  readonly code: ControlErrorCode;

  constructor(code: ControlErrorCode, message: string) {
    super(message);
    this.name = 'ControlError';
    this.code = code;
  }
}

export function normalizeAppEntry(value: ControlAppEntry): ControlAppEntry {
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    path: value.path.trim(),
    enabled: value.enabled,
  };
}

export function isSameAppPath(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
