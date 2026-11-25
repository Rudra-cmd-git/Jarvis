import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Trash2,
  Volume2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Slider, Toggle } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { Badge, EmptyState, Panel, SectionTitle, StatusDot } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import type { Provider, ProviderInput, SearchResult, TestResult } from "../lib/types";
import { cn, isValidHttpUrl } from "../lib/utils";
import { useApp } from "../store/app-context";
import { useTts } from "../voice/tts";

type Tab = "ai" | "search" | "voice";

const PRESETS: Record<string, { kind: Provider["kind"]; baseUrl: string; model: string; label: string; docs: string }> = {
  openrouter: {
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    label: "OpenRouter",
    docs: "https://openrouter.ai/keys",
  },
  groq: {
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    label: "Groq",
    docs: "https://console.groq.com/keys",
  },
  gemini: {
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
    label: "Google Gemini",
    docs: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    label: "OpenAI",
    docs: "https://platform.openai.com/api-keys",
  },
  custom: {
    kind: "custom",
    baseUrl: "",
    model: "",
    label: "Custom OpenAI-compatible",
    docs: "",
  },
};

const emptyDraft: ProviderInput = {
  name: "",
  kind: "openai",
  baseUrl: "",
  model: "",
  enabled: true,
  timeoutMs: 60000,
  temperature: 0.7,
  maxTokens: 2048,
};

