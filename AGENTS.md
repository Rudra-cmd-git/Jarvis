# JARVIS — Agent Instructions

> This file is the primary rulebook for every AI model or human developer working on this project.
> Read it together with `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, and `TODO.md` before changing code.

## 0. Takeover protocol (mandatory)

Every new AI model MUST, in this order:

1. Read `AGENTS.md`.
2. Read `ARCHITECTURE.md`.
3. Read `PROJECT_STATUS.md`.
4. Read `HANDOFF.md`.
5. Read `TODO.md`.
6. Inspect the actual source files (do not trust documentation blindly).
7. Check `git status` and recent commits.
8. Verify the previous implementation (build/test).
9. Identify the exact next unfinished task from `HANDOFF.md`.
10. Continue from that point only.

A new agent MUST NOT rebuild the project from scratch, rewrite working modules without reason, repeat completed features, replace the architecture unnecessarily, or assume documentation is accurate without verification.

## 1. Project purpose

JARVIS is a real, premium, functional Windows personal AI assistant — not a UI mockup. It must understand natural language, control the PC with explicit permission, automate workflows, manage files and knowledge, assist with coding, and support natural voice interaction. Visual design matters, but functionality, reliability, security, and usability come first.

## 2. Confirmed technology stack (Phase 0 decision)

| Concern | Decision | Status |
| --- | --- | --- |
| Desktop shell | Electron (latest stable at scaffold time) | Confirmed by user 2026-11-22 |
| UI | React + TypeScript + Vite | Confirmed |
| Local persistence | SQLite behind a `DatabaseService` abstraction | Verified in Electron 45.4.1: `node:sqlite` available |
| State | Zustand + typed IPC contracts | Planned |
| Icons | lucide-react | Planned |
| Animation | CSS keyframes + canvas, no heavy animation library | Planned |
| Packaging | electron-builder | Planned for Phase 6 |
| Unit tests | Vitest | Planned |
| E2E tests | Playwright | Deferred until UI exists |

Candidate versions observed from npm on 2026-11-22 (pin exact versions when `package.json` is created): electron 45.4.1, react 19.3.1, vite 8.3.8, vitest 5.1.1, electron-builder 26.18.0, zustand 5.1.0, lucide-react 1.77.0, TypeScript (pin at scaffold time).

**Tauri is rejected for now.** The local Rust toolchain can compile but cannot link (`link.exe` not found), and there is no MinGW/GCC fallback. Do not reintroduce Tauri without explicit user approval and an installed C++ linker.

## 3. Architecture summary

Three-process-boundary design:

- **Renderer** (React): presentation only. No Node access, no secrets, no direct system calls.
- **Preload** (`contextBridge`): narrow, typed API surface. Allowlisted IPC channels only.
- **Main** (Electron/Node): services for AI providers, storage, permissions, activity logging, and later voice, Windows control, screen awareness, automation, plugins.

See `ARCHITECTURE.md` for module responsibilities, interfaces, data flow, database schema, and decisions.

## 4. Initial folder structure

```
jarvis/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── ipc/                 # IPC handlers (thin, delegate to services)
│   │   ├── services/
│   │   │   └── ai/              # AI provider adapters + router
│   │   └── utils/
│   ├── preload/                 # contextBridge typed API
│   ├── renderer/                # React UI
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── ai-core/
│   │   │   └── common/
│   │   ├── views/               # Dashboard, Chat, PC Control, Automation, etc.
│   │   ├── store/
│   │   └── styles/
│   └── shared/                  # Types, IPC channel constants, contracts
├── tests/
│   ├── unit/
│   └── e2e/
├── resources/                   # Icons and static assets
├── scripts/                     # Build/dev helper scripts
├── AGENTS.md
├── ARCHITECTURE.md
├── PROJECT_STATUS.md
├── HANDOFF.md
├── TODO.md
├── README.md
└── .gitignore
```

## 5. Coding standards

- TypeScript `strict: true`. Avoid `any`; use `unknown` plus narrowing when types are genuinely dynamic.
- One responsibility per module. Main-process side effects live in services, never in IPC handlers or React components.
- All shared types and IPC channel names live in `src/shared`. Never duplicate channel strings.
- The preload MUST be bundled into one CommonJS file (`npm run build:preload`). Sandboxed preloads cannot `require` arbitrary relative modules; unbundled preloads fail with `module not found`.
- Every feature that touches the OS, network, files, or consequential state goes through a service with an explicit interface.
- No API keys, tokens, or credentials in source, tests, `.env` files committed to Git, or logs. Use `SecretsService` (Electron `safeStorage`).
- Sensitive or destructive actions require `PermissionService` approval and an `ActivityLog` entry.
- Prefer small, pure, testable functions. Test business logic; avoid brittle UI snapshot tests early on.
- Keep the cinematic visual language consistent: dark navy/black, cyan/electric-blue accents, glass panels, restrained motion. No decoration that hides function.
- Write comments that explain *why*, not *what*.
- Use 2-space indentation and single quotes in TypeScript/TSX unless a formatter is configured otherwise.
- Never report simulated or assumed results as real test results.

## 6. Security requirements

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on all BrowserWindows.
- Allowlist IPC channels; validate every argument at the main-process boundary.
- Encrypt secrets with Electron `safeStorage`; never persist plaintext credentials.
- Ask before deleting important files, installing software, executing consequential system commands, sending messages, or submitting forms.
- Maintain an activity log for automation and privileged actions.
- Provide an emergency stop and a global automation pause.
- Never silently execute unrestricted terminal commands.
- Screen awareness and microphone must be explicitly enabled with visible indicators.

## 7. Build and test commands (implemented and verified in Phase 1 M1)

```
npm install         # install pinned dependencies
npm run dev         # Vite dev server + Electron window
npm run typecheck   # tsc --noEmit for main and renderer
npm run test        # vitest run
npm run build       # main + bundled preload + renderer
npm run probe:sqlite     # verify node:sqlite inside Electron
npm run verify:window    # verify renderer + preload + IPC in a real window
npm run lint        # not configured yet
```

All commands above except `lint` were executed successfully in M1. See `PROJECT_STATUS.md` for actual results.

## 8. Development workflow

1. Implement one coherent milestone at a time (see `TODO.md`).
2. Verify with typecheck/tests after each meaningful change.
3. Update `PROJECT_STATUS.md`, `HANDOFF.md`, and `TODO.md` after every significant milestone.
4. Update `ARCHITECTURE.md` whenever an architectural decision changes.
5. Keep `AGENTS.md` synchronized with important new project rules.
6. Ask before committing or pushing. Never reset, force-push, or discard user changes.
7. Keep the existing reference image `Futuristic JARVIS Holographic Desktop Interface.png` untouched.

## 9. Phase boundaries

Phase 0 (complete): discovery, architecture, docs, folder skeleton.
Phase 1 (current): functional desktop foundation. M1, M2, M3, M4 and M5 are complete; Phase 1 is complete and Phase 2 (voice and PC control) is next.
Phase 2: voice + PC control. Phase 3: intelligence. Phase 4: automation. Phase 5: personal assistant. Phase 6: optimization/release.

Do not start a later phase while an earlier milestone is unverified.

## 10. M3 storage and security rules (implemented)

- Main-process services must not import `electron` unless the file is explicitly Electron-specific. Electron APIs are isolated in `safe-storage-cipher.ts`; core services are unit-testable under Node.
- All database access goes through `DatabaseService`; migrations are append-only and transactional. Never edit an applied migration.
- Settings are typed, validated against `src/shared/settings.ts`, and persisted in SQLite. A setting without a real UI effect is not added.
- Secrets live only in `userData/secrets.bin` encrypted by Electron `safeStorage`. They are never stored in SQLite, never returned to the renderer, never logged, and never written in plaintext. If `safeStorage` is unavailable, saving fails explicitly with no fallback.
- Provider credentials use the reference `provider:<providerId>`. Provider summaries expose only `credentialState`.
- Credential writes require the `credentials.manage` permission. Outbound AI requests require `network.request`. Capabilities that are not enforced yet are listed but cannot be granted.
- Every privileged operation writes an activity entry; details are redacted for recognizable key patterns and length-capped.
- `tsconfig.test.json` includes main services/utils and excludes `safe-storage-cipher.ts` (Electron-only).
- Electron 45 deprecates the synchronous `safeStorage` API. M3 intentionally uses `isEncryptionAvailable()` / `encryptString()` / `decryptString()`; migrating to the async variants is a recorded follow-up, not a reason to add a plaintext fallback.

## 11. M4 AI layer rules (implemented)

- All network access happens in main-process adapters. The renderer never calls AI endpoints directly and never receives a credential, request body or raw provider payload.
- `ModelRouter` loads `provider:<id>` through `SecretsService.getSecretInternal()` at request time; no secret may be added to IPC results, stream events, status payloads or activity details.
- Every outbound request, including model listing, requires the `network.request` permission and produces an activity entry.
- Streaming uses `ai:stream-event` sent only to the originating renderer. A stream must emit exactly one terminal event (`done`, `error` or `cancelled`) and one matching terminal activity entry.
- Retries are allowed only before the first `delta`; retrying after emitted content would duplicate visible output.
- Destroying a renderer aborts its streams; application shutdown aborts all streams before closing the database.
- Provider adapters are selected by protocol through `ProviderRegistry`. Do not hardcode a vendor as the only option.
- M4 contains only a Settings diagnostic. The full chat UI and conversation persistence belong to M5.

## 12. M5 chat and persistence rules (implemented)

- Conversations and messages persist through `ConversationService`; the renderer never writes SQL directly.
- `AiService` remains the only streaming implementation. The Chat view renders events; it does not create a second transport.
- User messages are persisted before streaming starts. Assistant messages are persisted only after a terminal event, with metadata recording `complete`, `cancelled` or `error`.
- Cancelled streams never mark an assistant message complete.
- Context sent to a provider is capped to the most recent 40 messages and 100,000 characters, dropping oldest messages first.
- Duplicate submissions are prevented while a stream is active.
- Markdown rendering is presentational only; it must not execute scripts or fetch remote resources. Links open in the system browser after confirmation in later phases.
- Conversation deletion cascades to messages and requires confirmation.
- Restart persistence is verified with a real database reopen and renderer reload.
