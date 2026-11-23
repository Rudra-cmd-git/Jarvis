# JARVIS — Handoff

## 1. Exact development stage

**Phase 2 — Voice and PC Control, Milestone 2: COMPLETE.**
Phase 0, Phase 1 and P2-M1 are preserved. P2-M2 adds explicit push-to-talk voice input with a replaceable speech-to-text adapter, microphone permission enforcement, visible indicators and composer integration.

## 2. Last completed task

Implemented P2-M2:

- Enforced `microphone.record` permission and added `VoiceService` session lifecycle/audit.
- `SpeechRecognitionAdapter` contract in `src/shared/voice.ts`.
- Chromium Web Speech adapter with interim results, timeout, cancel, stop and normalized errors.
- Four persisted voice settings with real effects.
- VoiceProvider with permission gate, listening/processing states, live preview, cancel/retry, transcript delivery and blur auto-stop.
- Chat composer push-to-talk control; status-bar microphone indicator; Settings VoicePanel with external-service disclosure.
- 12 new unit tests and 8 new window-verification checks.

## 3. Current unfinished task

None inside P2-M2. The next task is **Phase 2 Milestone 3: text-to-speech and voice conversation**, defined in section 9.

## 4. Files created / modified

Created (P2-M2):
- `src/shared/voice.ts`
- `src/main/services/voice.service.ts`
- `src/main/ipc/voice.ipc.ts`
- `src/renderer/voice/web-speech.adapter.ts`
- `src/renderer/state/voice-context.tsx`
- `src/renderer/components/settings/VoicePanel.tsx`
- `tests/unit/voice-web-speech.test.ts`
- `tests/unit/voice-service.test.ts`

Modified (P2-M2):
- `src/shared/settings.ts`, `src/shared/permissions.ts`, `src/shared/ipc-channels.ts`, `src/shared/types.ts`
- `src/main/services/core-services.ts`, `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/App.tsx`, `src/renderer/views/Chat.tsx`, `src/renderer/views/Settings.tsx`
- `src/renderer/components/layout/StatusBar.tsx`, `src/renderer/styles/global.css`
- `scripts/verify-window.cjs`
- `tests/unit/settings.test.ts`, `tests/unit/permissions.test.ts`
- `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `TODO.md`, `README.md`

Preserved untouched: `Futuristic JARVIS Holographic Desktop Interface.png`.

## 5. Important implementation details

### Voice sessions
- `VoiceService` tracks sessions by ID and sender. `voice:session-start` checks `microphone.record`; `voice:session-end` logs outcome, character count and duration without transcript text.
- Destroying a renderer cancels its sessions; shutdown clears all sessions.
- IPC validates session IDs, adapter IDs, language, outcome and character count.

### Web Speech adapter
- Feature-detects `SpeechRecognition` / `webkitSpeechRecognition`.
- Emits normalized events: `ready`, `audio-start`, `sound-start`, `transcript`, `error`, `end`.
- Maps recognition errors to `permission_denied`, `no_speech`, `network`, `aborted`, `no_microphone`, `timeout` and `unknown`.
- 12-second no-final-transcript timeout. Uses `continuous = false` and does not record audio.
- `getConstructor` is injectable for unit tests.

### Renderer voice layer
- `VoiceProvider` is mounted inside `CoreProvider`, `ControlProvider` and below `RuntimeProvider`.
- Transcripts are accumulated into `pendingTranscript`; Chat consumes and clears it, appending to the composer.
- Push-to-talk is triggered by pointer hold on the mic button or the configured global key (outside editable fields).
- `stop()` ends gracefully; `cancel()` aborts; blur/visibilitychange auto-cancels.
- Web Speech cloud disclosure is rendered in both the Chat preview and Settings panel.

## 6. Errors and blockers encountered

| Error / blocker | Resolution |
| --- | --- |
| Final transcript was skipped after an interim result | Adapter now uses `event.resultIndex` rather than a running maximum |
| Unused helper in VoiceProvider | Removed |
| Verification subscription was reloaded away | Re-subscribed before late stream checks in the harness |

No unresolved source-code errors are known.

## 7. Last successful verification

Executed on 2026-11-23:

- `npm run typecheck` — pass, zero errors.
- `npm run test` — 21 files, 118 tests, 0 failed.
- `npm run build` — pass; main, bundled preload, renderer.
- `npm run verify:window` — 103 checks, 0 failed.
- `npm run dev` — real window launched with title `J.A.R.V.I.S. - Foundation`.

Real microphone capture was **not** automatically verified. Automated tests use mocked recognition objects; Web Speech API availability was confirmed in the real window.

## 8. Git status

- Commit `0f61785` — P2-M1 checkpoint.
- Latest commit on `main` — P2-M2 complete (source, tests, verification harness and documentation).
- `origin/main` still points to M3; no push has been performed.
- `.opencode/` remains untracked local tooling state and must not be committed.
- **Do not commit or push without explicit user approval.**

## 9. Exact next development task (Phase 2 Milestone 3)

**Text-to-speech and voice conversation management.** Scope:

1. Add a provider-independent `TextToSpeechAdapter` interface with voice selection and interruption.
2. Implement an OS-voice adapter using the browser `speechSynthesis` API; disclose that voice availability depends on the OS.
3. Add voice settings with real effects: TTS enabled, voice URI/name, rate and pitch.
4. Speak finalized assistant responses in voice mode only; never speak automatically in text mode.
5. Add a speaking indicator and stop-speech control; stopping generation must also stop speech.
6. Ensure speech stops on conversation switch, window blur and emergency stop.
7. Add unit tests with mocked synthesis events and non-audio window checks.
8. Update all continuity docs after verification.

Out of scope for P2-M3: wake-word detection, voice commands that control the PC.

## 10. Instructions for the next AI agent

1. Follow the takeover protocol in `AGENTS.md` exactly.
2. Verify the current implementation with typecheck, tests, build and `verify:window` before changing anything.
3. Reuse the existing permission, activity, settings, AI streaming and voice-session services.
4. Never silently activate the microphone or speakers; visibility and explicit consent are mandatory.
5. Do not reintroduce Tauri/Rust or add native dependencies without approval.
6. Keep the reference image untouched and do not commit without approval.
