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
  ControlAppEntry,
  ControlClipboardResult,
  ControlIndicatorEvent,
  ControlLaunchResult,
  ControlScreenshotResult,
  ControlStatus,
  ControlWindowResult,
} from '../../shared/control';

interface ControlState {
  status: ControlStatus | null;
  allowlist: ControlAppEntry[];
  indicator: ControlIndicatorEvent | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addApp: (entry: ControlAppEntry) => Promise<void>;
  removeApp: (id: string) => Promise<void>;
  launch: (id: string) => Promise<ControlLaunchResult>;
  readClipboard: () => Promise<ControlClipboardResult>;
  captureScreenshot: () => Promise<ControlScreenshotResult>;
  windowAction: (action: ControlWindowResult['action']) => Promise<ControlWindowResult>;
  emergencyStop: () => Promise<void>;
  resume: () => Promise<void>;
}

const ControlContext = createContext<ControlState | null>(null);

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function ControlProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [allowlist, setAllowlist] = useState<ControlAppEntry[]>([]);
  const [indicator, setIndicator] = useState<ControlIndicatorEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bridgeReady =
    typeof window !== 'undefined' && typeof window.jarvis?.getControlStatus === 'function';

  const refresh = useCallback(async () => {
    if (!bridgeReady) {
      setLoading(false);
      setError('The control bridge is unavailable. Restart JARVIS.');
      return;
    }
    setLoading(true);
    try {
      const [nextStatus, nextAllowlist] = await Promise.all([
        window.jarvis.getControlStatus(),
        window.jarvis.getSettings().then((settings) => settings['control.appAllowlist'] ?? []),
      ]);
      setStatus(nextStatus);
      setAllowlist(nextAllowlist);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Control status could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return window.jarvis.onControlEvent((payload) => {
      setIndicator(payload);
      if (!payload.active) {
        const timer = setTimeout(() => setIndicator(null), 1500);
        return () => clearTimeout(timer);
      }
      return undefined;
    });
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (cause) {
      const message = messageOf(cause, 'The control action failed.');
      setError(message);
      throw new Error(message);
    }
  }, [refresh]);

  const addApp = useCallback(
    async (entry: ControlAppEntry) => {
      const next = await run(() => window.jarvis.addControlApp(entry));
      setAllowlist(next);
    },
    [run],
  );

  const removeApp = useCallback(
    async (id: string) => {
      const next = await run(() => window.jarvis.removeControlApp(id));
      setAllowlist(next);
    },
    [run],
  );

  const launch = useCallback(async (id: string) => run(() => window.jarvis.launchControlApp(id)), [run]);
  const readClipboard = useCallback(
    async () => run(() => window.jarvis.readControlClipboard()),
    [run],
  );
  const captureScreenshot = useCallback(
    async () => run(() => window.jarvis.captureControlScreenshot()),
    [run],
  );
  const windowAction = useCallback(
    async (action: ControlWindowResult['action']) =>
      run(() => window.jarvis.controlWindowAction(action)),
    [run],
  );
  const emergencyStop = useCallback(async () => {
    await run(() => window.jarvis.emergencyStop());
  }, [run]);
  const resume = useCallback(async () => {
    await run(() => window.jarvis.resumeControl());
  }, [run]);

  const value = useMemo<ControlState>(
    () => ({
      status,
      allowlist,
      indicator,
      loading,
      error,
      refresh,
      addApp,
      removeApp,
      launch,
      readClipboard,
      captureScreenshot,
      windowAction,
      emergencyStop,
      resume,
    }),
    [
      status,
      allowlist,
      indicator,
      loading,
      error,
      refresh,
      addApp,
      removeApp,
      launch,
      readClipboard,
      captureScreenshot,
      windowAction,
      emergencyStop,
      resume,
    ],
  );

  return <ControlContext.Provider value={value}>{children}</ControlContext.Provider>;
}

export function useControl(): ControlState {
  const value = useContext(ControlContext);
  if (!value) {
    throw new Error('useControl must be used inside ControlProvider');
  }
  return value;
}
