import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppInfo } from '../../shared/types';

export interface RuntimeState {
  appInfo: AppInfo | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  refresh: () => Promise<void>;
  bridgeReady: boolean;
}

const RuntimeContext = createContext<RuntimeState | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const bridgeReady = typeof window !== 'undefined' && typeof window.jarvis?.getAppInfo === 'function';

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await window.jarvis.getAppInfo();
      setAppInfo(next);
      setError(null);
      setLastLoadedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loading = initialLoading && appInfo === null && error === null;

  return (
    <RuntimeContext.Provider
      value={{
        appInfo,
        loading,
        refreshing,
        error,
        lastLoadedAt,
        refresh,
        bridgeReady,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): RuntimeState {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error('useRuntime must be used inside RuntimeProvider');
  }
  return value;
}
