# JARVIS — Project Status

Last updated: 2026-11-23 (Phase 1 Milestone 4 complete)

## 1. Overall progress

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 0 | Discovery & Architecture | **Complete** | Environment inspected, stack selected, docs and folder skeleton created |
| 1 | Functional Desktop Foundation | **In progress — M4 complete** | Shell, telemetry, SQLite persistence, encrypted secrets, permissions, activity log, provider configuration and a real AI provider layer |
| 2 | Voice & PC Control | Not started | Depends on Phase 1 |
| 3 | Intelligence | Not started | Depends on Phase 1/2 |
| 4 | Automation | Not started | Depends on Phase 1 services |
| 5 | Personal Assistant | Not started | Depends on storage/AI foundation |
| 6 | Optimization & Release | Not started | Packaging and hardening |

Current: **Phase 1 Milestone 4 complete. Phase 1 Milestone 5 (chat experience) is next.**

## 2. Completed functionality

### Phase 0 and M1–M3 (preserved)
- Electron shell with `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity: true`, strict CSP and allowlisted IPC.
- React UI with eight working navigation views, reusable components, design tokens and live system telemetry.
- SQLite `DatabaseService` with WAL, foreign keys, transactional append-only migrations, migration history, newer-schema rejection and clean shutdown.
- Typed, validated, persistent settings; `safeStorage`-encrypted secrets with no plaintext fallback; permissions; activity log with redaction; provider CRUD UI.

### Phase 1 Milestone 4 (new)
- **Shared AI contracts** (`src/shared/ai.ts`): chat messages/request, chunks, stream event union, normalized `AiError`, status/model-list/start/cancel results, `AiProvider` interface, limits and request-ID pattern.
- **`SseDecoder`**: incremental, chunk-boundary-independent SSE parsing with CRLF, comments, named events, IDs, multi-line data and flush support.
- **`OpenAiCompatibleProvider`**: real `fetch` + SSE streaming for OpenAI, OpenRouter, Groq, DeepSeek, Gemini-compatible endpoints, custom compatible servers and local Ollama. Supports `AbortSignal` cancellation, usage/finish metadata, non-stream JSON fallback, model listing and normalized HTTP/network errors.
- **`ProviderRegistry`** and **`ModelRouter`**: protocol-based adapters; active provider/default model resolution from settings; main-only credential loading at request time.
- **`AiService`**: enforces `network.request`, logs start/completed/failed/retry/cancelled/model-list events, retries retryable failures before the first chunk, applies 120 s request and 15 s model-list timeouts, tracks per-sender streams, and emits terminal events exactly once.
- **Streaming IPC**: `ai:get-status`, `ai:list-models`, `ai:stream-start`, `ai:stream-cancel` plus main→renderer `ai:stream-event`; strict argument validation, trusted-renderer checks, sender-scoped events and cancellation when a renderer is destroyed.
- **Permission catalog**: `network.request` is now enforced and grantable; all other unimplemented capabilities remain locked.
- **Settings AI panel**: real runtime status, network-permission grant, default-model selector, “Test connection” model listing, and a minimal streaming diagnostic with output and cancel. No M5 chat UI.
- **Automated coverage**: 31 new unit tests (95 total) and a 78-check real-window verification using a local HTTP stub server.

## 3. Incomplete / not implemented

- Phase 1 M5: chat view, conversation list and persistence, stop-generation UI, conversation management, assistant presets.
- Phases 2–6: voice, PC control, screen awareness, browser automation, developer tooling, file intelligence, automation engine, productivity, plugins, packaging, release hardening.
- Native Ollama management API (pull/list via `/api/tags`) is not implemented; Ollama works through its OpenAI-compatible `/v1` path.
- Task-based model hints and automatic model selection are not implemented; the user selects the default model explicitly.

## 4. Features currently working

- Real Electron window launches in development and production mode.
- All eight navigation destinations open with distinct, real content and live telemetry.
- SQLite survives restarts; settings and provider configurations persist.
- API keys are encrypted with `safeStorage`, never returned to the renderer, and require `credentials.manage`.
- AI providers can be configured, activated and switched without code changes.
- `network.request` must be granted before any outbound AI call; denial blocks the request before the adapter runs.
- Local-stub verification proves real SSE streaming, assembled output, model listing, model switching, provider switching, retry on 503, normalized 401 errors, cancellation and terminal audit entries.
- The Settings AI panel performs real IPC calls and renders real stream output.
- Typecheck, unit tests, production build, window verification and real dev launch all pass.

## 5. Known issues and blockers

| Issue | Severity | Status |
| --- | --- | --- |
| MSVC linker missing → Tauri/Rust unusable | Medium | Accepted; Electron selected |
| Electron 45 deprecates synchronous `safeStorage` | Low | Accepted for M3/M4; async migration recorded as follow-up |
| Reference image unreadable by this model | Low | Written design brief used; image preserved |
| Sandboxed preload must be bundled | Medium | Handled by `npm run build:preload` |
| No linter configured | Low | Deferred before Phase 2 |
| Stream timeout is a fixed per-attempt value | Low | Acceptable for M4; configurable policy can be added in M5 |
| No push yet | Low | M4 committed locally; ask before pushing |

No source-code bugs are currently known.

## 6. Tests performed and actual results

| Test | Command | Actual result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — main, renderer and test configs, zero errors |
| Unit tests | `npm run test` | Pass — 17 files, **95 tests**, 0 failed |
| Production build | `npm run build` | Pass — main, bundled preload, renderer (CSS 21.92 kB, JS 280.34 kB) |
| Automated window verification | `npm run verify:window` | Pass — **78 checks**, 0 failed |
| Real dev window launch | `npm run dev` | Pass — window title `J.A.R.V.I.S. - Foundation` |

M4 unit tests cover: SSE chunk boundaries/CRLF/multi-line data/flush; error redaction and HTTP status mapping; retry policy, backoff, abortable sleep and timeout signals; OpenAI-compatible streaming, auth headers, finish/usage, 401/429/malformed frames, cancellation and model listing; model routing including missing/disabled providers, overrides, empty model lists and corrupt credentials; and `AiService` start/delta/done events, permission denial, retry/no-retry, cancellation, model listing and status.

`verify:window` additionally covered: preload API surface (22 methods), database restart persistence, permission gates, plaintext absence, provider CRUD, activity redaction, and all M3 UI checks, plus the M4 local-stub checks listed in section 4.

Expected stderr during verification: deliberate invalid-setting/denied-permission/unimplemented-capability/invalid-provider/401/retry/deliberate-telemetry-failure handler errors and `safeStorage` deprecation warnings. They are intentional and are not renderer console errors.

## 7. Current application state

- Runnable: **Yes** (`npm run dev`)
- Database: created on first launch at `app.getPath('userData')/jarvis.db`, schema v1
- Secrets: `userData/secrets.bin`, encrypted by Electron `safeStorage`
- AI providers: configurable and connected to a real streaming adapter
- Voice / PC control / automation: **not implemented**
- Git: M3 commit `48ff77e` and the latest M4 commit exist locally; `origin/main` still points to M3; no push
- Local tooling state `.opencode/` is untracked and must not be committed

## 8. Next action

Begin Phase 1 Milestone 5 from `HANDOFF.md`: the streaming chat experience with persistent conversations. Do not start Phase 2 before M5 is verified.
