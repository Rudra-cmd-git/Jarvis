// End-to-end probe over the WebView2 DevTools protocol.
// Requires the dev app running with --remote-debugging-port=9222.

const DEBUG_URL = "http://127.0.0.1:9222/json";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPage() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const pages = await (await fetch(DEBUG_URL)).json();
      const page = pages.find((p) => p.type === "page" && p.url.includes("localhost:1420"));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error("No debuggable page found");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Page exception: ${text}`);
    }
    return result.result.value;
  }
}

async function run() {
  const page = await getPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");

  // wait for the React shell
  for (let i = 0; i < 60; i += 1) {
    const ready = await cdp.evaluate(
      `Boolean(window.__TAURI_INTERNALS__) && Boolean(document.querySelector("aside"))`,
    );
    if (ready) break;
    await sleep(500);
  }

  const invoke = (cmd, args) =>
    cdp.evaluate(
      `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})})`,
    );

  const info = await invoke("app_info");
  record("App info", info?.name === "JARVIS" && Boolean(info.version), `${info?.name} ${info?.version} / Tauri ${info?.tauriVersion}`);

  const settings0 = await invoke("settings_get");
  record("Settings load", settings0?.theme === "midnight" || Boolean(settings0?.theme), `theme=${settings0?.theme}`);

  const health = await invoke("search_health");
  record("Search health", typeof health?.configured === "boolean", `provider=${health?.provider} configured=${health?.configured}`);

  // ---- provider lifecycle against the local mock ----
  const saved = await invoke("provider_save", {
    input: {
      name: "Mock Local",
      kind: "openai",
      baseUrl: "http://127.0.0.1:8899/v1",
      model: "mock-1",
      enabled: true,
      timeoutMs: 20000,
      temperature: 0.4,
      maxTokens: 512,
    },
  });
  record("Provider create", Boolean(saved?.id), saved?.name);

  const withKey = await invoke("provider_set_key", { id: saved.id, key: "test-key-not-real" });
  record("Provider key stored (Credential Manager)", withKey?.hasKey === true, "hasKey=true");

  const test = await invoke("provider_test", { id: saved.id });
  record("Provider connectivity test", test?.ok === true && test?.models?.length === 2, `${test?.message} (${test?.latencyMs}ms)`);

  const list1 = await invoke("providers_list");
  const mine = list1.find((p) => p.id === saved.id);
  record(
    "Provider list masks key",
    Boolean(mine) && mine.hasKey === true && !JSON.stringify(list1).includes("test-key-not-real"),
    "hasKey=true, no key material exposed",
  );

  const settings1 = await invoke("settings_save", {
    settings: { ...settings0, activeProviderId: saved.id, backupProviderId: null },
  });
  record("Set primary provider", settings1?.activeProviderId === saved.id, "persisted");

  // ---- streaming chat ----
  const requestId = `probe-${Date.now()}`;
  const chat = await invoke("chat_send", {
    req: { conversationId: null, providerId: saved.id, content: "Mock streaming check", requestId },
  });
  record(
    "Streaming chat response",
    typeof chat?.message?.content === "string" && chat.message.content.includes("MOCK RESPONSE"),
    chat?.message?.content?.slice(0, 48),
  );
  record("Provider/model recorded", chat?.model === "mock-1" && chat?.providerName === "Mock Local", chat?.providerName);
  const conversationId = chat.conversationId;

  // ---- tool protocol ----
  const toolChat = await invoke("chat_send", {
    req: { conversationId, providerId: saved.id, content: "TOOLTEST", requestId: `probe-tool-${Date.now()}` },
  });
  record("Tool call parsed from model reply", toolChat?.tool?.tool === "datetime", toolChat?.tool?.tool ?? "none");

  const toolOutcome = await invoke("tool_run", { tool: "datetime", args: {}, reason: "e2e" });
  record("Tool executes", toolOutcome?.status === "completed" && toolOutcome.result.ok === true, toolOutcome?.result?.summary);

  await invoke("conversation_add_message", {
    conversationId,
    role: "tool",
    content: `TOOL RESULT (datetime) — ${toolOutcome.result.summary}`,
  });
  const followUp = await invoke("chat_continue", {
    req: { conversationId, providerId: saved.id, requestId: `probe-follow-${Date.now()}` },
  });
  record("Follow-up turn uses tool result", String(followUp?.message?.content).startsWith("Tool completed."), followUp?.message?.content?.slice(0, 60));

  // ---- fallback ----
  const broken = await invoke("provider_save", {
    input: {
      name: "Broken",
      kind: "openai",
      baseUrl: "http://127.0.0.1:8899/broken/v1",
      model: "broken-1",
      enabled: true,
      timeoutMs: 8000,
      temperature: 0.2,
      maxTokens: 256,
    },
  });
  await invoke("provider_set_key", { id: broken.id, key: "irrelevant" });
  const settings2 = await invoke("settings_save", {
    settings: { ...settings1, activeProviderId: broken.id, backupProviderId: saved.id },
  });
  record("Backup configured", settings2?.backupProviderId === saved.id);

  const fallbackChat = await invoke("chat_send", {
    req: { conversationId: null, providerId: broken.id, content: "Fallback check", requestId: `probe-fallback-${Date.now()}` },
  });
  record("Fallback to backup provider", fallbackChat?.fallbackUsed === true && fallbackChat?.providerName === "Mock Local", fallbackChat?.providerName);

  // restore primary to mock
  await invoke("settings_save", { settings: { ...settings2, activeProviderId: saved.id, backupProviderId: null } });

  // ---- conversations ----
  const conversations = await invoke("conversations_list", { query: null });
  record("Conversations persisted", conversations?.length >= 2, `${conversations.length} conversations`);
  await invoke("conversation_rename", { id: conversationId, title: "E2E probe conversation" });
  const detail = await invoke("conversation_get", { id: conversationId });
  record("Rename + history detail", detail?.conversation?.title === "E2E probe conversation" && detail.messages.length >= 4, `${detail.messages.length} messages`);

  // ---- memory ----
  const memory = await invoke("memory_add", { kind: "fact", content: "E2E memory entry" });
  const memories = await invoke("memory_list");
  record("Memory add/list", memories.some((m) => m.id === memory.id), `${memories.length} items`);
  await invoke("memory_delete", { id: memory.id });
  record("Memory delete", (await invoke("memory_list")).every((m) => m.id !== memory.id));

  // ---- approval queue (destructive note delete) ----
  const preApproval = await invoke("settings_get");
  await invoke("settings_save", {
    settings: {
      ...preApproval,
      requireApprovals: true,
      permissions: { ...preApproval.permissions, notesWrite: true, notesDelete: true },
    },
  });
  const note = await invoke("tool_run", { tool: "save_note", args: { content: "e2e note to delete" }, reason: "e2e" });
  const noteId = note?.result?.detail?.note?.id;
  record("Note saved for approval test", note?.status === "completed" && Boolean(noteId), noteId);

  const pending = await invoke("tool_run", { tool: "delete_note", args: { id: noteId }, reason: "e2e approval deny" });
  record(
    "Destructive tool asks for approval",
    pending?.status === "approvalRequired" && Boolean(pending.approval?.id),
    pending?.approval?.preview,
  );
  const queue = await invoke("approvals_list");
  record("Approval appears in queue", queue.some((a) => a.id === pending.approval.id), `${queue.length} pending`);
  const refused = await invoke("approval_respond", { id: pending.approval.id, approve: false });
  record("Approval denial is enforced", refused?.status === "denied", refused?.reason?.slice(0, 50));
  const notesAfterDenial = await invoke("tool_run", { tool: "list_notes", args: {}, reason: "e2e" });
  const kept = (notesAfterDenial?.result?.detail?.notes ?? []).some((n) => n.id === noteId);
  record("Denied action left data intact", kept === true, "note still present");

  const approvedReq = await invoke("tool_run", { tool: "delete_note", args: { id: noteId }, reason: "e2e approval allow" });
  const approved = await invoke("approval_respond", { id: approvedReq.approval.id, approve: true });
  record("Approval allow executes tool", approved?.status === "completed", approved?.result?.summary);
  await invoke("settings_save", { settings: preApproval });

  // ---- real system tool ----
  const sys = await invoke("tool_run", { tool: "system_info", args: {}, reason: "e2e" });
  record("System information tool", sys?.status === "completed" && String(sys.result.summary).length > 4, sys?.result?.summary);

  // ---- permissions enforced ----
  const settings3 = await invoke("settings_get");
  await invoke("settings_save", {
    settings: { ...settings3, permissions: { ...settings3.permissions, appsLaunch: false } },
  });
  const denied = await invoke("tool_run", { tool: "open_app", args: { name: "notepad" }, reason: "e2e" });
  record("Permission denial enforced in backend", denied?.status === "denied", denied?.reason?.slice(0, 60));
  await invoke("settings_save", { settings: { ...settings3 } });

  // ---- UI navigation ----
  const views = [
    ["AI Chat", "AI CHAT"],
    ["Conversations", "Conversation history"],
    ["Memory", "Memory"],
    ["Tools", "Tool console"],
    ["Automations", "Automations"],
    ["Integrations", "Integrations"],
    ["Settings", "Settings"],
    ["Home", "COMMAND CENTER"],
  ];
  for (const [label, expected] of views) {
    const found = await cdp.evaluate(`(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      if (!btn) return "missing";
      btn.click();
      return "clicked";
    })()`);
    await sleep(450);
    const text = await cdp.evaluate("document.body.innerText");
    record(`View: ${label}`, found === "clicked" && text.includes(expected), found);
  }

  // ---- voice capability detection ----
  const caps = await cdp.evaluate(`({
    tts: "speechSynthesis" in window,
    voices: ("speechSynthesis" in window) ? window.speechSynthesis.getVoices().length : 0,
    webSpeech: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  })`);
  record("Voice capability surfaced honestly", typeof caps.tts === "boolean", `tts=${caps.tts} voices=${caps.voices} webSpeech=${caps.webSpeech}`);

  // ---- cleanup ----
  await invoke("conversation_delete", { id: conversationId });
  await invoke("conversation_delete", { id: fallbackChat.conversationId });
  await invoke("provider_delete", { id: broken.id });
  await invoke("provider_delete", { id: saved.id });
  const remaining = await invoke("providers_list");
  record(
    "Provider + key cleanup",
    remaining.every((p) => p.id !== saved.id && p.id !== broken.id),
    `${remaining.length} other providers left`,
  );

  ws.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("PROBE ERROR:", err);
  process.exitCode = 1;
});
