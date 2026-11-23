import type {
  ControlAppEntry,
  ControlCapability,
  ControlClipboardResult,
  ControlLaunchResult,
  ControlScreenshotResult,
  ControlStatus,
  ControlWindowResult,
} from '../../shared/control';
import {
  CONTROL_APP_ID_PATTERN,
  CONTROL_APP_PATH_PATTERN,
  CONTROL_CLIPBOARD_MAX_LENGTH,
  CONTROL_WINDOW_ACTIONS,
} from '../../shared/control';
import type { ActivityLogService } from './activity-log.service';
import {
  ControlError,
  isSameAppPath,
  normalizeAppEntry,
  type ControlServiceOptions,
} from './control-platform';
import type { PermissionsService } from './permissions.service';
import type { SettingsService } from './settings.service';

const CAPABILITIES: readonly ControlCapability[] = [
  {
    id: 'app.launch',
    label: 'Launch allowlisted application',
    permission: 'app.launch',
    available: true,
  },
  {
    id: 'clipboard.read',
    label: 'Read clipboard text',
    permission: 'clipboard.read',
    available: true,
  },
  {
    id: 'screen.capture',
    label: 'Capture a screenshot',
    permission: 'screen.capture',
    available: true,
  },
  {
    id: 'window.minimize',
    label: 'Minimize the JARVIS window',
    permission: null,
    available: true,
  },
  {
    id: 'window.maximize',
    label: 'Maximize or restore the JARVIS window',
    permission: null,
    available: true,
  },
  {
    id: 'window.restore',
    label: 'Restore the JARVIS window',
    permission: null,
    available: true,
  },
  {
    id: 'window.focus',
    label: 'Focus the JARVIS window',
    permission: null,
    available: true,
  },
];

export class ControlService {
  private readonly screenshotDirectory: string;
  private readonly permissions: PermissionsService;
  private readonly activity: ActivityLogService;
  private readonly settings: SettingsService;
  private readonly platform: ControlServiceOptions['platform'];
  private readonly onEmergencyStop?: () => void;
  private paused = false;

  constructor(options: ControlServiceOptions & {
    settings: SettingsService;
    permissions: PermissionsService;
    activity: ActivityLogService;
  }) {
    this.screenshotDirectory = options.screenshotDirectory;
    this.platform = options.platform;
    this.onEmergencyStop = options.onEmergencyStop;
    this.settings = options.settings;
    this.permissions = options.permissions;
    this.activity = options.activity;
  }

  getStatus(): ControlStatus {
    return {
      paused: this.paused,
      allowlistCount: this.listAllowlist().length,
      capabilities: CAPABILITIES.map((entry) => ({ ...entry })),
      screenshotDirectory: this.screenshotDirectory,
    };
  }

  isPaused(): boolean {
    return this.paused;
  }

  listAllowlist(): ControlAppEntry[] {
    return this.settings.get('control.appAllowlist').map((entry) => ({ ...entry }));
  }

  addAllowlist(input: ControlAppEntry): ControlAppEntry[] {
    const entry = normalizeAppEntry(input);
    if (!CONTROL_APP_ID_PATTERN.test(entry.id)) {
      throw new ControlError('validation', 'Application identifier is invalid.');
    }
    if (!CONTROL_APP_PATH_PATTERN.test(entry.path)) {
      throw new ControlError(
        'validation',
        'Enter an absolute Windows path to an application.',
      );
    }
    if (entry.name.length < 1 || entry.name.length > 80) {
      throw new ControlError('validation', 'Application name must be 1–80 characters.');
    }

    const current = this.listAllowlist();
    if (current.length >= 20) {
      throw new ControlError('validation', 'The allowlist is limited to 20 applications.');
    }
    if (
      current.some(
        (item) => item.id === entry.id || isSameAppPath(item.path, entry.path),
      )
    ) {
      throw new ControlError('validation', 'That application is already in the allowlist.');
    }

    const next = [...current, { ...entry, enabled: true }];
    this.settings.set('control.appAllowlist', next);
    this.activity.tryRecord({
      category: 'control',
      severity: 'info',
      action: 'control.allowlist_added',
      outcome: 'success',
      detail: `${entry.name} (${entry.id})`,
    });
    return this.listAllowlist();
  }

