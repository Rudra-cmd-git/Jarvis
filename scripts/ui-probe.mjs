// Drives the real chat UI through WebView2 DevTools, verifying streaming, tool cards
// and the approval dialog. Requires the dev app and the mock provider on :8899.
import fs from "node:fs";
import path from "node:path";

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = pages.find((p) => p.type === "page" && p.url.includes("localhost:1420"));
if (!page) throw new Error("No debug page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((resolve) => pending.set(n, resolve));
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const invoke = (cmd, args) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})})`);
const text = () => evaluate("document.body.innerText");
const shot = async (name) => {
  await send("Page.enable");
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = path.resolve("screenshots", name);
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  return file;
};
const waitForText = async (needle, timeout = 25000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await text()).includes(needle)) return true;
    await sleep(400);
  }
  return false;
};
async function typeAndSend(message) {
  await evaluate(`(() => {
    const ta = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, ${JSON.stringify(message)});
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
    return ta.value;
  })()`);
  await sleep(150);
  await evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
}

// setup provider
const current = await invoke("settings_get");
const provider = await invoke("provider_save", {
  input: {
    name: "UI Mock",
    kind: "openai",
    baseUrl: "http://127.0.0.1:8899/v1",
    model: "mock-1",
    enabled: true,
    timeoutMs: 20000,
    temperature: 0.4,
    maxTokens: 512,
  },
});
await invoke("provider_set_key", { id: provider.id, key: "ui-test-key" });
await invoke("settings_save", {
  settings: {
    ...current,
    activeProviderId: provider.id,
    backupProviderId: null,
    requireApprovals: true,
    permissions: { ...current.permissions, webOpen: true },
  },
});

await evaluate(`[...document.querySelectorAll("aside button")].find(b => b.textContent.trim() === "AI Chat").click()`);
await sleep(700);

const before = await invoke("conversations_list", { query: null });
await typeAndSend("Hello from the UI probe");
const streamed = await waitForText("MOCK RESPONSE");
record("UI streams assistant reply", streamed, "MOCK RESPONSE visible");
await sleep(600);
await shot("ui-chat.png");

const metrics = await evaluate(`({
  overflowX: document.documentElement.scrollWidth - window.innerWidth,
  composerVisible: (() => { const ta = document.querySelector("textarea"); if (!ta) return false; const r = ta.getBoundingClientRect(); return r.top > 0 && r.bottom <= window.innerHeight + 1; })(),
  bubbles: document.querySelectorAll("[data-message]").length
})`);
record("Composer inside viewport", metrics.composerVisible === true);
record("No horizontal overflow", metrics.overflowX <= 0, `${metrics.overflowX}px`);

await typeAndSend("APPROVALTEST");
const dialog = await waitForText("Action requires your approval");
record("Approval dialog appears in UI", dialog, "dialog copy present");
if (dialog) {
  await shot("ui-approval.png");
  const denied = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find(b => /^deny/i.test(b.textContent.trim()));
    if (!btn) return "missing";
    btn.click();
    return "clicked";
  })()`);
  record("Deny button in approval dialog", denied === "clicked", denied);
  await sleep(2500);
  await shot("ui-denied.png");
  record("Denied tool reported back in chat", (await text()).includes("denied") || (await text()).includes("Denied"), "chat shows denial");
}

const conversations = await invoke("conversations_list", { query: null });
const created = conversations.filter((c) => !before.some((b) => b.id === c.id));
record("UI conversation persisted", created.length >= 1, `${created.length} new conversation(s)`);

// cleanup
for (const c of created) await invoke("conversation_delete", { id: c.id });
await invoke("provider_delete", { id: provider.id });
await invoke("settings_save", { settings: { ...current, activeProviderId: null, backupProviderId: null } });
record("Probe cleanup", true);

await send("Page.captureScreenshot", { format: "png" }).catch(() => null);
ws.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exitCode = 1;
}
