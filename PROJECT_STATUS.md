# JARVIS — Project Status

Last updated: 2026-11-23 (Phase 2 Milestone 2 complete)

## 1. Overall progress

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 0 | Discovery & Architecture | **Complete** | Environment inspected, stack selected, docs and folder skeleton created |
| 1 | Functional Desktop Foundation | **Complete — M1–M5 done** | Shell, telemetry, SQLite, secrets, permissions, activity log, AI streaming and persistent chat |
| 2 | Voice & PC Control | **In progress — M1 and M2 complete** | Allowlisted PC control plus permission-gated push-to-talk voice input |
| 3 | Intelligence | Not started | Depends on Phase 1/2 |
| 4 | Automation | Not started | Depends on Phase 1 services |
| 5 | Personal Assistant | Not started | Depends on storage/AI foundation |
| 6 | Optimization & Release | Not started | Packaging and hardening |

Current: **Phase 2 Milestone 2 complete. Phase 2 Milestone 3 (text-to-speech and voice conversation) is next.**

## 2. Completed functionality

### Phase 0, Phase 1 and P2-M1 (preserved)
- Secure Electron shell, typed preload bridge, live telemetry, eight views, SQLite, encrypted secrets, permissions and activity log.
- Provider CRUD, AI streaming, persistent conversations and Markdown chat.
- Allowlisted application launch, clipboard read, screenshot capture, own-window actions, emergency stop and control audit.

### Phase 2 Milestone 2 (new)
- **Enforced `microphone.record`** permission; voice sessions are rejected in main without it.
- **Replaceable `SpeechRecognitionAdapter`** contract with a Chromium Web Speech implementation. The external-service disclosure is shown in Settings and chat.
- **Push-to-talk** via microphone button or configurable keyboard key, with start/stop, cancel, retry, timeout and error states.
- **Visible indicators** in Chat and the status bar while listening or transcribing.
- **Automatic stop** on release, blur, window hide, cancel and error. No background listening.
- **Four voice settings** with real effects: mode, language, push-to-talk key and interim results.
- **Chat integration**: finalized transcripts are inserted into the composer; nothing is auto-sent.
- **Transcript-free audit** of voice session start/end outcomes.
- 12 new unit tests and 8 new window-verification checks.

## 3. Incomplete / not implemented

- Phase 2 M3: text-to-speech, voice selection, interruptible playback and voice/text conversation mode.
- Phase 2 M4: wake-word with explicit opt-in.
- Volume control, arbitrary external-window management, file operations and screen awareness remain unimplemented and are not presented as available.
- Real microphone capture was not automatically verified; it requires explicit user permission and a physical input device.

## 4. Features currently working

- All Phase 1 and P2-M1 functionality remains verified.
- Voice permission can be granted from Settings or Chat; the session gate works in main.
- Web Speech adapter availability is detected and reported honestly.
- Chat composer exposes a push-to-talk control and receives finalized transcripts without auto-sending.
- Voice settings persist and affect the adapter immediately.
- Typecheck, unit tests, production build, window verification and real dev launch all pass.

## 5. Known issues and blockers

| Issue | Severity | Status |
| --- | --- | --- |
| Chromium Web Speech may send audio externally | Medium | Disclosed in UI/docs; adapter interface permits a local engine later |
| Real microphone input cannot be verified headlessly | Medium | Requires explicit user testing; automated tests use mocks |
| MSVC linker missing → Tauri/Rust unusable | Medium | Accepted; Electron selected |
| Electron 45 deprecates synchronous `safeStorage` | Low | Accepted; async migration recorded as follow-up |
| No linter configured | Low | Deferred before Phase 2 completion |
| No push yet | Low | P2-M2 committed locally; ask before pushing |

No source-code bugs are currently known.

## 6. Tests performed and actual results

| Test | Command | Actual result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — main, renderer and test configs, zero errors |
| Unit tests | `npm run test` | Pass — 21 files, **118 tests**, 0 failed |
| Production build | `npm run build` | Pass — main, bundled preload, renderer |
| Automated window verification | `npm run verify:window` | Pass — **103 checks**, 0 failed |
| Real dev window launch | `npm run dev` | Pass — window title `J.A.R.V.I.S. - Foundation` |

P2-M2 unit tests cover unsupported browsers, recognition result ordering, network/microphone error normalization, cancellation, timeout, stop behavior, voice permission gating, session tracking and transcript-free auditing. Window verification covers voice settings defaults, permission denial, session start/end, invalid IDs, audit entries, settings disclosure and the chat push-to-talk control.

## 7. Current application state

- Runnable: **Yes** (`npm run dev`)
- Database: schema v2
- Secrets: encrypted in `userData/secrets.bin`
- AI chat: functional with persistent conversations
- PC control: allowlisted launch, clipboard read, screenshot and own-window actions
- Voice input: push-to-talk enabled; TTS/wake-word not implemented
- Git: P2-M1 commit `0f61785` and the latest P2-M2 commit exist locally; `origin/main` still points to M3; no push
- Local tooling state `.opencode/` is untracked and must not be committed

## 8. Next action

Begin Phase 2 Milestone 3 from `HANDOFF.md`: text-to-speech with voice selection, interruptible playback and voice/text conversation mode.
