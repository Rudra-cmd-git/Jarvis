# JARVIS — Handoff

## 1. Exact development stage

**Phase 1 — Functional Desktop Foundation, Milestone 4: COMPLETE.**
Phase 0 and M1–M3 are preserved. M4 adds a real AI provider layer: normalized contracts, an OpenAI-compatible SSE adapter, registry/router, permission-gated streaming IPC, retry/cancellation and a minimal Settings diagnostic.

## 2. Last completed task

Implemented M4:

- `src/shared/ai.ts` with `AiProvider`, `AiChatRequest`, `AiProviderChunk`, `AiStreamEvent`, `AiError`, `AiStatus`, limits and request-ID pattern.
- `ai-errors.ts` (redacted normalized errors), `sse.ts` (incremental SSE parser), `openai-compatible.provider.ts` (`fetch` + SSE + cancellation + model listing), `provider-registry.ts`, `model-router.ts`, `retry.ts`, `ai.service.ts`.
- `network.request` enabled and enforced; provider keys read only in the main process at request time.
- IPC channels `ai:get-status`, `ai:list-models`, `ai:stream-start`, `ai:stream-cancel`, `ai:stream-event`; validated in `ai.ipc.ts` and exposed by the preload with subscribe/unsubscribe.
- `AiPanel` in Settings with real status, permission grant, model selector, connection test and stream/cancel diagnostic.
- 31 new unit tests and 20 new window-verification checks using a local HTTP stub.

## 3. Current unfinished task

None inside M4. The next task is Phase 1 Milestone 5, defined in section 9.

## 4. Files created / modified

Created (M4):
- `src/shared/ai.ts`
- `src/main/services/ai/ai-errors.ts`
- `src/main/services/ai/sse.ts`
- `src/main/services/ai/openai-compatible.provider.ts`
- `src/main/services/ai/provider-registry.ts`
- `src/main/services/ai/model-router.ts`
- `src/main/services/ai/retry.ts`
- `src/main/services/ai/ai.service.ts`
- `src/main/ipc/ai.ipc.ts`
- `src/renderer/components/settings/AiPanel.tsx`
- `tests/unit/ai-sse.test.ts`
- `tests/unit/ai-errors.test.ts`
- `tests/unit/ai-retry.test.ts`
- `tests/unit/ai-openai-provider.test.ts`
- `tests/unit/ai-router.test.ts`
- `tests/unit/ai-service.test.ts`

