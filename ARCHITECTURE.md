# JARVIS — Architecture

Status: Phase 1 Milestone 2 implemented and verified. Earlier Phase 0 and M1 decisions are preserved; see `PROJECT_STATUS.md` for actual test results.

## 1. Environment and decision context

Measured on 2026-11-22:

| Capability | Observation |
| --- | --- |
| OS | Windows (`win32`), workspace `C:\Users\rudra\Desktop\Projects\CODING PROJECT\OpenCode\jarvis` |
| Node | v26.13.0, npm 11.20.0 |
| Python | 3.15.2 (optional tooling only; not an application runtime) |
| Rust | rustc/cargo 1.100.0, stable `x86_64-pc-windows-msvc`, only MSVC target installed |
| Native linker | **Missing** — `cargo build` fails with `link.exe not found`; no gcc/mingw/clang available; VS 18 directory present but empty; Windows SDK libs not found at standard path |
| Tauri CLI | 2.12.6 available via npx, but unusable without a linker |
| `node:sqlite` | Available in system Node 26 (`Database`, `DatabaseSync`, `StatementSync`, `backup`, …) |
| `node:sqlite` inside Electron | Verified in M1: Electron 45.4.1 / Node 24.22.3, in-memory query returned 1 |
| Git | 2.56.0.windows.4; repository initialized in Phase 0, no commits yet |
| Free dev models | OpenCode free models available (Big Pickle, DeepSeek V4.1 Flash Free, etc.) |

**Decision:** Electron + React + TypeScript. It builds with the installed toolchain, satisfies Windows integration requirements, and avoids a multi-gigabyte Build Tools install. Tauri is deferred pending explicit approval and a working C++ linker.

## 2. Process model

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React, sandboxed)                                  │
│ Views • Components • Zustand stores • Typed bridge client    │
│ No Node APIs. No secrets. No direct OS calls.                │
└───────────────────────────┬──────────────────────────────────┘
                            │ window.jarvis.* (contextBridge)
┌───────────────────────────▼──────────────────────────────────┐
│ Preload (isolated world)                                     │
│ Allowlisted invoke/on API • argument serialization only      │
└───────────────────────────┬──────────────────────────────────┘
                            │ ipcRenderer.invoke / ipcMain.handle
┌───────────────────────────▼──────────────────────────────────┐
│ Main process (Electron/Node)                                 │
│ IPC handlers (thin) → Services → Adapters                    │
│ Services: AI router, providers, storage, settings, secrets,  │
│ permissions, activity log; later voice, system, screen,      │
│ browser, files, automation, plugins, productivity             │
└───────┬───────────────────┬───────────────────┬──────────────┘
        │                   │                   │
   SQLite DB          encrypted secrets    Windows APIs / network
 (userData/jarvis.db) (safeStorage blob)   (permission-gated)
