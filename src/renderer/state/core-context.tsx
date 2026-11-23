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
import type {
  AppendMessageInput,
  ConversationInput,
  ConversationMessage,
  ConversationSummary,
} from '../../shared/conversations';

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
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  conversationMessages: ConversationMessage[];
  conversationLoading: boolean;
  conversationError: string | null;
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
  refreshConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (input?: ConversationInput) => Promise<ConversationSummary>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setConversationModel: (id: string, model: string | null) => Promise<void>;
  appendConversationMessage: (input: AppendMessageInput) => Promise<ConversationMessage>;
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

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
      const [nextCore, nextSettings, nextProviders, nextPermissions, nextActivity, nextConversations] =
        await Promise.all([
          window.jarvis.getDatabaseStatus(),
          window.jarvis.getSettings(),
          window.jarvis.listProviders(),
          window.jarvis.listPermissions(),
          window.jarvis.listActivity({ limit: 50 }),
          window.jarvis.listConversations(),
        ]);

      setCoreStatus(nextCore);
      setSecretStatus(nextCore.secretStorage);
      setSettings(nextSettings);
      setProviders(nextProviders);
      setPermissions(nextPermissions);
      setActivity(nextActivity);
      setConversations(nextConversations);
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

  const refreshConversations = useCallback(async () => {
    if (!bridgeReady) {
      return;
    }
    const list = await window.jarvis.listConversations();
    setConversations(list);
  }, [bridgeReady]);

  const loadConversation = useCallback(async (id: string) => {
    if (!bridgeReady) {
      return;
    }
    setConversationLoading(true);
    setConversationError(null);
    try {
      const detail = await window.jarvis.getConversation(id);
      setActiveConversationId(id);
      setConversationMessages(detail.messages);
    } catch (cause) {
      setConversationError(messageOf(cause, 'Conversation could not be loaded.'));
    } finally {
      setConversationLoading(false);
    }
  }, [bridgeReady]);

  const createConversation = useCallback(async (input?: ConversationInput) => {
    const created = await window.jarvis.createConversation(input);
    setConversations(await window.jarvis.listConversations());
    setActiveConversationId(created.id);
    setConversationMessages([]);
    return created;
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    await window.jarvis.renameConversation(id, title);
    setConversations(await window.jarvis.listConversations());
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await window.jarvis.deleteConversation(id);
    const list = await window.jarvis.listConversations();
    setConversations(list);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setConversationMessages([]);
      if (list.length > 0) {
        await loadConversation(list[0].id);
      }
    }
  }, [activeConversationId, loadConversation]);

  const setConversationModel = useCallback(async (id: string, model: string | null) => {
    await window.jarvis.setConversationModel(id, model);
    setConversations(await window.jarvis.listConversations());
    if (activeConversationId === id) {
      const detail = await window.jarvis.getConversation(id);
      setConversationMessages(detail.messages);
    }
  }, [activeConversationId]);

  const appendConversationMessage = useCallback(async (input: AppendMessageInput) => {
    const message = await window.jarvis.appendConversationMessage(input);
    if (input.conversationId === activeConversationId) {
      setConversationMessages((current) => [...current, message]);
    }
    setConversations(await window.jarvis.listConversations());
    return message;
  }, [activeConversationId]);

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
      conversations,
      activeConversationId,
      conversationMessages,
      conversationLoading,
      conversationError,
      refresh,
      refreshActivity,
      refreshConversations,
      loadConversation,
      createConversation,
      renameConversation,
      deleteConversation,
      setConversationModel,
      appendConversationMessage,
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
      conversations,
      activeConversationId,
      conversationMessages,
      conversationLoading,
      conversationError,
      refresh,
      refreshActivity,
      refreshConversations,
      loadConversation,
      createConversation,
      renameConversation,
      deleteConversation,
      setConversationModel,
      appendConversationMessage,
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
