import {
  CONTROL_APP_ID_PATTERN,
  CONTROL_APP_PATH_PATTERN,
  type ControlAppEntry,
} from './control';

/**
 * Settings are deliberately small and each key has a real effect in the
 * application today. Keys that would only be decorative are not added.
 */
export interface AppSettings {
  'ui.reduceMotion': boolean;
  'ui.compactSidebar': boolean;
  'ai.activeProviderId': string | null;
  'ai.defaultModel': string;
  'control.appAllowlist': ControlAppEntry[];
}

export type SettingKey = keyof AppSettings;

export const SETTING_KEYS: readonly SettingKey[] = [
  'ui.reduceMotion',
  'ui.compactSidebar',
  'ai.activeProviderId',
  'ai.defaultModel',
  'control.appAllowlist',
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  'ui.reduceMotion': false,
  'ui.compactSidebar': false,
  'ai.activeProviderId': null,
  'ai.defaultModel': '',
  'control.appAllowlist': [],
};

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;

function isControlAppEntry(value: unknown): value is ControlAppEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    CONTROL_APP_ID_PATTERN.test(entry.id) &&
    typeof entry.name === 'string' &&
    entry.name.trim().length >= 1 &&
    entry.name.length <= 80 &&
    typeof entry.path === 'string' &&
    CONTROL_APP_PATH_PATTERN.test(entry.path) &&
    typeof entry.enabled === 'boolean'
  );
}

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && (SETTING_KEYS as readonly string[]).includes(value);
}

export function isValidSettingValue<K extends SettingKey>(key: K, value: unknown): value is AppSettings[K] {
  switch (key) {
    case 'ui.reduceMotion':
    case 'ui.compactSidebar':
      return typeof value === 'boolean';
    case 'ai.activeProviderId':
      return value === null || (typeof value === 'string' && PROVIDER_ID_PATTERN.test(value));
    case 'ai.defaultModel':
      return typeof value === 'string' && value.length <= 160;
    case 'control.appAllowlist':
      return (
        Array.isArray(value) && value.length <= 20 && value.every((entry) => isControlAppEntry(entry))
      );
    default:
      return false;
  }
}
