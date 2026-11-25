import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, isTauri } from "../lib/api";
import type {
  ActivityEntry,
  AppInfo,
  AppSettings,
  ApprovalRequest,
  CoreState,
  Provider,
  SearchHealth,
  SystemSnapshot,
  TestResult,
  ToolOutcome,
  ViewId,
} from "../lib/types";
import { useToast } from "../components/ui/Toast";

interface AppContextValue {
  ready: boolean;
  fatal: string | null;
  view: ViewId;
  setView: (view: ViewId) => void;
  settings: AppSettings | null;
  saveSettings: (next: AppSettings) => Promise<boolean>;
  providers: Provider[];
  activeProvider: Provider | null;
  backupProvider: Provider | null;
  refreshProviders: () => Promise<void>;
  testResults: Record<string, TestResult>;
  setTestResult: (id: string, result: TestResult) => void;
  appInfo: AppInfo | null;
  activity: ActivityEntry[];
  refreshActivity: () => Promise<void>;
  approvals: ApprovalRequest[];
  refreshApprovals: () => Promise<void>;
  searchHealth: SearchHealth | null;
  refreshSearchHealth: () => Promise<void>;
  system: SystemSnapshot | null;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  handoffPrompt: string | null;
  setHandoffPrompt: (prompt: string | null) => void;
  openConversation: (id: string) => void;
  coreState: CoreState;
  setCoreState: (state: CoreState) => void;
  task: string;
  setTask: (task: string) => void;
  pendingApproval: ApprovalRequest | null;
  runTool: (tool: string, args: Record<string, unknown>, reason?: string) => Promise<ToolOutcome>;
  resolveApproval: (approve: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
  ttsAvailable: boolean;
  sttMode: "web" | "whisper" | "none";
  refreshVoiceCaps: () => void;
}

const defaultSettings: AppSettings = {
  theme: "midnight",
  accent: "cyan",
  reducedMotion: false,
  memoryEnabled: true,
  notifications: true,
  startupView: "dashboard",
  historyLimit: 20,
  requireApprovals: true,
  activeProviderId: null,
  backupProviderId: null,
  permissions: {
    appsLaunch: true,
    webOpen: true,
    filesRead: false,
    filesSearch: false,
    notesWrite: true,
    notesDelete: false,
    systemInfo: true,
    externalSend: true,
  },
  voice: {
    ttsEnabled: true,
    autoSpeak: false,
    rate: 1,
    pitch: 1,
    voice: "",
    sttMode: "auto",
    whisperUrl: "http://127.0.0.1:8080/v1/audio/transcriptions",
    whisperModel: "whisper-1",
    language: "en-US",
  },
  search: { provider: "none", searxUrl: "", maxResults: 5, enabled: false },
};

const AppContext = createContext<AppContextValue | null>(null);

const WEB_SPEECH = (): boolean => {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};

const TTS_SUPPORTED = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function AppProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [view, setViewState] = useState<ViewId>("dashboard");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [searchHealth, setSearchHealth] = useState<SearchHealth | null>(null);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [handoffPrompt, setHandoffPrompt] = useState<string | null>(null);
  const [coreState, setCoreState] = useState<CoreState>("idle");
  const [task, setTask] = useState("Standing by");
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [sttMode, setSttMode] = useState<"web" | "whisper" | "none">("none");

  const approvalResolver = useRef<((outcome: ToolOutcome) => void) | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  settingsRef.current = settings;