```

## 3. Module responsibilities

### Renderer (`src/renderer`)
- `views/` — one view per navigation destination: Dashboard, Chat, PcControl, Automation, DeveloperHub, Knowledge, Productivity, Settings.
- `components/ai-core/` — animated central visualization (canvas/CSS), status states.
- `components/layout/` — window chrome, sidebar, title bar, status bar.
- `store/` — Zustand stores for UI state; server-backed state arrives through the bridge.
- `styles/` — design tokens, global styles, glass/holographic primitives.

### Preload (`src/preload`)
- Exposes only `window.jarvis` with typed methods.
- Whitelist of channels; no arbitrary `invoke`.
- Converts main-process push events into subscribed callbacks with unsubscribe functions.

### Shared (`src/shared`)
- `ipc-channels.ts` — single source of truth for channel names.
- `types.ts` — domain types (Conversation, Message, ProviderConfig, PermissionRequest, ActivityEntry, etc.).
- `contracts.ts` — service interfaces shared conceptually across boundaries (serializable shapes only).

### Main — IPC (`src/main/ipc`)
- Registers handlers for a single domain each (app, settings, conversations, ai, permissions, etc.).
- Does argument validation, then delegates to services. Contains no business logic.

### Main — services (`src/main/services`)
- `app-info.service.ts` — verified runtime diagnostics.
- `system-monitor.service.ts` — real CPU, memory, storage and process telemetry using Node `os`, `process` and `fs.statfs`.
- `database.service.ts` — owns the `node:sqlite` `DatabaseSync` connection, status, transactions and clean shutdown.
- `migrations.ts` — append-only, versioned schema migrations with a recorded migration history.
- `core-services.ts` — composition root; initializes the database and every M3 service, exposes core status, and shuts the database down on quit.
- `settings.service.ts` — typed settings with documented defaults, validation, persistence and reset.
- `secret-cipher.ts` — cipher boundary plus typed secret errors; keeps Electron out of testable services.
- `safe-storage-cipher.ts` — Electron-only `safeStorage` adapter.
- `secrets.service.ts` — encrypted file store (`userData/secrets.bin`), atomic writes, no plaintext fallback, no renderer getter.
- `permissions.service.ts` — capability decisions (`granted` / `denied` / `unset`), enforcement helper and audit logging.
- `activity-log.service.ts` — append-only audit trail with category/severity/outcome filtering and redaction.
- `providers.service.ts` — provider CRUD, activation, model normalization and credential-state reporting.
- `ai/` — provider abstraction described below (M4).

### Main — IPC guards (`src/main/utils`)
- `ipc-guard.ts` — trusted renderer origin checks.
- `validation.ts` — strict record/string/number/enum/array validators used by every M3 handler.
- `redact.ts` — defense-in-depth credential redaction for activity details.

### Planned later services
Voice engine (STT/TTS/wake-word), Windows system control, screen capture/OCR, browser automation, file intelligence, developer tools, workflow engine, plugin/MCP host, productivity.

## 4. Data flow

**Chat message flow (planned Phase 1):**
1. User types in Chat view → renderer store calls `window.jarvis.ai.stream(...)`.
2. Preload validates channel and forwards invoke.
3. Main AI router resolves provider/model from settings, loads decrypted key via `SecretsService`, checks permission for network use if required.
4. Provider adapter yields normalized chunks; main streams chunks back via IPC events.
5. Renderer appends chunks to the current message; final message and conversation are persisted through `ConversationService`.
6. Errors are normalized to `{ code, message, retryable }`; no raw keys or stack traces reach renderer.

**Privileged action flow (implemented for credential writes):**
Renderer invokes `secrets:set` → preload forwards to the allowlisted channel → main validates sender and arguments → `PermissionsService.require('credentials.manage')` → `SecretsService` encrypts with `safeStorage` and writes atomically → `ActivityLogService` records the outcome (redacted) → renderer receives only `SecretStorageStatus`, never the key.

The same order applies to future privileged capabilities: validate, check permission, execute through a dedicated service, log, then return a non-secret result.

## 5. Important interfaces (planned)

```ts
export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  listModels(): Promise<ModelInfo[]>;
  streamChat(request: ChatRequest): AsyncIterable<ChatChunk>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: 'delta' | 'done' | 'error';
  text?: string;
  usage?: TokenUsage;
  error?: NormalizedError;
}

export type PermissionCapability =
  | 'credentials.manage'
  | 'network.request'
  | 'files.read'
  | 'files.write'
  | 'files.delete'
  | 'app.launch'
  | 'system.exec'
  | 'screen.capture'
  | 'microphone.record'
  | 'clipboard.read'
  | 'browser.automate'
  | 'automation.run';

export type PermissionState = 'granted' | 'denied' | 'unset';

export interface PermissionDescriptor {
  capability: PermissionCapability;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  available: boolean; // true only when code enforces it today
  availabilityNote: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  category: 'app' | 'database' | 'settings' | 'provider' | 'permission' | 'security';
  severity: 'info' | 'warning' | 'error';
  action: string;
  outcome: 'success' | 'failure' | 'allowed' | 'denied' | 'info';
  detail: string | null;
}

export interface SecretCipher {
  readonly backend: string;
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}
```

`AiProvider`, `ChatRequest` and `ChatChunk` above remain planned for M4. M3 deliberately does not implement network calls.

## 6. AI provider integration design

- Provider-independent by construction. `AiProvider` is the only contract the router knows.
- First adapter: **OpenAI-compatible HTTP adapter** using `fetch` + SSE parsing. It covers OpenAI, OpenRouter, Groq, DeepSeek, Qwen/GLM OpenAI-compatible endpoints, Gemini compatibility endpoints, and local Ollama with an OpenAI-compatible path.
- Second adapter (planned): native Ollama for model listing/pulling and offline use.
- Optional later: Anthropic adapter. No provider is ever hardcoded as the only option.
- `ProviderRegistry` holds adapter factories keyed by `protocol` (`openai-compatible`, `ollama`, …).
- `ModelRouter` selects a model from user settings plus a task hint (`chat`, `coding`, `reasoning`, `fast`, `vision`). Automatic selection must remain overridable.
- API keys are supplied at runtime through UI settings and stored encrypted. Built-in free endpoints may be offered as *configurations*, never as embedded credentials.
- Streaming, cancellation, retries with backoff, and normalized errors belong in adapters/router, not the UI.

## 7. Database structure (schema v1, implemented)

All paths under Electron `app.getPath('userData')`.

```
jarvis.db (SQLite, WAL)
├── schema_migrations(version PRIMARY KEY, name, applied_at)
├── settings(key PRIMARY KEY, value_json, updated_at)
├── provider_configs(id PRIMARY KEY, name, protocol, base_url, model_ids_json,
│                    enabled, priority, created_at, updated_at)
├── permissions(capability PRIMARY KEY, decision, updated_at)
├── activity_log(id PRIMARY KEY, timestamp, category, severity, action, outcome, detail)
│   └── indexes on timestamp, category, severity
├── conversations(id PRIMARY KEY, title, created_at, updated_at, pinned, archived)
└── messages(id PRIMARY KEY, conversation_id, role, content, created_at,
             token_count, metadata_json, FOREIGN KEY conversation_id)
    └── index on (conversation_id, created_at)
