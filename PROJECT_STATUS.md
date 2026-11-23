# JARVIS — Project Status

Last updated: 2026-11-23 (Phase 2 Milestone 1 complete)

## 1. Overall progress

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 0 | Discovery & Architecture | **Complete** | Environment inspected, stack selected, docs and folder skeleton created |
| 1 | Functional Desktop Foundation | **Complete — M1–M5 done** | Shell, telemetry, SQLite, secrets, permissions, activity log, AI provider layer and persistent chat |
| 2 | Voice & PC Control | **In progress — M1 complete** | Allowlisted, permission-gated Windows control with emergency stop and audit |
| 3 | Intelligence | Not started | Depends on Phase 1/2 |
| 4 | Automation | Not started | Depends on Phase 1 services |
| 5 | Personal Assistant | Not started | Depends on storage/AI foundation |
| 6 | Optimization & Release | Not started | Packaging and hardening |

Current: **Phase 2 Milestone 1 complete. Phase 2 Milestone 2 (voice input / push-to-talk) is next.**

## 2. Completed functionality

### Phase 0 and Phase 1 (preserved)
- Secure Electron shell, typed preload bridge, live system telemetry, eight navigation views.
- SQLite persistence with versioned migrations, settings, encrypted secrets, permissions and activity log.
- Provider CRUD, AI streaming adapter, retry/cancellation, and persistent streaming chat with Markdown rendering.

### Phase 2 Milestone 1 (new)
- **Enforced permissions** for `app.launch`, `screen.capture` and `clipboard.read`; unimplemented capabilities remain locked.
- **`ControlService`** with an injected `ControlPlatform` boundary; Electron APIs isolated in `electron-control-platform.ts`.
- **Application allowlist** for absolute Windows executable paths; real app launch verified with Notepad.
- **Clipboard read** with length-only audit entries; contents are never logged.
- **Screenshot capture** via `desktopCapturer` to a local screenshots folder with a visible indicator.
- **Own-window actions** (minimize/maximize/restore/focus) for the JARVIS window only.
- **Emergency stop** aborts AI streams, pauses all control actions, and requires explicit resume.
- **PC Control view** with real permission grants, allowlist management, safe actions and honest status.
- **Activity category `control`** for all privileged control actions.
- 7 new unit tests and 11 new window-verification checks, including a real application launch.

## 3. Incomplete / not implemented

- Phase 2 M2: microphone input, STT adapter, push-to-talk and language settings.
- Phase 2 M3: TTS, voice selection, interruption and voice/text mode switching.
- Phase 2 M4: wake-word with explicit opt-in.
- Volume control, arbitrary external-window management, file operations and screen awareness remain unimplemented and are not presented as available.
- Phases 3–6 remain out of scope for now.

## 4. Features currently working

- Phase 1 chat, persistence, AI streaming and all M1–M4 functionality remain verified.
- Allowlisted applications can be added, removed and launched; relative paths are rejected.
- Clipboard text can be read after explicit permission; screenshots are saved locally after permission.
- Emergency stop cancels active AI streams and blocks further control actions until resumed.
- PC Control view renders real status and every control performs an actual operation.
- Typecheck, unit tests, production build, window verification and real dev launch all pass.

## 5. Known issues and blockers

| Issue | Severity | Status |
| --- | --- | --- |
| MSVC linker missing → Tauri/Rust unusable | Medium | Accepted; Electron selected |
| Electron 45 deprecates synchronous `safeStorage` | Low | Accepted; async migration recorded as follow-up |
| Chromium Web Speech (planned M2) is cloud-backed | Medium | Must be disclosed in UI; adapter interface allows a local engine later |
| Volume control and external window APIs unavailable without native modules | Medium | Deferred; no native dependency added without approval |
| No linter configured | Low | Deferred before Phase 2 completion |
| No push yet | Low | P2-M1 committed locally; ask before pushing |

No source-code bugs are currently known.

## 6. Tests performed and actual results

| Test | Command | Actual result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — main, renderer and test configs, zero errors |
| Unit tests | `npm run test` | Pass — 19 files, **106 tests**, 0 failed |
| Production build | `npm run build` | Pass — main, bundled preload, renderer |
| Automated window verification | `npm run verify:window` | Pass — **95 checks**, 0 failed |
| Real dev window launch | `npm run dev` | Pass — window title `J.A.R.V.I.S. - Foundation` |

P2-M1 unit tests cover allowlist validation, permission gates, clipboard truncation and non-disclosure, window action delegation, and emergency stop/resume. Window verification additionally proved real clipboard read, real screenshot capture, real Notepad launch/cleanup, path validation rejection, emergency-stop stream cancellation and pause enforcement.

## 7. Current application state

- Runnable: **Yes** (`npm run dev`)
- Database: schema v2
- Secrets: `userData/secrets.bin`, encrypted by Electron `safeStorage`
- AI chat: functional with persistent conversations
- PC control: allowlisted launch, clipboard read, screenshot and own-window actions
- Voice / wake-word / automation: **not implemented**
- Git: M5 commit `e2a3404` and the latest P2-M1 commit exist locally; `origin/main` still points to M3; no push
- Local tooling state `.opencode/` is untracked and must not be committed

## 8. Next action

Begin Phase 2 Milestone 2 from `HANDOFF.md`: modular speech-to-text with push-to-talk, explicit microphone permission and visible indicator.
