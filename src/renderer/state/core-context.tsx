import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ActivityEntry,
  ActivityFilter,
  CoreStatus,
  PermissionAction,
  SecretStorageStatus,
} from '../../shared/types';
import type { AppSettings, SettingKey } from '../../shared/settings';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import type { PermissionCapability, PermissionOverview } from '../../shared/permissions';
import type { ProviderInput, ProviderSummary } from '../../shared/providers';

export interface CoreState {
  loading: boolean;
  error: string | null;
  coreStatus: CoreStatus | null;
  secretStatus: SecretStorageStatus | null;
  settings: AppSettings;
  providers: ProviderSummary[];
  permissions: PermissionOverview | null;
  activity: ActivityEntry[];
  activityFilter: ActivityFilter;
  refresh: () => Promise<void>;
  refreshActivity: (filter?: ActivityFilter) => Promise<void>;
  updateSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<void>;
  resetSetting: (key: SettingKey) => Promise<void>;
  saveProvider: (input: ProviderInput) => Promise<ProviderSummary>;
  removeProvider: (id: string) => Promise<void>;
  activateProvider: (id: string) => Promise<void>;
  setSecret: (id: string, value: string) => Promise<void>;
  deleteSecret: (id: string) => Promise<void>;
  setPermission: (capability: PermissionCapability, action: PermissionAction) => Promise<void>;
}

const CoreContext = createContext<CoreState | null>(null);

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function CoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coreStatus, setCoreStatus] = useState<CoreStatus | null>(null);
  const [secretStatus, setSecretStatus] = useState<SecretStorageStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [permissions, setPermissions] = useState<PermissionOverview | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>({});

  const bridgeReady = typeof window !== 'undefined' && typeof window.jarvis?.getSettings === 'function';

  const refreshActivity = useCallback(async (filter: ActivityFilter = {}) => {
    if (!bridgeReady) {
      return;
    }
    const entries = await window.jarvis.listActivity(filter);
    setActivity(entries);
    setActivityFilter(filter);
  }, [bridgeReady]);

  const refresh = useCallback(async () => {
    if (!bridgeReady) {
      setLoading(false);
      setError('The JARVIS bridge is unavailable. Restart the application.');
      return;
    }

    setLoading(true);
    try {
      const [nextCore, nextSettings, nextProviders, nextPermissions, nextActivity] =
        await Promise.all([
          window.jarvis.getDatabaseStatus(),
          window.jarvis.getSettings(),
          window.jarvis.listProviders(),
          window.jarvis.listPermissions(),
          window.jarvis.listActivity({ limit: 50 }),
        ]);

      setCoreStatus(nextCore);
      setSecretStatus(nextCore.secretStorage);
      setSettings(nextSettings);
      setProviders(nextProviders);
      setPermissions(nextPermissions);
      setActivity(nextActivity);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Core services could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSetting = useCallback(
    async <K extends SettingKey>(key: K, value: AppSettings[K]) => {
      const next = await window.jarvis.setSetting(key, value);
      setSettings(next);
    },
    [],
  );

  const resetSetting = useCallback(async (key: SettingKey) => {
    const next = await window.jarvis.resetSetting(key);
    setSettings(next);
  }, []);

  const saveProvider = useCallback(async (input: ProviderInput) => {
    const saved = await window.jarvis.saveProvider(input);
    setProviders(await window.jarvis.listProviders());
    return saved;
  }, []);

  const removeProvider = useCallback(async (id: string) => {
    await window.jarvis.removeProvider(id);
    setProviders(await window.jarvis.listProviders());
    setSettings(await window.jarvis.getSettings());
  }, []);

  const activateProvider = useCallback(async (id: string) => {
    const next = await window.jarvis.setActiveProvider(id);
    setProviders(next);
    setSettings(await window.jarvis.getSettings());
  }, []);

  const setSecret = useCallback(async (id: string, value: string) => {
    const next = await window.jarvis.setSecret(id, value);
    setSecretStatus(next);
    setProviders(await window.jarvis.listProviders());
  }, []);

  const deleteSecret = useCallback(async (id: string) => {
    const next = await window.jarvis.deleteSecret(id);
    setSecretStatus(next);
    setProviders(await window.jarvis.listProviders());
  }, []);

  const setPermission = useCallback(
    async (capability: PermissionCapability, action: PermissionAction) => {
      const next = await window.jarvis.setPermission(capability, action);
      setPermissions(next);
    },
    [],
  );

  const value = useMemo<CoreState>(
    () => ({
      loading,
      error,
      coreStatus,
      secretStatus,
      settings,
      providers,
      permissions,
      activity,
      activityFilter,
      refresh,
      refreshActivity,
      updateSetting,
      resetSetting,
      saveProvider,
      removeProvider,
      activateProvider,
      setSecret,
      deleteSecret,
      setPermission,
    }),
    [
      loading,
      error,
      coreStatus,
      secretStatus,
      settings,
      providers,
      permissions,
      activity,
      activityFilter,
      refresh,
      refreshActivity,
      updateSetting,
      resetSetting,
      saveProvider,
      removeProvider,
      activateProvider,
      setSecret,
      deleteSecret,
      setPermission,
    ],
  );

  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCore(): CoreState {
  const value = useContext(CoreContext);
  if (!value) {
    throw new Error('useCore must be used inside CoreProvider');
  }
  return value;
}
