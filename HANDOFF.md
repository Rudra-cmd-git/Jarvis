# JARVIS — Handoff

## 1. Exact development stage

**Phase 1 — Functional Desktop Foundation, Milestone 3: COMPLETE.**
Phase 0, M1 and M2 are preserved. M3 adds SQLite persistence, typed settings, encrypted secrets, permissions, an activity log and provider configuration.

## 2. Last completed task

Implemented M3:

- `DatabaseService` over `node:sqlite` with WAL, foreign keys, transactional append-only migrations, migration history, newer-schema rejection and clean shutdown.
- Schema v1: `settings`, `provider_configs`, `permissions`, `activity_log`, `conversations`, `messages`, `schema_migrations`, plus indexes.
- `SettingsService` with four typed, validated, persisted settings and reset.
- `SecretsService` with Electron `safeStorage`, atomic encrypted file writes, typed failures and no plaintext fallback.
- `PermissionsService`, `ActivityLogService` and `ProvidersService`.
- Composition root that initializes before the window and closes the database on quit.
- Strict IPC handlers, preload bridge methods and a fully functional Settings UI.
- 64 unit tests and a 58-check real-window verification, plus a real dev-window launch.

## 3. Current unfinished task

None inside M3. The next task is Phase 1 Milestone 4, defined in section 9.

## 4. Files created / modified

Created (M3):
- `src/shared/settings.ts`
- `src/shared/permissions.ts`
- `src/shared/providers.ts`
- `src/main/services/migrations.ts`
- `src/main/services/database.service.ts`
- `src/main/services/settings.service.ts`
- `src/main/services/secret-cipher.ts`
- `src/main/services/secrets.service.ts`
- `src/main/services/safe-storage-cipher.ts`
- `src/main/services/permissions.service.ts`
- `src/main/services/activity-log.service.ts`
- `src/main/services/providers.service.ts`
- `src/main/services/core-services.ts`
- `src/main/utils/validation.ts`
- `src/main/utils/redact.ts`
- `src/main/ipc/database.ipc.ts`
- `src/main/ipc/settings.ipc.ts`
- `src/main/ipc/secrets.ipc.ts`
- `src/main/ipc/providers.ipc.ts`
- `src/main/ipc/permissions.ipc.ts`
- `src/main/ipc/activity.ipc.ts`
- `src/renderer/state/core-context.tsx`
- `src/renderer/components/settings/StoragePanel.tsx`
- `src/renderer/components/settings/AppearancePanel.tsx`
- `src/renderer/components/settings/ProvidersPanel.tsx`
- `src/renderer/components/settings/PermissionsPanel.tsx`
- `src/renderer/components/settings/ActivityPanel.tsx`
- `tests/unit/database.test.ts`
- `tests/unit/settings.test.ts`
- `tests/unit/secrets.test.ts`
- `tests/unit/permissions.test.ts`
- `tests/unit/activity-log.test.ts`
- `tests/unit/providers.test.ts`
- `tests/unit/validation.test.ts`

Modified (M3):
- `src/shared/types.ts`, `src/shared/ipc-channels.ts`
- `src/main/index.ts`, `src/main/ipc/app.ipc.ts`
- `src/preload/index.ts`
- `src/renderer/App.tsx`
- `src/renderer/views/Settings.tsx`
- `src/renderer/styles/global.css`
- `scripts/verify-window.cjs`
- `tsconfig.test.json`
- `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `TODO.md`

Preserved untouched: `Futuristic JARVIS Holographic Desktop Interface.png`.

## 5. Important implementation details

### Database
- `DatabaseService` uses `DatabaseSync` from `node:sqlite`; verified in Electron 45.4.1 / Node 24.22.3.
- The database lives at `app.getPath('userData')/jarvis.db`.
- Migrations must be contiguous from 1. They are applied inside `BEGIN IMMEDIATE`; each success is recorded in `schema_migrations`; failures roll back and throw a safe message.
- A database whose highest applied version exceeds the app's known version refuses to open.
- `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- `DatabaseService.transaction()` is available for future multi-statement writes.
- `core-services.ts` catches initialization failure and exposes a truthful fallback status instead of crashing the window.