  removeAllowlist(id: string): ControlAppEntry[] {
    if (!CONTROL_APP_ID_PATTERN.test(id)) {
      throw new ControlError('validation', 'Application identifier is invalid.');
    }
    const current = this.listAllowlist();
    const entry = current.find((item) => item.id === id);
    if (!entry) {
      throw new ControlError('not_found', 'That application is not in the allowlist.');
    }
    this.settings.set(
      'control.appAllowlist',
      current.filter((item) => item.id !== id),
    );
    this.activity.tryRecord({
      category: 'control',
      severity: 'info',
      action: 'control.allowlist_removed',
      outcome: 'success',
      detail: `${entry.name} (${id})`,
    });
    return this.listAllowlist();
  }

  async launchApp(id: string): Promise<ControlLaunchResult> {
    this.assertReady('app.launch');
    if (!CONTROL_APP_ID_PATTERN.test(id)) {
      throw new ControlError('validation', 'Application identifier is invalid.');
    }
    const entry = this.listAllowlist().find((item) => item.id === id && item.enabled);
    if (!entry) {
      throw new ControlError('not_found', 'That application is not enabled in the allowlist.');
    }

    let error: string | null;
    try {
      error = await this.platform.openPath(entry.path);
    } catch {
      error = 'The platform could not start the application.';
    }

    this.activity.tryRecord({
      category: 'control',
      severity: error ? 'error' : 'info',
      action: error ? 'control.app_launch_failed' : 'control.app_launched',
      outcome: error ? 'failure' : 'success',
      detail: `${entry.name} (${entry.id})${error ? ' · launch failed' : ''}`,
    });

    return { launched: error === null, appId: id };
  }

  async readClipboard(): Promise<ControlClipboardResult> {
    this.assertReady('clipboard.read');
    const fullText = await this.platform.clipboardText();
    const text = fullText.slice(0, CONTROL_CLIPBOARD_MAX_LENGTH);
    this.activity.tryRecord({
      category: 'control',
      severity: 'info',
      action: 'control.clipboard_read',
      outcome: 'success',
      detail: `Read ${fullText.length} character(s)`,
    });
    return {
      text,
      length: fullText.length,
      truncated: fullText.length > CONTROL_CLIPBOARD_MAX_LENGTH,
    };
  }

  async captureScreenshot(): Promise<ControlScreenshotResult> {
    this.assertReady('screen.capture');
    const result = await this.platform.captureScreenshot(this.screenshotDirectory);
    this.activity.tryRecord({
      category: 'control',
      severity: 'info',
      action: 'control.screenshot_captured',
      outcome: 'success',
      detail: `${result.bytes} bytes`,
    });
    return result;
  }

  windowAction(senderId: number, action: ControlWindowResult['action']): ControlWindowResult {
    if (this.paused) {
      throw new ControlError('paused', 'PC control is paused. Resume it before continuing.');
    }
    if (!(CONTROL_WINDOW_ACTIONS as readonly string[]).includes(action)) {
      throw new ControlError('validation', 'Unsupported window action.');
    }
    const applied = this.platform.windowAction(senderId, action);
    this.activity.tryRecord({
      category: 'control',
      severity: applied ? 'info' : 'warning',
      action: `control.window_${action}`,
      outcome: applied ? 'success' : 'failure',
      detail: `Window ${senderId}`,
    });
    return { action, applied };
  }

  emergencyStop(): { paused: boolean } {
    this.paused = true;
    try {
      this.onEmergencyStop?.();
    } catch {
      // Emergency stop must not fail because a subsystem is unavailable.
    }
    this.activity.tryRecord({
      category: 'control',
      severity: 'warning',
      action: 'control.emergency_stop',
      outcome: 'info',
      detail: 'Active AI streams were aborted and PC control was paused.',
    });
    return { paused: true };
  }

  resume(): { paused: boolean } {
    this.paused = false;
    this.activity.tryRecord({
      category: 'control',
      severity: 'info',
      action: 'control.resumed',
      outcome: 'success',
      detail: 'PC control was resumed.',
    });
    return { paused: false };
  }

  private assertReady(capability: 'app.launch' | 'clipboard.read' | 'screen.capture'): void {
    if (this.paused) {
      throw new ControlError('paused', 'PC control is paused. Resume it before continuing.');
    }
    if (this.permissions.getState(capability) !== 'granted') {
      throw new ControlError(
        'permission_denied',
        'This action requires explicit permission. Grant it in Settings → Permissions.',
      );
    }
  }
}
