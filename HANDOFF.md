# JARVIS — Handoff

## 1. Exact development stage

**Phase 1 — Functional Desktop Foundation: COMPLETE.**
M1–M5 are implemented and verified. The application now has a real streaming chat experience with persistent conversations, Markdown rendering, provider/model selection and restart-safe storage.

## 2. Last completed task

Implemented M5:

- `ConversationService` with create, list, get, rename, delete, model selection and message append/list.
- Schema migration v2 adding `conversations.model`.
- Conversation IPC handlers and preload methods with strict validation.
- Chat view rewrite: conversation sidebar, streaming bubbles, Markdown/code rendering, composer, stop generation, model selector, auto-scroll and loading/error/empty states.
- Context capping (40 messages / 100,000 characters), duplicate-submission prevention and cancelled/error metadata.
- 4 new unit tests and 6 new window-verification checks, including restart persistence and real UI streaming.

## 3. Current unfinished task

None inside Phase 1. The next task is Phase 2, defined in section 9.

## 4. Files created / modified

Created (M5):
- `src/shared/conversations.ts`
- `src/main/services/conversation.service.ts`
- `src/main/ipc/conversations.ipc.ts`
- `src/renderer/components/chat/MarkdownMessage.tsx`
- `src/renderer/views/Chat.tsx` (rewritten)
- `tests/unit/conversation.test.ts`

Modified (M5):
- `src/main/services/migrations.ts` (migration v2)
- `src/main/services/database.service.ts` (highest-known fallback fix)
- `src/main/services/core-services.ts`
- `src/main/index.ts`
- `src/shared/types.ts`, `src/shared/ipc-channels.ts`
- `src/preload/index.ts`
- `src/renderer/state/core-context.tsx`
- `src/renderer/styles/global.css`
- `scripts/verify-window.cjs`
- `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `TODO.md`, `README.md`

Preserved untouched: `Futuristic JARVIS Holographic Desktop Interface.png`.

## 5. Important implementation details

### Conversation persistence
- `ConversationService` owns all conversation/message SQL. Messages are ordered by `created_at, rowid`.
- `conversations` already existed in schema v1; migration v2 adds `model TEXT`.
- `appendMessage` updates `conversations.updated_at`.
- Deleting a conversation cascades to messages through the foreign key.
- Titles are 1–120 characters; message content is 1–100,000 characters.

### Chat runtime
- The Chat view auto-creates a conversation on first load when none exist.
- User messages are persisted before streaming starts.
- Assistant messages are persisted after `done`, `error` or `cancelled`, with metadata `{ status, ... }`. Empty cancelled/error drafts are not persisted.
- `handleSend` builds context from `conversationMessages` plus the new user message, capped by `capMessages`.
- `activeRequestId` is a ref so the single event subscription remains stable.
- Model changes call `setConversationModel` when a conversation is active, otherwise update the global default.
- Rename uses `window.prompt`; delete uses `window.confirm`.

### Markdown rendering
- `MarkdownMessage` renders headings, paragraphs, lists, inline code, bold, italic, links and fenced code blocks.
- Fenced code blocks include a Copy button using `navigator.clipboard`.
- Rendering is presentational only; no script execution.

### Verification
- `verify:window` now has 84 checks, including conversation rename/delete, persistence before and after restart, and real chat UI streaming.
- The local HTTP stub remains the only network dependency.

## 6. Errors and blockers encountered

| Error / blocker | Resolution |
| --- | --- |
| Duplicate `Conversation*` imports in `types.ts` | Removed the duplicate import block |
| Unused conversation types in IPC handler | Removed type-only import |
| `highestKnown` defaulted to `LATEST_SCHEMA_VERSION` | Changed fallback to `0` so an empty migration set supports no schema |
| `afterRestart` variable collision in verify harness | Renamed persistence variable to `afterConversationRestart` |
| Chat UI navigation left settings checks stranded | Navigated back to settings before provider-form checks |
| Markdown file accidentally contained planning text | Rewrote the file cleanly |

No unresolved source-code errors are known.

## 7. Last successful verification

Executed on 2026-11-23:

- `npm run typecheck` — pass, zero errors.
- `npm run test` — 18 files, 99 tests, 0 failed.
- `npm run build` — pass; main, bundled preload, renderer.
- `npm run verify:window` — 84 checks, 0 failed.
- `npm run dev` — real window launched with title `J.A.R.V.I.S. - Foundation`.

## 8. Git status

- Commit `be8c3dd` — M4 checkpoint.
- Latest commit on `main` — M5 complete (source, tests, verification harness and documentation).
- `origin/main` still points to M3; no push has been performed.
- `.opencode/` remains untracked local tooling state and must not be committed.
- **Do not commit or push without explicit user approval.**

## 9. Exact next development task (Phase 2)

**Voice and PC control.** Scope from `TODO.md`:

- Speech-to-text with push-to-talk and configurable language.
- Text-to-speech with voice selection and interruptible playback.
- Wake-word architecture with explicit opt-in and visible indicator.
- Voice/text mode switching.
- Application launch/close with allowlist and permission prompts.
- Window management.
- File/folder search and open.
- Screenshot, clipboard read (permission-gated, indicator visible).
- Volume/display/network status and supported controls.
- Activity log entries for every privileged action.

Implementation guidance:
1. Add Windows system-control services and permission capabilities before exposing UI actions.
2. Use the existing permission/activity framework; every privileged action must be auditable.
3. Keep voice capture and screen capture explicitly opt-in with visible indicators.
4. Add provider-independent voice settings and a safe command allowlist.
5. Extend `verify:window` with non-destructive checks or a local stub; do not automate destructive PC actions.
6. Update all continuity docs after verification.

Out of scope for Phase 2: intelligence, automation engine, plugins and packaging.

## 10. Instructions for the next AI agent

1. Follow the takeover protocol in `AGENTS.md` exactly.
2. Verify the current implementation with typecheck, tests, build and `verify:window` before changing anything.
3. Read `ARCHITECTURE.md` sections 4–9 and the M5 source before designing Phase 2.
4. Reuse the existing permission, activity, settings and AI services; do not duplicate streaming or storage code.
5. Do not reintroduce Tauri/Rust or add native dependencies without approval.
6. Keep the reference image untouched and do not commit without approval.
