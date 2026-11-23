/**
 * Settings are deliberately small and each key has a real effect in the
 * application today. Keys that would only be decorative are not added.
 */
export interface AppSettings {
  'ui.reduceMotion': boolean;
  'ui.compactSidebar': boolean;
  'ai.activeProviderId': string | null;
  'ai.defaultModel': string;
}

export type SettingKey = keyof AppSettings;

export const SETTING_KEYS: readonly SettingKey[] = [
  'ui.reduceMotion',
  'ui.compactSidebar',
  'ai.activeProviderId',
  'ai.defaultModel',
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  'ui.reduceMotion': false,
  'ui.compactSidebar': false,
  'ai.activeProviderId': null,
  'ai.defaultModel': '',
};

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;

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
    default:
      return false;
  }
}