### Settings
- Keys and defaults live in `src/shared/settings.ts`. Validation is shared by services and IPC.
- `ui.reduceMotion` adds `.app-shell--reduce-motion` and disables animations/transitions.
- `ui.compactSidebar` adds `.app-shell--compact`, collapsing the sidebar at any window width.
- `ai.activeProviderId` and `ai.defaultModel` are written by `ProvidersService`.
- Unknown/corrupt stored values fall back to documented defaults.

### Secrets
- `SecretCipher` is the testable boundary; `SafeStorageCipher` is the only Electron-importing implementation.
- Secrets are stored in `userData/secrets.bin` as base64 ciphertext with `version`, `entries` and timestamps. Writes use a temporary file and rename.
- IDs match `^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$`; values are 1–8192 characters.
- `SecretsService.getSecretInternal()` is main-process only and must never be wired to IPC.
- If `safeStorage` is unavailable, `setSecret` throws `SecretStorageUnavailableError` and nothing is written. There is no plaintext fallback.
- The renderer receives only `SecretStorageStatus` (availability, backend, entry count, error).
- Electron 45 deprecation warnings for synchronous `safeStorage` are expected. Migration to async variants is a follow-up.

### Permissions
- `PERMISSION_CATALOG` lists every planned capability. `available: true` means code enforces it today.
- Only `credentials.manage` is available. The IPC handler rejects grant/deny/revoke for unavailable capabilities.
- Decisions are `granted` / `denied` / `unset`; revoke deletes the row.
- Credential set/delete calls `permissions.require('credentials.manage')` before touching the secret store.

### Activity log
- Categories: `app`, `database`, `settings`, `provider`, `permission`, `security`.
- Severities: `info`, `warning`, `error`. Outcomes: `success`, `failure`, `allowed`, `denied`, `info`.
- `list()` supports category, severity, query and limit (1–200, default 50).
- `redactSensitiveText` strips control characters, redacts `sk-...`, `Bearer ...` and `api_key/secret/password = ...` patterns, collapses whitespace and caps length.
- Logging failures never break the operation (`tryRecord`).

### Providers
- Supported protocols: `openai-compatible`, `ollama`.
- Presets prefill the form only; stored providers are fully editable.
- Base URLs must be absolute `http`/`https`, contain no embedded credentials and no fragment.
- Model IDs are trimmed, de-duplicated and capped at 20.
- Provider summaries expose `credentialState` (`configured` / `missing` / `error`) but never the key.
- Removing a provider also deletes `provider:<id>` and clears the active provider/default model if needed.

### IPC and preload
- Every M3 handler calls `assertTrustedRenderer` and validates argument count, record shape, allowed fields and value types.
- Settings and secret payloads are objects (`{ key, value }`, `{ id, value }`), not positional strings, so unexpected fields are rejected.
- The preload allowlist is derived from `IPC_CHANNELS`; there is no generic invoke.
- `JarvisApi` in `src/shared/types.ts` is the single typed surface.

### Renderer
- `CoreProvider` loads database status, settings, providers, permissions and activity in parallel and exposes mutation methods that update context from main-process responses.
- Settings UI panels: storage/migrations/safeStorage, appearance toggles, provider CRUD + write-only key editor, permissions, filtered activity, runtime diagnostics, quit.
- No fake controls: unavailable permissions are disabled, key controls require `credentials.manage`, destructive provider/key removal asks for confirmation.
- `src/renderer/App.tsx` remains untracked from M2 and was preserved; it now applies the shell classes from persisted settings.

## 6. Errors and blockers encountered

