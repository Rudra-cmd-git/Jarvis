# JARVIS — Windows AI Command Center

A native Windows desktop assistant built with **Tauri 2 (Rust) + React 19 + TypeScript + Tailwind CSS 4**.
It combines a cinematic command-center interface with real, backend-enforced functionality: interchangeable AI
providers, streaming chat, allowlisted computer tools, human approval for risky actions, persistent local memory and
voice input/output.

> **Honest scope:** JARVIS does not include a free AI subscription. You connect providers you already have access to
> (including free tiers such as OpenRouter's free models, Groq, or a local OpenAI-compatible server). Nothing is
> simulated: if a provider, microphone or search service is unavailable, the interface says so.

---

## 1. Features

### AI providers (bring your own key)
- Presets for **OpenRouter, Groq, Google Gemini, OpenAI** and any **OpenAI-compatible custom endpoint**.
- Per-provider: name, type, base URL, model ID, timeout, temperature, max output tokens, enabled state.
- **Streaming** responses over SSE, request cancellation, timeouts, and **primary → backup fallback**.
- Connectivity test with real latency and model count, provider-specific error messages (401/402/429/5xx).
- Keys stored in **Windows Credential Manager** via the Rust backend (`keyring`). Keys are never returned to the UI,
  never placed in React state after saving, never written to SQLite and never logged.

### Computer tools (allowlisted, permission-gated)
| Tool | Description | Approval |
| --- | --- | --- |
| `open_app` | Launch Notepad, Calculator, Explorer, Paint, Edge, Chrome, Firefox, VS Code, Spotify | no |
| `open_url` | Open a validated http(s) URL | no |
| `open_folder` | Open Desktop / Documents / Downloads / Pictures / Music / Videos | no |
| `search_files` | Filename search in approved folders | no |
| `read_text_file` | Read supported text files inside approved folders (≤ 256 KB) | no |
| `save_note` / `list_notes` | Persistent local notes | no |
| `delete_note` | Delete a saved note | **yes** |
| `web_search` | Query the configured search provider, return sources | **yes** |
| `system_info` | CPU / memory / OS snapshot | no |
| `datetime` | Local date and time | no |

No arbitrary shell execution, no software installation, no system-setting changes, no file deletion outside notes.
Every permission is enforced in Rust — the toggles are not cosmetic. The model can request tools through a documented
marker protocol; results are fed back to the model, which must not claim success without one.

### Voice
- **Push-to-talk** dictation with live transcript preview, cancel, and explicit microphone errors.
- Two real adapters: **Web Speech** (runtime availability detected) and **Whisper-compatible HTTP endpoint**
  (OpenAI `/v1/audio/transcriptions` style, local faster-whisper/whisper.cpp supported, optional bearer key).
- **Text-to-speech** through Windows speech voices exposed by WebView2, with voice selection, rate, pitch,
  auto-speak and per-message playback controls. Hidden when unsupported.
- Wake-word is intentionally not implemented.

### Memory & history
- SQLite conversation history with titles, full-text search, rename and delete.
- User-approved memories (preference / fact / note) with pinning and removal, plus a global memory-off switch.
- Activity audit log for chat requests, tools, approvals and failures.
- Saved quick instructions ("automations") you launch explicitly — no hidden background schedulers.

### Web search
- Brave Search API, Tavily or self-hosted SearXNG (JSON output).
- Real requests only; results are returned with titles, URLs and snippets and passed to the model as cited sources.

### Interface
- Iron-Man-inspired holographic command center: animated reactor core with idle / listening / processing /
  speaking / error / offline states driven by real app state.
- Screens: Dashboard, AI Chat, Conversations, Memory, Tools, Automations, Integrations, Settings.
- Right-hand telemetry panel: provider/model, connection, current task, voice state, integrations, CPU/memory.
- Glass panels, thin technical borders, restrained accents, reduced-motion support and accessible controls.
- Fully keyboard-usable; Enter sends, Shift+Enter adds a line, Esc closes dialogs.

---

## 2. Requirements

- Windows 10/11 with **WebView2 Runtime** (preinstalled on current Windows).
- **Node.js ≥ 22.12** and npm.
- **Rust stable (MSVC)** + **Visual Studio Build Tools** with the C++ workload and a Windows SDK.
- Optionally: a Whisper-compatible local server for offline dictation; a SearXNG instance for keyless search.

Install the Rust toolchain and Build Tools once:

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

The MSVC environment must be available to the shell that runs Tauri:

```powershell
cmd /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" && npm run app:dev'
```

---

## 3. Run and build

```powershell
npm install
npm run app:dev      # desktop app with hot reload
npm run app:build    # Windows NSIS installer in src-tauri/target/release/bundle/nsis
npm run typecheck    # TypeScript
npx vite build       # frontend production build
scripts\env-run.bat cargo test --manifest-path src-tauri\Cargo.toml
```

On this machine the MSVC linker is installed but not on the normal PowerShell `PATH`, so `scripts\env-run.bat`
loads `vcvars64.bat` and then runs whatever command you pass it:

```powershell
scripts\env-run.bat npm run app:dev
scripts\env-run.bat npm run app:build
```

If Tauri cannot reach GitHub to download NSIS, set a mirror for that one command (or pre-seed
`%LOCALAPPDATA%\tauri\NSIS`):

```powershell
$env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = "https://ghproxy.net/"
scripts\env-run.bat npx tauri bundle --bundles nsis
```

### End-to-end verification harness

`scripts/` contains the checks used to validate this build. They drive the real webview over the DevTools protocol
and a local OpenAI-compatible mock, so no paid API key is needed:

```powershell
node scripts\mock-openai.mjs                    # local streaming provider on :8899
# start the dev app once with additionalBrowserArgs "--remote-debugging-port=9222"
node scripts\e2e-probe.mjs                      # backend: providers, keys, streaming, tools, fallback, approvals, persistence
node scripts\ui-probe.mjs                       # UI: chat streaming, tool cards, approval dialog
```

---

## 4. First-run checklist

1. **Integrations → AI Providers**: pick a preset (e.g. OpenRouter), keep or edit the model ID, save.
2. Paste your API key in the key dialog → **Store key** (Windows Credential Manager).
3. Press **Test** to verify connectivity and latency; choose **Set primary**.
4. Optionally add a second provider and select it as **Backup**.
5. **Integrations → Web Search**: choose Brave/Tavily (key required) or SearXNG URL, enable search.
6. **Settings → Permissions**: enable only the capabilities you want JARVIS to have.
7. Talk to JARVIS in **AI Chat**; risky actions open an approval dialog with exact arguments.

Nothing is preconfigured with a fake key or a fake provider. Without a configured provider the core shows **OFFLINE**
and chat explains what to configure.

---

## 5. Architecture

```
React (sandboxed WebView2)
  views / components / contexts / voice adapters
        │  typed invoke() + event streams
        ▼
Rust backend (src-tauri/src)
  commands.rs   Tauri command surface (validation boundary)
  ai.rs         provider streaming, cancellation, fallback, tool protocol
  providers.rs  provider CRUD + connectivity tests
  secrets.rs    Windows Credential Manager
  settings.rs   typed settings, sanitization, permission checks
  tools.rs      tool registry, approvals, filesystem/OS actions
  search.rs     Brave / Tavily / SearXNG
  voice.rs      Whisper-compatible transcription
  conversations.rs / memory.rs / activity.rs / db.rs
        │
        ├── SQLite (%APPDATA%/com.jarvis.command/jarvis.db)
        └── Windows Credential Manager (API keys)
```

### Tool protocol
The system prompt teaches the model one fenced format:

```tool
{"tool":"open_app","args":{"name":"notepad"},"reason":"user asked"}
```

Rust extracts and validates it, runs it through permissions/approvals, then the UI appends a `TOOL RESULT` message and
requests a follow-up turn (max two tool rounds per request). Unknown tools are ignored.

### Security boundaries
- All arguments validated in Rust; URLs restricted to http(s); paths canonicalized and restricted to Desktop,
  Documents and Downloads; extensions limited to text formats.
- Risky tools create a persisted approval record; denial is surfaced to the model so it cannot claim success.
- CSP restricts the webview; no remote content is loaded.
- Backend never logs message contents at secret level; transcript text is not written to the activity log.

---

## 6. Verification

Verified on this machine against the actual running build (not mocks of the UI):

- `cargo test`: 4 Rust unit tests (tool-block parsing, URL validation, settings sanitization) pass.
- `node scripts/e2e-probe.mjs`: **37/37** checks pass — provider CRUD + connectivity test against a local OpenAI-compatible
  server, key stored in Credential Manager and never returned to the frontend, primary/backup failover, SSE streaming,
  tool-call parsing, tool follow-up turn, memory and conversation persistence, system-info tool, permission denial,
  approval request/deny/approve, all 8 views rendering, and cleanup.
- `node scripts/ui-probe.mjs`: **8/8** checks pass — typing in the real composer, streamed assistant bubble, approval
  dialog rendered and denied, no horizontal overflow, conversation persisted.
- `npx tsc --noEmit` and `npx vite build` pass.
- Release build and NSIS installer produced; installer was installed silently, the installed app launched, and it was
  uninstalled again. Installer: `src-tauri/target/release/bundle/nsis/JARVIS_0.1.0_x64-setup.exe` (2.5 MB).

Not verified here because it needs hardware or third-party accounts: a real microphone STT round-trip, a real
Brave/Tavily key, and a paid provider key. Those paths fail with explicit errors instead of pretending to work.

---

## 7. Known limitations

- Web Speech availability depends on the WebView2 runtime; when unavailable, configure a Whisper endpoint. The UI
  reports the failure rather than pretending to listen.
- TTS depends on installed Windows voices; the quality is whatever Windows provides.
- Tool calling is prompt-protocol based, not provider-native function calling; a model may choose not to call a tool.
  The tool console always works independently.
- No arbitrary shell, no OS setting mutation, no software installation by design.
- Automations are manual shortcuts, not a background scheduler.

---

## 8. Data & privacy

All configuration, conversations, memories, approvals and activity live in a local SQLite database. The only network
traffic is to the AI/search endpoints you configure. API keys live in Windows Credential Manager under the service
`jarvis.desktop`. Deleting a provider removes its key immediately.