  const refreshVoiceCaps = useCallback(() => {
    setTtsAvailable(TTS_SUPPORTED());
    const mode = settingsRef.current?.voice.sttMode ?? "auto";
    if (mode === "web") setSttMode(WEB_SPEECH() ? "web" : "none");
    else if (mode === "whisper") setSttMode("whisper");
    else setSttMode(WEB_SPEECH() ? "web" : "whisper");
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      setProviders(await api.providersList());
    } catch (e) {
      push(String(e), "error");
    }
  }, [push]);

  const refreshActivity = useCallback(async () => {
    try {
      setActivity(await api.activityList(50));
    } catch {
      /* activity is non-critical */
    }
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      setApprovals(await api.approvalsList());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSearchHealth = useCallback(async () => {
    try {
      setSearchHealth(await api.searchHealth());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      setSystem(await api.systemSnapshot());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProviders(), refreshActivity(), refreshApprovals(), refreshSearchHealth()]);
  }, [refreshProviders, refreshActivity, refreshApprovals, refreshSearchHealth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTauri()) {
        setFatal(
          "JARVIS must run inside its desktop window. Start it with `npm run app:dev` so the native backend is available.",
        );
        setReady(true);
        return;
      }
      try {
        const [s, p, info] = await Promise.all([api.settingsGet(), api.providersList(), api.appInfo()]);
        if (cancelled) return;
        setSettings(s);
        setProviders(p);
        setAppInfo(info);
        const startView = s.startupView as ViewId;
        if (startView && startView !== "settings") setViewState(startView);
        setReady(true);
        setCoreState(p.length === 0 ? "offline" : "idle");
        setTask(p.length === 0 ? "No AI provider configured" : "Standing by");
        await Promise.all([refreshActivity(), refreshApprovals(), refreshSearchHealth()]);
        void refreshSystem();
      } catch (e) {
        if (!cancelled) {
          setFatal(String(e));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshActivity, refreshApprovals, refreshSearchHealth, refreshSystem]);

  useEffect(() => {
    refreshVoiceCaps();
  }, [settings?.voice.sttMode, refreshVoiceCaps]);

  useEffect(() => {
    if (!ready || fatal) return;
    const interval = window.setInterval(() => {
      void refreshSystem();
      void refreshApprovals();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [ready, fatal, refreshSystem, refreshApprovals]);

  const setView = useCallback((next: ViewId) => {
    setViewState(next);
  }, []);

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      try {
        const saved = await api.settingsSave(next);
        setSettings(saved);
        return true;
      } catch (e) {
        push(String(e), "error");
        return false;
      }
    },
    [push],
  );

  const setTestResult = useCallback((id: string, result: TestResult) => {
    setTestResults((prev) => ({ ...prev, [id]: result }));
  }, []);

  const openConversation = useCallback((id: string) => {
    setConversationId(id);
    setViewState("chat");
  }, []);

  const resolveApproval = useCallback(
    async (approve: boolean) => {
      const current = pendingApproval;
      if (!current) return;
      try {
        const outcome = await api.approvalRespond(current.id, approve);
        setPendingApproval(null);
        setApprovals((prev) => prev.filter((a) => a.id !== current.id));
        approvalResolver.current?.(outcome);
        approvalResolver.current = null;
        void refreshActivity();
      } catch (e) {
        push(String(e), "error");
      }
    },
    [pendingApproval, push, refreshActivity],
  );

  const runTool = useCallback(
    async (tool: string, args: Record<string, unknown>, reason?: string): Promise<ToolOutcome> => {
      try {
        setTask(`Running ${tool}`);
        const outcome = await api.toolRun(tool, args, reason);
        void refreshActivity();
        if (outcome.status === "approvalRequired") {
          setPendingApproval(outcome.approval);
          void refreshApprovals();
          return new Promise<ToolOutcome>((resolve) => {
            approvalResolver.current = resolve;
          });
        }
        setTask("Standing by");
        return outcome;
      } catch (e) {
        setTask("Standing by");
        push(String(e), "error");
        return { status: "denied", reason: String(e) };
      }
    },
    [push, refreshActivity],
  );

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.reducedMotion ? "reduced" : "full";
  }, [settings]);

  const activeProvider = useMemo(() => {
    if (!settings) return null;
    return (
      providers.find((p) => p.id === settings.activeProviderId) ??
      providers.find((p) => p.enabled) ??
      null
    );
  }, [providers, settings]);

  const backupProvider = useMemo(() => {
    if (!settings?.backupProviderId) return null;
    return providers.find((p) => p.id === settings.backupProviderId) ?? null;
  }, [providers, settings]);

  const value: AppContextValue = {
    ready,
    fatal,
    view,
    setView,
    settings,
    saveSettings,
    providers,
    activeProvider,
    backupProvider,
    refreshProviders,
    testResults,
    setTestResult,
    appInfo,
    activity,
    refreshActivity,
    approvals,
    refreshApprovals,
    searchHealth,
    refreshSearchHealth,
    system,
    conversationId,
    setConversationId,
    handoffPrompt,
    setHandoffPrompt,
    openConversation,
    coreState,
    setCoreState,
    task,
    setTask,
    pendingApproval,
    runTool,
    resolveApproval,
    refreshAll,
    ttsAvailable,
    sttMode,
    refreshVoiceCaps,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export { defaultSettings };