Modified (M4):
- `src/shared/types.ts`, `src/shared/ipc-channels.ts`, `src/shared/permissions.ts`
- `src/main/services/providers.service.ts` (added `get(id)`)
- `src/main/services/core-services.ts` (AI composition + shutdown abort)
- `src/main/index.ts`, `src/preload/index.ts`
- `src/renderer/views/Settings.tsx`, `src/renderer/styles/global.css`
- `src/main/utils/validation.ts` (added `asNumber`)
- `src/main/services/ai/sse.ts` (empty-event fix)
- `tests/unit/permissions.test.ts` (network permission expectation)
- `scripts/verify-window.cjs` (AI IPC surface, local stub server, M4 API/UI checks, diagnostic logging)
- `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `TODO.md`, `README.md`

Preserved untouched: `Futuristic JARVIS Holographic Desktop Interface.png`.

## 5. Important implementation details

### Contracts and adapter
- `AiProvider` lives in `src/shared/ai.ts` but must only be used at runtime in the main process.
- `OpenAiCompatibleProvider` appends `/chat/completions` and `/models` to the stored base URL. It sends `stream: true`, optional `temperature`/`max_tokens`, and `stream_options: { include_usage: true }` for `openai-compatible` (not Ollama).
- Both streaming `delta.content` and non-streaming `message.content` are handled; usage may arrive in a final chunk with no choices.
- SSE is parsed incrementally; blank/keep-alive `data:` events are ignored. Named events, CRLF, comments and multi-line data are supported.
- Errors are normalized: `permission_denied`, `provider_missing`, `provider_disabled`, `model_missing`, `credential_unavailable`, `network_error`, `timeout`, `http_error`, `rate_limited`, `invalid_response`, `aborted`, `busy`, `invalid_request`, `unsupported_protocol`, `unknown`.
- 401/403, 404, 400-class errors are not retryable; 408, 429 and 5xx are retryable.

### Service lifecycle
- `AiService.startStream(senderId, requestId, request, emit)` returns `{ accepted, requestId, error? }` immediately and runs the stream asynchronously.
- Only one stream per request ID; at most 4 concurrent streams per renderer. Request IDs match `^[A-Za-z0-9_-]{8,80}$`.
- `network.request` is checked before provider resolution and again for model listing. Denials are audited.
- Retries happen only while `emittedContent === false`. Default policy: 3 attempts, 300 ms base delay, 2 s cap. Tests inject a 1 ms policy.
- Per-attempt timeout is 120 s; model-list timeout is 15 s. `createTimeoutSignal` links user cancellation and timeout while distinguishing them.
- Every stream has exactly one terminal event: `done`, `error` or `cancelled`. Terminal activity entries use `ai.request.completed`, `ai.request.failed` or `ai.request.cancelled`.
- `cancelStream` verifies the sender ID; `cancelAll` is called from the IPC handler when a `WebContents` is destroyed and from `shutdownCoreServices`.

### IPC and security
- `ai:stream-event` is main→renderer only; it is not a `handle` channel. Events are sent to `event.sender` exclusively.
- Every AI handler calls `assertTrustedRenderer` and validates argument count, record shape, allowed keys and value types. A new `asNumber` validator covers temperature.
- No secret reading API was added. `getAiStatus()` reports only provider/model/protocol/credential-state/permission/detail.
- The renderer never performs network requests directly; CSP `connect-src` remains unchanged.

### Renderer
- `AiPanel` is rendered in Settings after the provider panel. It fetches status on mount and when settings/permissions change.
- “Test connection” calls `listAiModels()`; the stream diagnostic calls `startChatStream`/`cancelChatStream` and renders deltas. This is a diagnostic, not the M5 chat UI.
- The default-model selector writes `ai.defaultModel` through the existing settings API.

### Verification
- `scripts/verify-window.cjs` starts a local `http` stub on an ephemeral 127.0.0.1 port. It serves `/v1/models`, streams normal SSE, returns 503 once for `retry-model`, 401 for `denied-model`, and a slow ticking stream for `slow-model`.
- The harness asserts the dummy API key appears as `Authorization: Bearer …` in the stub request but never in events, status or activity.
- It also asserts permission denial, model/provider switching, retry, normalized errors, cancellation, terminal audit, and real UI interactions.
- `lastScript` diagnostic logging was added to the harness to identify failing renderer expressions; safe to keep or remove.

## 6. Errors and blockers encountered

| Error / blocker | Resolution |
| --- | --- |
| `ai-errors.ts` imported `../../shared/ai` from `services/ai` | Corrected to `../../../shared/ai` |
| Preload lacked the five new `JarvisApi` members | Implemented invoke methods and event subscription/unsubscribe |
| Existing permission test expected only one enforced capability | Updated to include `network.request` |
| SSE decoder did not reset `dataLines` for empty events | Reset before dispatch; prevents data bleed into later events |
| Stream test fake resolved on abort instead of throwing | Fake now rejects with `AbortError`, matching the real adapter |
| Verification subscription expression used semicolons inside parentheses | Wrapped in an explicit arrow IIFE |
| `EXPECTED_API` still had 17 methods | Updated to 22; verification now passes |

No unresolved source-code errors are known.

## 7. Last successful verification

Executed on 2026-11-23:

- `npm run typecheck` — pass, zero errors.
- `npm run test` — 17 files, 95 tests, 0 failed.
- `npm run build` — pass; main, bundled preload, renderer.
- `npm run verify:window` — 78 checks, 0 failed.
- `npm run dev` — real window launched with title `J.A.R.V.I.S. - Foundation`.

## 8. Git status

- Commit `48ff77e` — M3 checkpoint.
- Latest commit on `main` — M4 complete (source, tests, verification harness and documentation).
- `origin/main` still points to M3; no push has been performed.
- `.opencode/` remains untracked local tooling state and must not be committed.
- **Do not commit or push without explicit user approval.**

## 9. Exact next development task (Phase 1 Milestone 5)

**Chat experience.** Scope from `TODO.md`:

Acceptance criteria: send a message, see a streamed response, stop generation, create/rename/delete conversations, switch model mid-session, and have conversation history survive restart.

1. Replace the M4 Settings stream diagnostic with a full Chat view experience while keeping the M4 API intact.
2. Use schema-v1 `conversations` and `messages` tables through a new `ConversationService` with typed CRUD and transactional writes.
3. Persist all messages (user and assistant) after a stream completes or is cancelled; never persist credentials or raw provider payloads.
4. Add IPC channels and preload methods for conversation list/create/rename/delete/message list.
5. Wire `AiService.startChatStream` into the Chat view and render `delta` events into the assistant message; `cancelled` must update the message state without orphaned audit entries.
6. Add stop-generation control, conversation switching, model selection mid-session and truthful loading/error/empty states.
7. Keep the cinematic glass/cyan design and the 960×640 layout.
8. Add unit tests for conversation persistence and extend `verify:window` with real UI chat/conversation checks using the local stub server.
9. Update all continuity docs after verification.

Out of scope for M5: voice, PC control, automation, plugin system.

## 10. Instructions for the next AI agent

1. Follow the takeover protocol in `AGENTS.md` exactly.
2. Verify the current implementation with typecheck, tests, build and `verify:window` before changing anything.
3. Read `ARCHITECTURE.md` sections 4–9 and the M4 source before designing M5.
4. Keep keys in the main process; never add a renderer getter or log request bodies.
5. Reuse `AiService` instead of writing a second streaming implementation.
6. Do not reintroduce Tauri/Rust or add native dependencies.
7. Keep the reference image untouched and do not commit without approval.