export default function Integrations() {
  const {
    providers,
    refreshProviders,
    settings,
    saveSettings,
    activeProvider,
    backupProvider,
    searchHealth,
    refreshSearchHealth,
    refreshActivity,
    testResults,
    setTestResult,
  } = useApp();
  const { push } = useToast();
  const tts = useTts();
  const [tab, setTab] = useState<Tab>("ai");

  // provider editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ProviderInput>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [keyFor, setKeyFor] = useState<Provider | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  // search
  const [searchKey, setSearchKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  // voice
  const [sttKey, setSttKey] = useState("");
  const [sttHasKey, setSttHasKey] = useState(false);

  useEffect(() => {
    void api.voiceKeyStatus().then(setSttHasKey).catch(() => setSttHasKey(false));
  }, []);

  const searchKeyStored = searchHealth?.hasKey ?? false;

  const openNew = (presetKey: string) => {
    const preset = PRESETS[presetKey] ?? PRESETS.custom;
    setDraft({
      ...emptyDraft,
      name: preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      model: preset.model,
    });
    setEditorOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setDraft({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      enabled: provider.enabled,
      timeoutMs: provider.timeoutMs,
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
    });
    setEditorOpen(true);
  };

  const saveProvider = async () => {
    if (!isValidHttpUrl(draft.baseUrl)) {
      push("Base URL must be a valid http(s) URL.", "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.providerSave(draft);
      await refreshProviders();
      setEditorOpen(false);
      setKeyFor(saved);
      setKeyValue("");
      push("Provider saved. Store its API key to connect.", "success");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async () => {
    if (!keyFor) return;
    try {
      await api.providerSetKey(keyFor.id, keyValue);
      await refreshProviders();
      setKeyFor(null);
      setKeyValue("");
      push("API key stored in Windows Credential Manager.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const removeKey = async (provider: Provider) => {
    try {
      await api.providerClearKey(provider.id);
      await refreshProviders();
      push("Stored key deleted.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const testProvider = async (provider: Provider) => {
    setTesting(provider.id);
    try {
      const result: TestResult = await api.providerTest(provider.id);
      setTestResult(provider.id, result);
      push(result.message, result.ok ? "success" : "error");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setTesting(null);
    }
  };

  const removeProvider = async () => {
    if (!deleteTarget) return;
    try {
      await api.providerDelete(deleteTarget.id);
      await refreshProviders();
      setDeleteTarget(null);
      void refreshActivity();
      push("Provider removed.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const setActive = (id: string | null) => {
    if (!settings) return;
    void saveSettings({ ...settings, activeProviderId: id });
  };

  const setBackup = (id: string | null) => {
    if (!settings) return;
    void saveSettings({ ...settings, backupProviderId: id });
  };

  const updateSearch = (patch: Partial<NonNullable<typeof settings>["search"]>) => {
    if (!settings) return;
    void saveSettings({ ...settings, search: { ...settings.search, ...patch } }).then(() => void refreshSearchHealth());
  };

  const saveSearchKey = async () => {
    try {
      await api.searchSetKey(settings?.search.provider ?? "brave", searchKey.trim());
      setSearchKey("");
      await refreshSearchHealth();
      push("Search key stored securely.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const runSearchTest = async () => {
    if (!searchQuery.trim()) return;
    setSearchBusy(true);
    setSearchResults(null);
    try {
      setSearchResults(await api.searchRun(searchQuery.trim()));
    } catch (e) {
      push(String(e), "error");
    } finally {
      setSearchBusy(false);
    }
  };

  const updateVoice = (patch: Partial<NonNullable<typeof settings>["voice"]>) => {
    if (!settings) return;
    void saveSettings({ ...settings, voice: { ...settings.voice, ...patch } });
  };

  const saveSttKey = async () => {
    try {
      await api.voiceSetKey(sttKey.trim());
      setSttKey("");
      setSttHasKey(true);
      push("Transcription key stored.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const clearSttKey = async () => {
    try {
      await api.voiceClearKey();
      setSttHasKey(false);
      push("Transcription key removed.", "success");
    } catch (e) {
      push(String(e), "error");
    }
  };

  const voiceNames = useMemo(() => tts.voices.map((v) => ({ name: v.name, lang: v.lang })), [tts.voices]);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        <SectionTitle
          title="Integrations"
          subtitle="Bring your own providers. Keys are stored by Windows, never in the database or the interface."
          icon={<Zap size={16} />}
        />

        <div className="flex gap-1 rounded-xl border border-line bg-[#070d16]/70 p-1">
          {[
            { id: "ai" as Tab, label: "AI Providers", icon: Zap },
            { id: "search" as Tab, label: "Web Search", icon: Globe2 },
            { id: "voice" as Tab, label: "Voice", icon: Mic },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] transition-colors focus-ring",
                tab === id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === "ai" ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label mr-1">Add:</span>
              {Object.entries(PRESETS).map(([key, preset]) => (
                <Button key={key} size="sm" variant="outline" onClick={() => openNew(key)}>
                  <Plus size={11} /> {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {providers.length === 0 ? (
                <Panel className="md:col-span-2">
                  <EmptyState
                    icon={<Zap size={22} />}
                    title="No AI provider connected"
                    description="Pick a preset above. JARVIS works with any OpenAI-compatible endpoint as well as Gemini's native API."
                  />
                </Panel>
              ) : null}

              {providers.map((p) => {
                const isActive = settings?.activeProviderId === p.id || (!settings?.activeProviderId && activeProvider?.id === p.id);
                const test = testResults[p.id];
                return (
                  <Panel key={p.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">{p.name}</span>
                          {isActive ? <Badge tone="accent">primary</Badge> : null}
                          {settings?.backupProviderId === p.id ? <Badge tone="warn">backup</Badge> : null}
                        </div>
                        <div className="mono mt-0.5 truncate text-[10.5px] text-[var(--accent)]">{p.model}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                          <StatusDot tone={p.hasKey ? "ok" : "warn"} />
                          {p.hasKey ? "key stored" : "no key"}
                          <span className="text-faint">·</span>
                          <span className="mono">{p.kind}</span>
                          {!p.enabled ? <Badge tone="bad">disabled</Badge> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                          <RefreshCw size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(p)}
                          aria-label={`Delete ${p.name}`}
                          className="hover:text-danger"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 truncate text-[10px] text-faint">{p.baseUrl}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setKeyFor(p);
                          setKeyValue("");
                        }}
                      >
                        <KeyRound size={11} /> {p.hasKey ? "Replace key" : "Add key"}
                      </Button>
                      {p.hasKey ? (
                        <Button size="sm" variant="ghost" onClick={() => void removeKey(p)}>
                          Delete key
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void testProvider(p)}
                        disabled={!p.hasKey || testing === p.id}
                      >
                        {testing === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Test
                      </Button>
                      <Button size="sm" variant={isActive ? "primary" : "ghost"} onClick={() => setActive(p.id)}>
                        {isActive ? "Primary" : "Set primary"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBackup(settings?.backupProviderId === p.id ? null : p.id)}
                        disabled={settings?.activeProviderId === p.id}
                      >
                        {settings?.backupProviderId === p.id ? "Remove backup" : "Use as backup"}
                      </Button>
                    </div>

                    {test ? (
                      <div
                        className={cn(
                          "mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10.5px] leading-relaxed",
                          test.ok ? "border-ok/25 text-ok bg-ok/[0.05]" : "border-danger/25 text-danger bg-danger/[0.05]",
                        )}
                      >
                        {test.ok ? <CheckCircle2 size={11} className="mt-0.5" /> : <AlertTriangle size={11} className="mt-0.5" />}
                        <span>
                          {test.message} · {test.latencyMs} ms
                          {test.models.length > 0 ? ` · ${test.models.length} models visible` : ""}
                        </span>
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>

            <Panel className="p-4">
              <SectionTitle
                title="Routing"
                subtitle="Requests use the primary provider. If it fails before returning text, the backup is tried once."
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Primary provider">
                  <Select
                    value={settings?.activeProviderId ?? ""}
                    onChange={(e) => setActive(e.target.value || null)}
                    disabled={providers.length === 0}
                  >
                    <option value="">Automatic (first enabled)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Backup provider">
                  <Select
                    value={settings?.backupProviderId ?? ""}
                    onChange={(e) => setBackup(e.target.value || null)}
                    disabled={providers.length === 0}
                  >
                    <option value="">None</option>
                    {providers
                      .filter((p) => p.id !== settings?.activeProviderId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                <span>Active: {activeProvider?.name ?? "none"}</span>
                <span>·</span>
                <span>Backup: {backupProvider?.name ?? "none"}</span>
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "search" ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Panel className="p-4">
              <SectionTitle title="Search provider" subtitle="JARVIS only searches when you ask it to." />
              <div className="mt-3 space-y-3">
                <Toggle
                  checked={settings?.search.enabled ?? false}
                  onChange={(value) => updateSearch({ enabled: value })}
                  label="Enable web search"
                  description="Required before the web_search tool or chat can query the web."
                />
                <Field label="Provider">
                  <Select
                    value={settings?.search.provider ?? "none"}
                    onChange={(e) => updateSearch({ provider: e.target.value as "none" | "brave" | "tavily" | "searxng" })}
                  >
                    <option value="none">Not configured</option>
                    <option value="brave">Brave Search API</option>
                    <option value="tavily">Tavily</option>
                    <option value="searxng">SearXNG (self-hosted)</option>
                  </Select>
                </Field>

                {settings?.search.provider === "searxng" ? (
                  <Field label="SearXNG instance URL" hint="JSON output must be enabled">
                    <Input
                      value={settings.search.searxUrl}
                      onChange={(e) => updateSearch({ searxUrl: e.target.value })}
                      placeholder="http://127.0.0.1:8888"
                    />
                  </Field>
                ) : settings?.search.provider !== "none" ? (
                  <>
                    <Field label="API key" hint={searchKeyStored ? "stored securely" : "required"}>
                      <Input
                        type="password"
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        placeholder={searchKeyStored ? "•••••••• stored" : "Paste API key"}
                      />
                    </Field>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="primary" onClick={() => void saveSearchKey()} disabled={!searchKey.trim()}>
                        <KeyRound size={12} /> Save key
                      </Button>
                      {searchKeyStored ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void api
                              .searchClearKey(settings?.search.provider ?? "brave")
                              .then(() => {
                                void refreshSearchHealth();
                                push("Search key deleted.", "success");
                              })
                              .catch((e) => push(String(e), "error"))
                          }
                        >
                          Delete key
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}

                <Field label="Maximum results">
                  <Select
                    value={String(settings?.search.maxResults ?? 5)}
                    onChange={(e) => updateSearch({ maxResults: Number(e.target.value) })}
                  >
                    {[3, 5, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} results
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void api.openExternal("https://brave.com/search/api/")}>
                    <ExternalLink size={11} /> Brave keys
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void api.openExternal("https://tavily.com")}>
                    <ExternalLink size={11} /> Tavily keys
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel className="p-4">
              <SectionTitle title="Test search" subtitle="Runs a real request. Requires the external.send permission." />
              <div className="mt-3 flex gap-1.5">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search query"
                  onKeyDown={(e) => e.key === "Enter" && void runSearchTest()}
                />
                <Button variant="primary" size="md" onClick={() => void runSearchTest()} disabled={searchBusy || !searchQuery.trim()}>
                  {searchBusy ? <Loader2 size={13} className="animate-spin" /> : "Run"}
                </Button>
              </div>
              {searchResults ? (
                <ul className="mt-3 space-y-2">
                  {searchResults.length === 0 ? <li className="text-[11px] text-faint">No results returned.</li> : null}
                  {searchResults.map((r) => (
                    <li key={r.url} className="rounded-lg border border-line p-2.5">
                      <button
                        onClick={() => void api.openExternal(r.url)}
                        className="text-left text-[11.5px] font-medium text-[var(--accent)] hover:underline"
                      >
                        {r.title}
                      </button>
                      <div className="mono mt-0.5 truncate text-[9px] text-faint">{r.url}</div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{r.snippet}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {tab === "voice" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4">
              <SectionTitle
                title="Speech output"
                subtitle="Uses the Windows speech voices available to the WebView2 runtime."
                icon={<Volume2 size={14} />}
                action={<Badge tone={tts.supported ? "ok" : "bad"}>{tts.supported ? "available" : "unavailable"}</Badge>}
              />
              <div className="mt-2 divide-y divide-white/[0.04]">
                <Toggle
                  checked={settings?.voice.ttsEnabled ?? true}
                  onChange={(value) => updateVoice({ ttsEnabled: value })}
                  label="Enable spoken replies"
                />
                <Toggle
                  checked={settings?.voice.autoSpeak ?? false}
                  onChange={(value) => updateVoice({ autoSpeak: value })}
                  label="Speak every reply automatically"
                  description="When off, use the speaker control on individual messages."
                />
              </div>
              <div className="mt-3 space-y-2">
                <Field label="Voice">
                  <Select value={settings?.voice.voice ?? ""} onChange={(e) => updateVoice({ voice: e.target.value })}>
                    <option value="">System default ({settings?.voice.language ?? "en-US"})</option>
                    {voiceNames.map((v) => (
                      <option key={`${v.name}-${v.lang}`} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Slider
                  label="Rate"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={settings?.voice.rate ?? 1}
                  onChange={(v) => updateVoice({ rate: v })}
                  format={(v) => `${v.toFixed(2)}×`}
                />
                <Slider
                  label="Pitch"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={settings?.voice.pitch ?? 1}
                  onChange={(v) => updateVoice({ pitch: v })}
                  format={(v) => v.toFixed(2)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!tts.supported}
                  onClick={() => tts.speak("All systems nominal. JARVIS speech output is operational.")}
                >
                  <Volume2 size={12} /> Test voice
                </Button>
                {!tts.supported && tts.voices.length === 0 ? (
                  <p className="text-[10.5px] leading-relaxed text-amber">
                    No Windows speech voices were detected in this runtime. Install a Windows language voice pack.
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel className="p-4">
              <SectionTitle
                title="Speech input"
                subtitle="Push-to-talk only. No background listening."
                icon={<Mic size={14} />}
                action={
                  <Badge tone={sttHasKey ? "ok" : "muted"}>{sttHasKey ? "endpoint key stored" : "no endpoint key"}</Badge>
                }
              />
              <div className="mt-3 space-y-3">
                <Field label="Recognition mode">
                  <Select
                    value={settings?.voice.sttMode ?? "auto"}
                    onChange={(e) => updateVoice({ sttMode: e.target.value as "auto" | "web" | "whisper" })}
                  >
                    <option value="auto">Automatic (Web Speech if available, else Whisper)</option>
                    <option value="web">Web Speech (runtime service)</option>
                    <option value="whisper">Local / remote Whisper endpoint</option>
                  </Select>
                </Field>
                <Field label="Whisper-compatible endpoint" hint="POST multipart audio">
                  <Input
                    value={settings?.voice.whisperUrl ?? ""}
                    onChange={(e) => updateVoice({ whisperUrl: e.target.value })}
                    placeholder="http://127.0.0.1:8080/v1/audio/transcriptions"
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Model">
                    <Input
                      value={settings?.voice.whisperModel ?? ""}
                      onChange={(e) => updateVoice({ whisperModel: e.target.value })}
                      placeholder="whisper-1"
                    />
                  </Field>
                  <Field label="Language">
                    <Input
                      value={settings?.voice.language ?? ""}
                      onChange={(e) => updateVoice({ language: e.target.value })}
                      placeholder="en-US"
                    />
                  </Field>
                </div>
                <Field label="Endpoint API key (optional)" hint={sttHasKey ? "stored" : "not set"}>
                  <Input
                    type="password"
                    value={sttKey}
                    onChange={(e) => setSttKey(e.target.value)}
                    placeholder="Only for remote transcription services"
                  />
                </Field>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => void saveSttKey()} disabled={!sttKey.trim()}>
                    <KeyRound size={12} /> Save key
                  </Button>
                  {sttHasKey ? (
                    <Button size="sm" variant="ghost" onClick={() => void clearSttKey()}>
                      Delete key
                    </Button>
                  ) : null}
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  Local servers such as faster-whisper or whisper.cpp are optional. If no microphone or endpoint is
                  available, the microphone control reports the failure instead of pretending to listen.
                </p>
              </div>
            </Panel>
          </div>
        ) : null}
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={draft.id ? "Edit provider" : "Add AI provider"}
        description="Non-sensitive configuration is stored in SQLite. The API key is stored separately by Windows."
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveProvider()} disabled={saving}>
              {saving ? "Saving…" : "Save provider"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="OpenRouter" />
          </Field>
          <Field label="Provider type">
            <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Provider["kind"] })}>
              <option value="openai">OpenAI-compatible</option>
              <option value="gemini">Google Gemini</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="Base URL" className="sm:col-span-2">
            <Input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://openrouter.ai/api/v1"
            />
          </Field>
          <Field label="Model ID" className="sm:col-span-2" hint="Sent verbatim">
            <Input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="meta-llama/llama-3.3-70b-instruct:free" />
          </Field>
          <Field label="Timeout (ms)">
            <Input
              type="number"
              min={1000}
              max={600000}
              value={draft.timeoutMs}
              onChange={(e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max output tokens">
            <Input
              type="number"
              min={16}
              max={32000}
              value={draft.maxTokens}
              onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
            />
          </Field>
          <Field label="Temperature" className="sm:col-span-2">
            <Slider
              label="Creativity"
              min={0}
              max={1.5}
              step={0.05}
              value={draft.temperature}
              onChange={(v) => setDraft({ ...draft, temperature: v })}
              format={(v) => v.toFixed(2)}
            />
          </Field>
          <div className="sm:col-span-2 rounded-lg border border-line px-3 py-1">
            <Toggle
              checked={draft.enabled}
              onChange={(value) => setDraft({ ...draft, enabled: value })}
              label="Enabled"
              description="Disabled providers are never selected, even if marked primary."
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(keyFor)}
        onClose={() => setKeyFor(null)}
        title={`API key — ${keyFor?.name ?? ""}`}
        description="The key is written to Windows Credential Manager and cannot be read back by the interface."
        footer={
          <>
            <Button variant="ghost" onClick={() => setKeyFor(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveKey()} disabled={!keyValue.trim()}>
              Store key
            </Button>
          </>
        }
      >
        <Field label="API key" hint="masked after saving">
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="Paste the provider API key"
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
          Never paste keys into chat or save them in files. JARVIS only uses this key from the Rust backend when calling the
          provider.
        </p>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove provider"
        description="Deletes its configuration and stored key. Conversations are kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void removeProvider()}>
              Remove provider
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">{deleteTarget?.name}</p>
      </Modal>
    </div>
  );
}