```

`conversations` and `messages` are created in v1 so M4/M5 can persist history without a destructive migration. Memory, automation, task, reminder, app-usage and plugin tables are still planned.

Secrets are **not** stored in SQLite: provider keys live in a `safeStorage`-encrypted file (`secrets.bin`) with opaque `provider:<id>` references. The file is written atomically through a temporary file and never contains plaintext. Migrations are append-only, validated as contiguous, applied inside `BEGIN IMMEDIATE`, and recorded in `schema_migrations`; a database newer than the application refuses to open.

## 8. Security design

- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Navigation is locked to local app origin; external links open in the OS browser after confirmation.
- IPC channel allowlist plus strict per-handler argument validation (`src/main/utils/validation.ts`); unexpected fields and arguments are rejected.
- Every privileged capability is permission-gated and logged. M3 enforces `credentials.manage`; capabilities that are not implemented are visible but cannot be granted.
- Provider API keys never cross the preload bridge in the read direction. The renderer can only set/delete a key and read an aggregate status.
- Activity details are redacted for `sk-...`, `Bearer ...`, and `api_key=...` patterns and capped in length.
- Emergency stop cancels active streams, pauses automations, and revokes session grants (Phase 2/4).
- Screen/microphone indicators are UI-visible whenever capture or listening is active.
- Electron 45 deprecates synchronous `safeStorage`; M3 uses the synchronous API by requirement. Follow-up: migrate to `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync` without changing the `SecretCipher` boundary.

## 9. Architectural decisions log

| ID | Decision | Reason | Date |
| --- | --- | --- | --- |
| ADR-001 | Electron instead of Tauri | MSVC linker missing, no C++ toolchain; Electron builds today | 2026-11-22 |
| ADR-002 | SQLite behind `DatabaseService` | Durable local data; abstraction allows swap if Electron's bundled Node lacks `node:sqlite` | 2026-11-22 |
| ADR-003 | `safeStorage` for secrets | OS-backed encryption, no plaintext credentials | 2026-11-22 |
| ADR-004 | OpenAI-compatible adapter first | One adapter unlocks many providers and offline Ollama | 2026-11-22 |
| ADR-005 | CSS/canvas animation, no animation framework | Visual quality without bundle/runtime cost | 2026-11-22 |
| ADR-006 | Git initialized, no commit yet | Recovery foundation; commits require user approval | 2026-11-22 |
| ADR-007 | Append-only transactional migrations recorded in `schema_migrations` | Safe upgrades, idempotent startup, recoverable failures | 2026-11-23 |
| ADR-008 | Secrets in `secrets.bin`, not SQLite | Keeps ciphertext separate from queryable data; no key material in DB backups/logs | 2026-11-23 |
| ADR-009 | `SecretCipher` boundary with Electron adapter | Services stay unit-testable under Node; Electron isolation remains explicit | 2026-11-23 |
| ADR-010 | Unenforced permissions are visible but locked | Avoids fake consent controls; `available` is the single source of truth | 2026-11-23 |
| ADR-007 | Bundle preload into a single CJS file with Vite | Sandboxed preloads cannot `require` relative modules; unbundled preload failed with `module not found` | 2026-11-22 |
| ADR-008 | Vite `base: './'` | Production assets must resolve from `file://` when Electron loads the built HTML | 2026-11-22 |
| ADR-009 | Pin TypeScript 5.9.3 | Conservative compatibility with Vite 8 / Vitest 5 toolchain | 2026-11-22 |

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ~~Electron's bundled Node may not expose `node:sqlite`~~ | ~~Blocks planned persistence~~ | **Resolved in M1**: Electron 45.4.1 bundles Node 24.22.3 with working `DatabaseSync`; in-memory query returned 1 |
| Electron bundle size (~150MB+) | Disk/install footprint | Accepted trade-off; document in release notes |
| Free model endpoints change or disappear | AI features break | Provider adapters are replaceable; no app-wide dependency on one endpoint |
| Permission fatigue | Users disable safeguards | granular grants (once/session/always), clear UI, visible activity log |
| Screen/voice privacy concerns | Trust and compliance | Explicit opt-in, indicators, easy revoke |
| Async streaming complexity in IPC | Leaks/cancellation bugs | Central stream manager with abort IDs; tests for cancellation |
