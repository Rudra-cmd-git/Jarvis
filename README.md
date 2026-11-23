# Project J.A.R.V.I.S.

A premium, functional Windows personal AI assistant: natural conversation, voice interaction, permission-gated PC control, automation, and developer/knowledge tooling.

## Current state

**Phase 1 complete (Milestone 5).** A real Electron desktop window launches with a secure shell, typed preload bridge, live system telemetry, SQLite persistence, typed settings, `safeStorage`-encrypted provider credentials, explicit permissions, an activity log, provider configuration, a real OpenAI-compatible AI adapter with SSE streaming, and a persistent streaming chat experience with Markdown rendering. Voice and PC control are intentionally not implemented yet.

## Run and verify

```
npm install
npm run dev              # launch the real desktop window
npm run typecheck        # strict TypeScript check
npm run test             # Vitest unit tests
npm run build            # main + preload + renderer production build
npm run probe:sqlite     # verify SQLite inside Electron
npm run verify:window    # verify renderer + bridge + IPC in a real window
```

See `PROJECT_STATUS.md` for the actual results of each command.

## Documentation (source of truth)

- `AGENTS.md` — rules and takeover protocol for every AI agent
- `ARCHITECTURE.md` — system design, interfaces, database, ADRs, risks
- `PROJECT_STATUS.md` — real progress and real test results
- `HANDOFF.md` — exact stage, blockers, and next task
- `TODO.md` — phased backlog with acceptance criteria

New AI models: follow the takeover protocol at the top of `AGENTS.md` before changing anything.

## Technology stack

Electron 45.4.1 + React 19.3.1 + TypeScript 5.9.3 + Vite 8.3.8, with SQLite (`node:sqlite`) behind `DatabaseService`, secrets encrypted with Electron `safeStorage`, and Vitest for unit tests. The preload is bundled into one CommonJS file for sandbox compatibility. Tauri was evaluated and rejected because this machine lacks a native linker; see `ARCHITECTURE.md`.

## Security note

No API keys are stored in this repository. Provider credentials are entered at runtime, encrypted locally with Electron `safeStorage`, and never returned to the renderer. Credential writes require the `credentials.manage` permission; outbound AI requests require `network.request` and are audited. Keys are loaded only in the main process at request time. PC control, screen capture, clipboard access, and consequential actions will also require explicit permission and will be logged.

## Reference asset

`Futuristic JARVIS Holographic Desktop Interface.png` is a user-provided design reference and is deliberately left untouched.