| Error / blocker | Resolution |
| --- | --- |
| `SettingsService`/IPC key typing (`string` vs `keyof AppSettings`) | `parseKey` returns `SettingKey` |
| `ProviderValidationErrors` lacked `id`/`enabled` | Added both optional fields |
| Unused import in `activity.ipc.ts` | Removed |
| `tsconfig.test.json` did not include main services | Expanded includes and excluded Electron-only `safe-storage-cipher.ts` |
| Verify UI assertions read stale renderer context after API mutations | Reload the renderer before UI assertions |
| Windows cleanup `EPERM` on temp userData | Close core services, destroy window, then retry `rmSync` inside try/catch |
| safeStorage sync deprecation warnings | Accepted for M3; async migration recorded as follow-up |
| Dev server killed after verification | Expected `taskkill` exit code 1 |

No unresolved source-code errors are known.

## 7. Last successful verification

Executed on 2026-11-23:

- `npm run typecheck` — pass, zero errors.
- `npm run test` — 11 files, 64 tests, 0 failed.
- `npm run build` — pass; main, bundled preload, renderer.
- `npm run verify:window` — 58 checks, 0 failed.
- `npm run dev` — real window launched with title `J.A.R.V.I.S. - Foundation`.

The verification harness uses an isolated temporary `userData` directory, exercises real IPC and UI controls, simulates a restart, and asserts that the dummy key never appears in `secrets.bin`, `jarvis.db` or the WAL.

## 8. Git status

- Commit `5a4eda4` — M2 checkpoint.
- Latest commit on `main` — M3 complete (source, tests, verification harness and documentation).
- Working tree is clean; `src/renderer/App.tsx` is now tracked and preserved.
- No remote and no push.
- **Do not commit without explicit user approval.**

## 9. Exact next development task (Phase 1 Milestone 4)

**AI provider layer.**

Scope:

1. Define the `AiProvider` interface and normalized request/chunk/error types in `src/shared` (the M3 `AiProvider` sketch in `ARCHITECTURE.md` is the starting point).
2. Implement an OpenAI-compatible adapter using `fetch` + SSE streaming with `AbortSignal` cancellation. It must cover OpenAI, OpenRouter, Groq, DeepSeek, Gemini-compatible endpoints and local Ollama's OpenAI-compatible path.
3. Implement a `ProviderRegistry` keyed by protocol and a `ModelRouter` that resolves the active provider and model from `SettingsService` and `ProvidersService`.
4. Load the API key at request time via `SecretsService.getSecretInternal()` in the main process only. Never send it to the renderer or log it.
5. Add `network.request` enforcement (grant it in the permission catalog when the adapter exists) and activity entries for request start/finish/failure.
6. Normalize errors to `{ code, message, retryable }`; add retry/backoff and cancellation.
7. Add IPC channels for provider health/model listing and a streamed chat request/response path. Keep argument validation and trusted-renderer checks.
8. Add unit tests for SSE parsing, routing, error normalization, retry policy and cancellation. Extend `verify:window` only with real, non-network-dependent checks or a local stub server.
9. Do not implement the M5 chat UI yet. A minimal Developer Hub or Settings diagnostic may call the adapter if needed, but streaming chat belongs to M5.

Acceptance criteria:

- At least one real provider can be configured and respond to a streamed message (or a local stub proves the adapter path if no real key is available).
- Switching provider/model works through settings without code changes.
- Cancellation stops the stream and leaves no orphaned activity.
- Errors are normalized and secrets never appear in renderer state or logs.
- `npm run typecheck`, `npm run test`, `npm run build`, `npm run verify:window` and a real dev launch pass.
- Documentation updated after the milestone.

Out of scope for M4: voice, PC control, automation, full chat UI.

## 10. Instructions for the next AI agent

1. Follow the takeover protocol in `AGENTS.md` exactly.
2. Verify the current implementation with typecheck, tests, build and `verify:window` before changing anything.
3. Read `ARCHITECTURE.md` sections 4–9 and the M3 source before designing M4.
4. Preserve `src/renderer/App.tsx` and all M3 behavior.
5. Keep provider keys in the main process only; never add a renderer getter.
6. Do not reintroduce Tauri/Rust or add a native SQLite driver.
7. Keep the reference image untouched and do not commit without approval.
