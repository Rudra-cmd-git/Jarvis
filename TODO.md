# JARVIS — TODO / Backlog

Priority: P0 = blocks current phase, P1 = next milestone, P2 = later in phase, P3 = future phase.

## Phase 0 — Discovery & Architecture (COMPLETE)

- [x] Inspect environment and existing project
- [x] Evaluate Tauri vs Electron with real toolchain evidence
- [x] Select stack and record reasons
- [x] Define folder structure
- [x] Create `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `TODO.md`
- [x] Initialize Git repository (no commit)
- [x] Define Phase 1 milestones and acceptance criteria

## Phase 1 — Functional Desktop Foundation (COMPLETE — M5 done)

### M1 — Scaffold and prove the shell (P0, COMPLETE)

Acceptance criteria: `npm install`, `npm run typecheck`, `npm run test` pass; Electron window launches and displays data from `window.jarvis.getAppInfo()` through the typed preload bridge. **All criteria verified 2026-11-22.**

- [x] Add `package.json` with pinned, tested versions and scripts
- [x] Add strict TS configs, `vite.config.mts`, `index.html`
- [x] Minimal main process with secure BrowserWindow defaults
- [x] Minimal preload with `contextBridge` allowlist and typed `window.jarvis` API (bundled for sandbox compatibility)
- [x] Minimal React app rendering app info from the bridge
- [x] One real Vitest unit test (4 assertions across 2 helpers)
- [x] Run and record real verification results
- [x] Verify `node:sqlite` inside Electron (available)

### M2 — Design system and navigation (P1, COMPLETE)

Acceptance criteria: all eight navigation destinations open, active state is clear, layout is responsive at common desktop sizes, dashboard shows real system data from main process, no dead buttons. **All criteria verified 2026-11-22.**

- [x] Design tokens (colors, spacing, typography, glass surfaces)
- [x] Window chrome, sidebar, status bar
- [x] Central animated AI core with status states (idle/listening/thinking/speaking/error)
- [x] Eight view shells: Dashboard, Chat, PC Control, Automation, Developer Hub, Knowledge Base, Productivity, Settings
- [x] System monitoring service (CPU/RAM/storage) exposed through IPC and shown on Dashboard
- [x] Quick actions wired to real handlers (navigation, telemetry refresh, diagnostics refresh, confirmed quit)
- [x] Recent conversations, automations and tasks shown as truthful empty states until storage exists

### M3 — Settings, secrets, and persistence (P1, COMPLETE)

Acceptance criteria: settings survive restart; provider keys are encrypted at rest; provider configuration persists; no key ever appears in source, logs, or renderer memory longer than needed. **All criteria verified 2026-11-23.**

- [x] Verify `node:sqlite` inside Electron — available in Electron 45.4.1 / Node 24.22.3
- [x] `DatabaseService` with versioned, transactional migrations and migration history
- [x] Schema v1: settings, provider_configs, permissions, activity_log, conversations, messages
- [x] `SettingsService` with typed defaults, validation, persistence and reset
- [x] `SecretsService` using `safeStorage`, atomic encrypted writes, no plaintext fallback
- [x] `ActivityLogService` with filtering and credential redaction
- [x] `PermissionsService` with grant/deny/revoke, persistence and enforcement
- [x] Strict IPC validation and typed preload methods for all M3 domains
- [x] Provider configuration UI (presets, base URL, model list, enable/disable, priority, write-only key)
- [x] Settings UI: database/migration status, appearance toggles, permissions, activity log
- [x] Unit tests (11 files, 64 tests) and 58-check real-window verification
- [x] Simulated restart persistence and plaintext-absence assertions
- [x] Documentation updated with actual results

M3 verification summary: `npm run typecheck` pass; `npm run test` 64/64 pass; `npm run build` pass; `npm run verify:window` 58/58 pass; `npm run dev` launched `J.A.R.V.I.S. - Foundation`.

Deferred follow-up: migrate synchronous `safeStorage` calls to Electron 45 async variants without changing the `SecretCipher` boundary.

### M4 — AI provider layer (P1, COMPLETE)

Acceptance criteria: at least one real provider responds to a streamed message (proved with a local stub); switching provider/model works without code changes; cancellation stops the stream; errors are normalized. **All criteria verified 2026-11-23.**

- [x] `AiProvider` interface, `ProviderRegistry`, `ModelRouter`
- [x] OpenAI-compatible adapter with SSE streaming, abort support, model listing and non-stream JSON fallback
- [x] Ollama support through the same adapter without Authorization or OpenAI-only fields
- [x] Default model selection through settings plus per-request model override
- [x] Retry/backoff, timeouts and normalized errors
- [x] `network.request` enforcement and terminal activity entries
- [x] Streaming IPC with sender-scoped events and renderer-destroy cancellation
- [x] Settings AI diagnostic with real status, connection test, stream and cancel
- [x] Unit tests (17 files, 95 tests total; 31 new M4 tests)
- [x] Local-stub window verification (78 checks total; 20 new M4 checks)
- [x] Documentation updated with actual results

M4 verification summary: `npm run typecheck` pass; `npm run test` 95/95 pass; `npm run build` pass; `npm run verify:window` 78/78 pass; `npm run dev` launched `J.A.R.V.I.S. - Foundation`.

### M5 — Chat experience (P1, COMPLETE)

Acceptance criteria: send message, see streamed response, stop generation, create/rename/delete conversations, switch model mid-session, conversation history survives restart. **All criteria verified 2026-11-23.**

- [x] Chat view with streaming bubbles
- [x] Conversation sidebar and context management
- [x] Stop-generation control
- [x] Markdown and code-block rendering with copy action
- [x] Persistent conversations and messages in SQLite
- [x] Conversation rename and delete
- [x] Model switching mid-session
- [x] Context capping and duplicate-submission prevention
- [x] Cancelled/error metadata handling
- [x] Unit tests (18 files, 99 tests total; 4 new M5 tests)
- [x] Window verification (84 checks total; 6 new M5 checks)
- [x] Documentation updated with actual results

M5 verification summary: `npm run typecheck` pass; `npm run test` 99/99 pass; `npm run build` pass; `npm run verify:window` 84/84 pass; `npm run dev` launched `J.A.R.V.I.S. - Foundation`.

## Phase 2 — Voice and PC Control (IN PROGRESS — M1 complete)

### P2-M1 — Secure PC-control foundation (P1, COMPLETE)

Acceptance criteria: privileged actions are permission-gated, allowlisted, audited and visibly indicated; emergency stop works. **All criteria verified 2026-11-23.**

- [x] Enforce `app.launch`, `screen.capture`, `clipboard.read` permissions
- [x] `ControlService` with injected Electron-free platform boundary
- [x] Absolute-path application allowlist with real launch
- [x] Clipboard read with no content logging
- [x] Screenshot capture with visible indicator
- [x] Own-window actions (minimize/maximize/restore/focus)
- [x] Emergency stop that aborts AI streams and pauses control
- [x] Activity log category `control` for every action
- [x] PC Control UI with real controls and honest status
- [x] Unit tests (19 files, 106 tests total; 7 new)
- [x] Window verification (95 checks total; 11 new), including real Notepad launch
- [x] Documentation updated with actual results

P2-M1 verification summary: `npm run typecheck` pass; `npm run test` 106/106 pass; `npm run build` pass; `npm run verify:window` 95/95 pass; `npm run dev` launched `J.A.R.V.I.S. - Foundation`.

### P2-M2 — Voice input / push-to-talk (P1, NEXT)

- [ ] Enforce `microphone.record` with explicit opt-in
- [ ] Provider-independent `SpeechToTextAdapter` interface
- [ ] Web Speech API adapter with push-to-talk and configurable language
- [ ] Voice settings with real effects and cloud-backend disclosure
- [ ] Visible LISTENING indicator and auto-stop on blur
- [ ] Transcript inserted into the Chat composer without auto-send
- [ ] Unit tests with mocked recognition events and non-mic window checks

### P2-M3 — Voice output and conversation management (P2)

- [ ] Text-to-speech adapter with OS voice selection
- [ ] Interruptible playback and speaking indicator
- [ ] Voice/text mode switching
- [ ] Stop generation also stops speech

### P2-M4 — Wake-word (P2)

- [ ] Explicit opt-in only, off by default
- [ ] Configurable keyword and visible indicator
- [ ] Activity logging and automatic stop

Deferred from Phase 2 scope (require native APIs or later phases): volume control, arbitrary external-window management, file operations, screen awareness.

## Phase 3 — Intelligence (P3, depends on Phase 1/2)

- [ ] Screen awareness with explicit enable and OCR/vision analysis
- [ ] File intelligence: PDF/DOCX/TXT/spreadsheet parsing and search
- [ ] Browser automation with confirmation before submit
- [ ] Developer Hub: codebase analysis, Git inspection, tests, build monitoring, MCP hooks

## Phase 4 — Automation (P3, depends on Phase 1 services)

- [ ] Workflow engine: triggers, conditions, actions
- [ ] Scheduled workflows and custom commands
- [ ] Reusable templates and workflow history
- [ ] Failure recovery and user approval for sensitive actions
- [ ] Global pause and emergency stop
- [ ] Plugin system and third-party integrations

## Phase 5 — Personal Assistant (P3)

- [ ] User-controlled persistent memory
- [ ] Tasks, reminders, alarms, calendar integration
- [ ] Pomodoro, focus mode, daily schedule, productivity reports, app usage tracking
- [ ] Personalized workflows

## Phase 6 — Optimization and Release (P3)

- [ ] Security review: IPC validation, permission coverage, secret handling
- [ ] Performance profiling and UI polish
- [ ] Error handling and crash recovery
- [ ] electron-builder packaging, installer, setup docs
- [ ] Final E2E verification with Playwright

## Known technical debt / risks

| Item | Type | Mitigation / owner phase |
| --- | --- | --- |
| Tauri unavailable (no MSVC linker) | Environment | Accepted; revisit only with approval |
| ~~`node:sqlite` inside Electron unverified~~ | Technical | **Resolved in M1** — available and queried successfully |
| No linter/formatter configured yet | Tooling | Deferred; add before Phase 2 |
| No E2E tests yet | Testing | Add once UI exists (Phase 6 or earlier) |
| Synchronous `safeStorage` is deprecated in Electron 45 | Security/tooling | Migrate to async variants without changing `SecretCipher`; no plaintext fallback |
| `src/renderer/App.tsx` was untracked | Git | **Resolved in the M3 commit** — now tracked and preserved |
| Reference image not machine-readable by current model | Design | Use written brief; revisit with multimodal agent |
| `origin/main` exists but no push after M3 | Recovery | P2-M1 committed locally; ask before pushing |

Do not mark an item complete until the acceptance criteria are verified and `PROJECT_STATUS.md` is updated with real results.
