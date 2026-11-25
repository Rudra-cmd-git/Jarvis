import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActivityEntry,
  AppInfo,
  AppSettings,
  ApprovalRequest,
  Automation,
  ChatResult,
  ChatStatusEvent,
  Conversation,
  ConversationDetail,
  Memory,
  Message,
  Provider,
  ProviderInput,
  SearchHealth,
  SearchResult,
  SystemSnapshot,
  TestResult,
  ToolInfo,
  ToolOutcome,
  Message as Msg,
} from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const call = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  invoke<T>(cmd, args);

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  systemSnapshot: () => call<SystemSnapshot>("system_snapshot"),

  settingsGet: () => call<AppSettings>("settings_get"),
  settingsSave: (settings: AppSettings) => call<AppSettings>("settings_save", { settings }),

  providersList: () => call<Provider[]>("providers_list"),
  providerSave: (input: ProviderInput) => call<Provider>("provider_save", { input }),
  providerDelete: (id: string) => call<void>("provider_delete", { id }),
  providerSetKey: (id: string, key: string) => call<Provider>("provider_set_key", { id, key }),
  providerClearKey: (id: string) => call<Provider>("provider_clear_key", { id }),
  providerTest: (id: string) => call<TestResult>("provider_test", { id }),

  chatSend: (req: { conversationId?: string | null; providerId?: string | null; content: string; requestId: string }) =>
    call<ChatResult>("chat_send", { req }),
  chatContinue: (req: { conversationId: string; providerId?: string | null; requestId: string }) =>
    call<ChatResult>("chat_continue", { req }),
  chatCancel: (requestId: string) => call<void>("chat_cancel", { requestId }),

  conversationsList: (query?: string) => call<Conversation[]>("conversations_list", { query: query ?? null }),
  conversationGet: (id: string) => call<ConversationDetail>("conversation_get", { id }),
  conversationCreate: () => call<string>("conversation_create"),
  conversationRename: (id: string, title: string) => call<void>("conversation_rename", { id, title }),
  conversationDelete: (id: string) => call<void>("conversation_delete", { id }),
  conversationAddMessage: (conversationId: string, role: string, content: string) =>
    call<Msg>("conversation_add_message", { conversationId, role, content }),

  memoryList: () => call<Memory[]>("memory_list"),
  memoryAdd: (kind: string, content: string) => call<Memory>("memory_add", { kind, content }),
  memoryDelete: (id: string) => call<void>("memory_delete", { id }),
  memoryTogglePin: (id: string) => call<void>("memory_toggle_pin", { id }),
  memoryClear: () => call<void>("memory_clear"),

  automationsList: () => call<Automation[]>("automations_list"),
  automationSave: (input: { id?: string | null; name: string; prompt: string }) =>
    call<Automation>("automation_save", input),
  automationDelete: (id: string) => call<void>("automation_delete", { id }),
  automationMarkRun: (id: string) => call<void>("automation_mark_run", { id }),

  activityList: (limit = 40) => call<ActivityEntry[]>("activity_list", { limit }),
  activityClear: () => call<void>("activity_clear"),
  activityCounts: () => call<{ total: number; failed: number; pendingApprovals: number }>("activity_counts"),

  toolsList: () => call<ToolInfo[]>("tools_list"),
  toolRun: (tool: string, args: Record<string, unknown>, reason?: string) =>
    call<ToolOutcome>("tool_run", { tool, args, reason: reason ?? null }),
  approvalsList: () => call<ApprovalRequest[]>("approvals_list"),
  approvalRespond: (id: string, approve: boolean) => call<ToolOutcome>("approval_respond", { id, approve }),

  searchHealth: () => call<SearchHealth>("search_health"),
  searchSetKey: (provider: string, key: string) => call<void>("search_set_key", { provider, key }),
  searchClearKey: (provider: string) => call<void>("search_clear_key", { provider }),
  searchRun: (query: string) => call<SearchResult[]>("search_run", { query }),

  voiceTranscribe: (audioBase64: string, mime: string) =>
    call<string>("voice_transcribe", { audioBase64, mime }),
  voiceKeyStatus: () => call<boolean>("voice_key_status"),
  voiceSetKey: (key: string) => call<void>("voice_set_key", { key }),
  voiceClearKey: () => call<void>("voice_clear_key"),

  openExternal: (url: string) => call<void>("open_external", { url }),
  openDataFolder: () => call<void>("open_data_folder"),
};

export const events = {
  onStatus: (cb: (e: ChatStatusEvent) => void): Promise<UnlistenFn> =>
    listen<ChatStatusEvent>("chat:status", (e) => cb(e.payload)),
  onDelta: (cb: (e: { requestId: string; text: string }) => void): Promise<UnlistenFn> =>
    listen<{ requestId: string; text: string }>("chat:delta", (e) => cb(e.payload)),
};

export type { Message };
