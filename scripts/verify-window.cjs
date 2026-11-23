const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { registerAiIpc } = require('../dist-main/main/ipc/ai.ipc.js');
const { registerActivityIpc } = require('../dist-main/main/ipc/activity.ipc.js');
const { registerConversationsIpc } = require('../dist-main/main/ipc/conversations.ipc.js');
const { registerAppIpc } = require('../dist-main/main/ipc/app.ipc.js');
const { registerDatabaseIpc } = require('../dist-main/main/ipc/database.ipc.js');
const { registerPermissionsIpc } = require('../dist-main/main/ipc/permissions.ipc.js');
const { registerProvidersIpc } = require('../dist-main/main/ipc/providers.ipc.js');
const { registerSecretsIpc } = require('../dist-main/main/ipc/secrets.ipc.js');
const { registerSettingsIpc } = require('../dist-main/main/ipc/settings.ipc.js');
const { registerSystemIpc } = require('../dist-main/main/ipc/system.ipc.js');
const {
  getCoreServices,
  initializeCoreServices,
  shutdownCoreServices,
} = require('../dist-main/main/services/core-services.js');
const { SafeStorageCipher } = require('../dist-main/main/services/safe-storage-cipher.js');
const { IPC_CHANNELS } = require('../dist-main/shared/ipc-channels.js');

const PRELOAD = path.join(__dirname, '../dist-main/preload/index.js');
const PAGE = path.join(__dirname, '../dist-renderer/index.html');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-verify-'));
const PLAINTEXT_KEY = 'sk-verify-dummy-1234567890';

// Keep verification isolated from a real user profile before Electron resolves
// any userData path.
app.setPath('userData', USER_DATA);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}

let lastScript = '';

async function runJavaScript(window, expression) {
  lastScript = expression;
  return window.webContents.executeJavaScript(`(() => (${expression}))()`);
}

async function waitFor(window, expression, timeoutMs = 8000, label = expression) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await runJavaScript(window, expression)) {
        return true;
      }
    } catch (error) {
      // The renderer may still be mounting; retry until the timeout.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function tryApi(window, expression) {
  try {
    return { ok: true, value: await runJavaScript(window, expression) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function cleanupUserData() {
  try {
    shutdownCoreServices();
  } catch {
    // Shutdown is best effort during verification cleanup.
  }
  try {
    fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // Windows may briefly retain handles; the temp directory is disposable.
  }
}

function containsPlaintext(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return fs.readFileSync(filePath).toString('latin1').includes(PLAINTEXT_KEY);
}

// ---------- Milestone 4: local provider stub (no external network) ----------

const STUB_MODELS = [
  'stub-model-a',
  'stub-model-b',
  'retry-model',
  'denied-model',
  'slow-model',
];
const stubRequests = [];
const stubState = { retryCount: 0 };
let stubServer = null;

function sseFrame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function writeStream(res, texts, finishReason = 'stop') {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const text of texts) {
    res.write(sseFrame({ choices: [{ delta: { content: text }, finish_reason: null }] }));
  }
  res.write(
    sseFrame({
      choices: [{ finish_reason: finishReason }],
      usage: {
        prompt_tokens: 2,
        completion_tokens: texts.length,
        total_tokens: 2 + texts.length,
      },
    }),
  );
  res.end('data: [DONE]\n\n');
}

function handleChat(req, res, body) {
  if (body.model === 'denied-model') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'invalid key' } }));
    return;
  }
  if (body.model === 'retry-model') {
    stubState.retryCount += 1;
    if (stubState.retryCount === 1) {
      res.writeHead(503);
      res.end('temporarily unavailable');
      return;
    }
    writeStream(res, ['recovered']);
    return;
  }
  if (body.model === 'slow-model') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(sseFrame({ choices: [{ delta: { content: 'slow-' }, finish_reason: null }] }));
    const interval = setInterval(() => {
      if (!res.destroyed) {
        res.write(sseFrame({ choices: [{ delta: { content: 'tick' }, finish_reason: null }] }));
      }
    }, 40);
    const safety = setTimeout(() => {
      clearInterval(interval);
      if (!res.destroyed) res.end('data: [DONE]\n\n');
    }, 10_000);
    const stop = () => {
      clearInterval(interval);
      clearTimeout(safety);
    };
    req.on('close', stop);
    res.on('close', stop);
    return;
  }
  writeStream(res, ['Hello', ' from', ' stub']);
}

function startStubServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        let body = {};
        if (chunks.length > 0) {
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            body = {};
          }
        }
        stubRequests.push({
          method: req.method,
          url: req.url,
          model: body.model ?? null,
          authorization: req.headers.authorization ?? null,
        });

        if (req.method === 'GET' && req.url === '/v1/models') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ object: 'list', data: STUB_MODELS.map((id) => ({ id })) }));
          return;
        }
        if (req.method === 'POST' && req.url === '/v1/chat/completions') {
          handleChat(req, res, body);
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      stubServer = server;
      resolve();
    });
  });
}

async function stopStubServer() {
  if (!stubServer) {
    return;
  }
  await new Promise((resolve) => stubServer.close(resolve));
  stubServer = null;
}

const EXPECTED_API = [
  'appendConversationMessage',
  'cancelChatStream',
  'createConversation',
  'deleteConversation',
  'deleteSecret',
  'getAiStatus',
  'getAppInfo',
  'getConversation',
  'getDatabaseStatus',
  'getSecretStatus',
  'getSettings',
  'getSystemMetrics',
  'listActivity',
  'listAiModels',
  'listConversationMessages',
  'listConversations',
  'listPermissions',
  'listProviders',
  'onChatStreamEvent',
  'quitApp',
  'removeProvider',
  'renameConversation',
  'resetSetting',
  'saveProvider',
  'setActiveProvider',
  'setConversationModel',
  'setPermission',
  'setSecret',
  'setSetting',
  'startChatStream',
].sort();

app.whenReady().then(async () => {
  const errors = [];
  await startStubServer();
  const coreStatus = initializeCoreServices({
    userDataPath: USER_DATA,
    cipher: new SafeStorageCipher(),
  });

  registerAppIpc();
  registerSystemIpc();
  registerDatabaseIpc();
  registerSettingsIpc();
  registerSecretsIpc();
  registerProvidersIpc();
  registerPermissionsIpc();
  registerActivityIpc();
  registerAiIpc();
  registerConversationsIpc();

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.on('console-message', (event) => {
    if (event.level === 3) {
      errors.push(event.message);
    }
  });

  try {
    check(
      'core services initialize before the window opens',
      coreStatus.database.initialized && coreStatus.database.schemaVersion === 2,
      coreStatus,
    );

    await window.loadFile(PAGE);
    await waitFor(window, "document.getElementById('root')?.innerHTML.length > 0", 10000, 'renderer mount');

    const api = await runJavaScript(window, 'Object.keys(window.jarvis).sort()');
    check(
      'preload exposes the typed API',
      JSON.stringify(api) === JSON.stringify(EXPECTED_API),
      api,
    );

    const appInfo = await runJavaScript(window, 'window.jarvis.getAppInfo()');
    check('app info has runtime versions', Boolean(appInfo?.electronVersion && appInfo.nodeVersion && appInfo.chromeVersion), appInfo);

    const metrics = await runJavaScript(window, 'window.jarvis.getSystemMetrics()');
    check('CPU metric is in range', typeof metrics?.cpu?.usagePercent === 'number' && metrics.cpu.usagePercent >= 0 && metrics.cpu.usagePercent <= 100, metrics?.cpu);
    check('memory totals are positive', metrics?.memory?.totalBytes > 0 && metrics.memory.freeBytes >= 0, metrics?.memory);
    check('storage reports a real capacity or a real error', metrics?.storage?.available ? metrics.storage.totalBytes > 0 : typeof metrics?.storage?.detail === 'string', metrics?.storage);
    check('process metrics are present', metrics?.process?.pid > 0 && metrics.process.rssBytes > 0, metrics?.process);

    check('context isolation hides Node globals', await runJavaScript(window, "typeof window.require === 'undefined' && typeof window.process === 'undefined'"), 'window.require/process');
    check('sandboxed preload has no Node require', await runJavaScript(window, "typeof require === 'undefined'"), 'require');

    check('dashboard empty states are truthful', await runJavaScript(window, "document.body.textContent.includes('No conversations yet') && document.body.textContent.includes('No automations yet') && document.body.textContent.includes('No tasks yet')"), 'empty states');

    const views = ['dashboard', 'chat', 'pc-control', 'automation', 'developer-hub', 'knowledge', 'productivity', 'settings'];
    for (const viewId of views) {
      await runJavaScript(window, `document.querySelector('[data-view=\"${viewId}\"]')?.click()`);
      await waitFor(window, `document.querySelector('[data-view-heading=\"${viewId}\"]') !== null`, 5000, `${viewId} view`);
      const activeCount = await runJavaScript(window, "document.querySelectorAll('.nav-item[aria-current=\"page\"]').length");
      const activeView = await runJavaScript(window, "document.querySelector('.nav-item[aria-current=\"page\"]')?.getAttribute('data-view')");
      check(`navigation opens ${viewId}`, activeCount === 1 && activeView === viewId, { activeCount, activeView });
    }

    await runJavaScript(window, "document.querySelector('[data-view=\"dashboard\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"dashboard\"]') !== null", 5000, 'dashboard return');

    await runJavaScript(window, "document.querySelector('[data-quick-action=\"chat\"]')?.click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"chat\"]') !== null", 5000, 'quick action chat');
    await runJavaScript(window, "document.querySelector('[data-view=\"dashboard\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"dashboard\"]') !== null", 5000, 'dashboard return for quick settings');
    await runJavaScript(window, "document.querySelector('[data-quick-action=\"settings\"]')?.click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"settings\"]') !== null", 5000, 'quick action settings');

    await runJavaScript(window, "document.querySelector('[data-view=\"dashboard\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"dashboard\"]') !== null", 5000, 'dashboard return before telemetry refresh');
    const beforeSample = await runJavaScript(window, "document.querySelector('[data-sampled-at]')?.getAttribute('data-sampled-at')");
    await runJavaScript(window, "document.querySelector('[data-action=\"refresh-metrics\"]')?.click()");
    await waitFor(window, `document.querySelector('[data-sampled-at]')?.getAttribute('data-sampled-at') !== ${JSON.stringify(beforeSample)}`, 4000, 'metric refresh');
    check('metric refresh changes the sample timestamp', true, { beforeSample });

    // ---------- Milestone 3: database, settings, secrets ----------

    const dbStatus = await runJavaScript(window, 'window.jarvis.getDatabaseStatus()');
    check(
      'database reports schema v1 with one applied migration',
      dbStatus?.database?.initialized === true &&
        dbStatus.database.schemaVersion === 2 &&
        dbStatus.database.appliedMigrations.length === 2,
      dbStatus?.database,
    );
    check('database file exists in userData', fs.existsSync(path.join(USER_DATA, 'jarvis.db')), USER_DATA);
    check(
      'safeStorage is available for verification',
      dbStatus?.secretStorage?.available === true,
      dbStatus?.secretStorage,
    );

    const defaults = await runJavaScript(window, 'window.jarvis.getSettings()');
    check(
      'settings expose documented defaults',
      defaults['ui.reduceMotion'] === false &&
        defaults['ui.compactSidebar'] === false &&
        defaults['ai.activeProviderId'] === null &&
        defaults['ai.defaultModel'] === '',
      defaults,
    );

    const persisted = await runJavaScript(
      window,
      "window.jarvis.setSetting('ui.reduceMotion', true)",
    );
    await runJavaScript(window, "window.jarvis.setSetting('ui.compactSidebar', true)");
    check('setting writes return the stored state', persisted['ui.reduceMotion'] === true, persisted);

    const invalidSetting = await tryApi(
      window,
      "window.jarvis.setSetting('ui.reduceMotion', 'not-a-boolean')",
    );
    check('invalid setting values are rejected', invalidSetting.ok === false, invalidSetting);

    // Simulate a restart: close the database, reopen it, and reload the window.
    shutdownCoreServices();
    const restarted = initializeCoreServices({
      userDataPath: USER_DATA,
      cipher: new SafeStorageCipher(),
    });
    check(
      'database reopens cleanly after shutdown',
      restarted.database.initialized && restarted.database.schemaVersion === 2,
      restarted.database,
    );

    await runJavaScript(window, 'window.location.reload()');
    await waitFor(window, "document.getElementById('root')?.innerHTML.length > 0", 10000, 'renderer reload');
    await waitFor(window, "document.querySelector('.app-shell--compact') !== null", 6000, 'persisted compact sidebar');

    const afterRestart = await runJavaScript(window, 'window.jarvis.getSettings()');
    check(
      'settings persist across a restart',
      afterRestart['ui.reduceMotion'] === true && afterRestart['ui.compactSidebar'] === true,
      afterRestart,
    );

    // ---------- Milestone 3: permissions and encrypted secrets ----------

    const deniedWrite = await tryApi(
      window,
      `window.jarvis.setSecret('provider:verify', ${JSON.stringify(PLAINTEXT_KEY)})`,
    );
    check('credential writes require an explicit permission', deniedWrite.ok === false, deniedWrite);

    const granted = await runJavaScript(
      window,
      "window.jarvis.setPermission('credentials.manage', 'grant')",
    );
    const grantedState = granted.permissions.find(
      (entry) => entry.capability === 'credentials.manage',
    )?.state;
    check('credential permission can be granted', grantedState === 'granted', grantedState);

    const blockedPlanned = await tryApi(
      window,
      "window.jarvis.setPermission('system.exec', 'grant')",
    );
    check('unimplemented capabilities cannot be granted', blockedPlanned.ok === false, blockedPlanned);

    const secretStatus = await runJavaScript(
      window,
      `window.jarvis.setSecret('provider:verify', ${JSON.stringify(PLAINTEXT_KEY)})`,
    );
    check('credential is encrypted and counted', secretStatus.entryCount === 1, secretStatus);

    const secretsFile = path.join(USER_DATA, 'secrets.bin');
    check('secret file exists', fs.existsSync(secretsFile), secretsFile);
    check(
      'credential store contains no plaintext key',
      !containsPlaintext(secretsFile),
      'secrets.bin',
    );
    check(
      'database contains no plaintext key',
      !containsPlaintext(path.join(USER_DATA, 'jarvis.db')) &&
        !containsPlaintext(path.join(USER_DATA, 'jarvis.db-wal')),
      'jarvis.db',
    );
    check(
      'renderer has no secret-reading API',
      await runJavaScript(window, "typeof window.jarvis.getSecret === 'undefined' && typeof window.jarvis.getSecretInternal === 'undefined'"),
      'secret getters',
    );

    const decrypted = getCoreServices().secrets.getSecretInternal('provider:verify');
    check('main process can decrypt the stored credential', decrypted === PLAINTEXT_KEY, 'round-trip');

    // ---------- Milestone 3: providers ----------

    const provider = await runJavaScript(
      window,
      `window.jarvis.saveProvider(${JSON.stringify({
        name: 'Verification Provider',
        protocol: 'openai-compatible',
        baseUrl: 'https://api.verify.test/v1',
        modelIds: ['verify-model'],
        enabled: true,
        priority: 10,
      })})`,
    );
    check('provider is created in SQLite', Boolean(provider?.id) && provider.name === 'Verification Provider', provider);

    await runJavaScript(
      window,
      `window.jarvis.setSecret('provider:${provider.id}', ${JSON.stringify(PLAINTEXT_KEY)})`,
    );
    const configured = await runJavaScript(window, 'window.jarvis.listProviders()');
    check(
      'provider reports a configured credential without exposing it',
      configured[0]?.credentialState === 'configured' &&
        !JSON.stringify(configured).includes(PLAINTEXT_KEY),
      configured[0],
    );

    const activated = await runJavaScript(
      window,
      `window.jarvis.setActiveProvider(${JSON.stringify(provider.id)})`,
    );
    const activeSettings = await runJavaScript(window, 'window.jarvis.getSettings()');
    check(
      'provider activation updates the active provider and model',
      activated[0]?.isActive === true &&
        activeSettings['ai.activeProviderId'] === provider.id &&
        activeSettings['ai.defaultModel'] === 'verify-model',
      activeSettings,
    );

    const invalidProvider = await tryApi(
      window,
      `window.jarvis.saveProvider(${JSON.stringify({
        name: 'Bad',
        protocol: 'openai-compatible',
        baseUrl: 'not-a-url',
        modelIds: ['model'],
        enabled: true,
        priority: 1,
      })})`,
    );
    check('invalid provider input is rejected', invalidProvider.ok === false, invalidProvider);

    const disposable = await runJavaScript(
      window,
      `window.jarvis.saveProvider(${JSON.stringify({
        name: 'Disposable Provider',
        protocol: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9999/v1',
        modelIds: ['local-model'],
        enabled: false,
        priority: 50,
      })})`,
    );
    const removed = await runJavaScript(
      window,
      `window.jarvis.removeProvider(${JSON.stringify(disposable.id)})`,
    );
    check('provider removal deletes the row', removed.removed === true, removed);

    // ---------- Milestone 3: activity log ----------

    getCoreServices().activity.record({
      category: 'security',
      severity: 'info',
      action: 'verification.redaction',
      outcome: 'info',
      detail: `${PLAINTEXT_KEY} and Authorization: Bearer abcdef123456`,
    });

    const activity = await runJavaScript(
      window,
      "window.jarvis.listActivity({ query: 'verification.redaction' })",
    );
    check(
      'activity log persists entries with redacted details',
      activity.length === 1 &&
        !activity[0].detail.includes(PLAINTEXT_KEY) &&
        !activity[0].detail.includes('abcdef123456') &&
        activity[0].detail.includes('[redacted-key]'),
      activity,
    );

    const filteredActivity = await runJavaScript(
      window,
      "window.jarvis.listActivity({ category: 'provider', limit: 10 })",
    );
    check(
      'activity filters return matching categories',
      filteredActivity.length > 0 && filteredActivity.every((entry) => entry.category === 'provider'),
      filteredActivity.map((entry) => entry.category),
    );

    // ---------- Milestone 4: AI provider layer (local stub) ----------

    const stubBaseUrl = `http://127.0.0.1:${stubServer.address().port}/v1`;
    const aiBefore = await runJavaScript(window, 'window.jarvis.getAiStatus()');
    check(
      'AI status is honest before network permission',
      aiBefore.networkPermission === 'unset' && aiBefore.ready === false,
      { permission: aiBefore.networkPermission, ready: aiBefore.ready },
    );

    const stubProvider = await runJavaScript(
      window,
      `window.jarvis.saveProvider(${JSON.stringify({
        name: 'Stub Provider',
        protocol: 'openai-compatible',
        baseUrl: stubBaseUrl,
        modelIds: STUB_MODELS,
        enabled: true,
        priority: 5,
      })})`,
    );
    check(
      'stub provider is persisted with the local endpoint',
      Boolean(stubProvider?.id) && stubProvider.baseUrl === stubBaseUrl,
      { id: stubProvider?.id, baseUrl: stubProvider?.baseUrl },
    );

    await runJavaScript(
      window,
      `window.jarvis.setSecret('provider:${stubProvider.id}', ${JSON.stringify(PLAINTEXT_KEY)})`,
    );
    await runJavaScript(
      window,
      `window.jarvis.setActiveProvider(${JSON.stringify(stubProvider.id)})`,
    );
    const aiConfigured = await runJavaScript(window, 'window.jarvis.getAiStatus()');
    check(
      'AI status resolves the active provider, model and credential',
      aiConfigured.activeProviderId === stubProvider.id &&
        aiConfigured.model === 'stub-model-a' &&
        aiConfigured.credentialState === 'configured',
      {
        activeProviderId: aiConfigured.activeProviderId,
        model: aiConfigured.model,
        credentialState: aiConfigured.credentialState,
      },
    );
    check(
      'AI status exposes no credential material',
      !JSON.stringify(aiConfigured).includes(PLAINTEXT_KEY),
      'status JSON',
    );

    const chatRequestsBefore = () =>
      stubRequests.filter(
        (entry) => entry.method === 'POST' && entry.url === '/v1/chat/completions',
      ).length;

    const deniedStream = await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-denied-001', {messages:[{role:'user',content:'hello'}]})",
    );
    check(
      'AI streams require explicit network permission',
      deniedStream.accepted === false &&
        deniedStream.error?.code === 'permission_denied' &&
        chatRequestsBefore() === 0,
      { accepted: deniedStream.accepted, code: deniedStream.error?.code, requests: chatRequestsBefore() },
    );

    const networkGrant = await runJavaScript(
      window,
      "window.jarvis.setPermission('network.request', 'grant')",
    );
    check(
      'network permission can be granted and persisted',
      networkGrant.permissions.find((entry) => entry.capability === 'network.request')?.state ===
        'granted',
      'network.request',
    );

    await runJavaScript(
      window,
      "(() => { window.__aiEvents = []; window.__aiUnsub = window.jarvis.onChatStreamEvent((payload) => window.__aiEvents.push(payload)); return true; })()",
    );

    const streamStart = await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-stream-001', {messages:[{role:'user',content:'hello'}]})",
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'done')",
      5000,
      'AI stream completion',
    );
    const streamEvents = await runJavaScript(window, 'window.__aiEvents');
    const assembled = streamEvents
      .filter((entry) => entry.event.type === 'delta')
      .map((entry) => entry.event.text)
      .join('');
    const doneEvent = streamEvents[streamEvents.length - 1].event;
    check(
      'local stub streams normalized start/delta/done events',
      streamStart.accepted === true &&
        streamEvents[0].event.type === 'start' &&
        assembled === 'Hello from stub' &&
        doneEvent.type === 'done' &&
        doneEvent.finishReason === 'stop' &&
        doneEvent.usage.totalTokens === 5,
      { types: streamEvents.map((entry) => entry.event.type), assembled, finish: doneEvent.finishReason },
    );

    const chatRequests = stubRequests.filter(
      (entry) => entry.method === 'POST' && entry.url === '/v1/chat/completions',
    );
    check(
      'the API key is loaded in main process only',
      chatRequests.length === 1 &&
        chatRequests[0].authorization === `Bearer ${PLAINTEXT_KEY}` &&
        !JSON.stringify(streamEvents).includes(PLAINTEXT_KEY),
      { requests: chatRequests.length, authorizationPresent: Boolean(chatRequests[0]?.authorization) },
    );

    const modelList = await runJavaScript(window, 'window.jarvis.listAiModels()');
    check(
      'provider health/model listing uses the real adapter',
      modelList.ok === true && modelList.models.includes('stub-model-a'),
      { ok: modelList.ok, models: modelList.models },
    );

    await runJavaScript(window, "window.jarvis.setSetting('ai.defaultModel', 'stub-model-b')");
    await runJavaScript(window, 'window.__aiEvents = []');
    await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-model-001', {messages:[{role:'user',content:'switch'}]})",
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'done')",
      5000,
      'model switch stream',
    );
    const lastChatRequest = stubRequests.filter(
      (entry) => entry.method === 'POST' && entry.url === '/v1/chat/completions',
    ).at(-1);
    check(
      'switching the default model through settings changes the request',
      lastChatRequest?.model === 'stub-model-b',
      { model: lastChatRequest?.model },
    );
    await runJavaScript(window, "window.jarvis.setSetting('ai.defaultModel', 'stub-model-a')");

    await runJavaScript(
      window,
      `window.jarvis.setActiveProvider(${JSON.stringify(provider.id)})`,
    );
    const switchedProvider = await runJavaScript(window, 'window.jarvis.getAiStatus()');
    check(
      'switching the active provider works without code changes',
      switchedProvider.activeProviderId === provider.id && switchedProvider.model === 'verify-model',
      { activeProviderId: switchedProvider.activeProviderId, model: switchedProvider.model },
    );
    await runJavaScript(
      window,
      `window.jarvis.setActiveProvider(${JSON.stringify(stubProvider.id)})`,
    );

    stubState.retryCount = 0;
    await runJavaScript(window, 'window.__aiEvents = []');
    await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-retry-001', {messages:[{role:'user',content:'retry'}], model:'retry-model'})",
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'done')",
      5000,
      'retry stream',
    );
    const retryEvents = await runJavaScript(window, 'window.__aiEvents');
    const retryText = retryEvents
      .filter((entry) => entry.event.type === 'delta')
      .map((entry) => entry.event.text)
      .join('');
    check(
      'retryable HTTP failures are retried before content',
      stubState.retryCount === 2 && retryText === 'recovered',
      { attempts: stubState.retryCount, text: retryText },
    );

    await runJavaScript(window, 'window.__aiEvents = []');
    await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-error-001', {messages:[{role:'user',content:'fail'}], model:'denied-model'})",
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'error')",
      5000,
      'normalized provider error',
    );
    const errorEvents = await runJavaScript(window, 'window.__aiEvents');
    const normalizedError = errorEvents.find((entry) => entry.event.type === 'error').event.error;
    check(
      'HTTP failures are normalized and contain no credentials',
      normalizedError.code === 'http_error' &&
        normalizedError.retryable === false &&
        !JSON.stringify(errorEvents).includes(PLAINTEXT_KEY),
      { code: normalizedError.code, retryable: normalizedError.retryable },
    );

    await runJavaScript(window, 'window.__aiEvents = []');
    await runJavaScript(
      window,
      "window.jarvis.startChatStream('req-cancel-001', {messages:[{role:'user',content:'slow'}], model:'slow-model'})",
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'delta')",
      5000,
      'slow stream first chunk',
    );
    const cancelResult = await runJavaScript(
      window,
      "window.jarvis.cancelChatStream('req-cancel-001')",
    );
    check('stream cancellation is accepted', cancelResult.cancelled === true, cancelResult);
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'cancelled')",
      5000,
      'stream cancellation event',
    );
    const deltasBeforeWait = await runJavaScript(
      window,
      "window.__aiEvents.filter((entry) => entry.event.type === 'delta').length",
    );
    await wait(400);
    const deltasAfterWait = await runJavaScript(
      window,
      "window.__aiEvents.filter((entry) => entry.event.type === 'delta').length",
    );
    const cancelEvents = await runJavaScript(window, 'window.__aiEvents');
    const cancelActivity = await runJavaScript(
      window,
      "window.jarvis.listActivity({ query: 'ai.request.cancelled' })",
    );
    check(
      'cancellation stops the stream with one terminal event',
      cancelEvents.filter((entry) => entry.event.type === 'cancelled').length === 1 &&
        !cancelEvents.some((entry) => entry.event.type === 'error') &&
        deltasAfterWait === deltasBeforeWait,
      { deltasBeforeWait, deltasAfterWait },
    );
    check(
      'cancellation writes a terminal activity entry',
      cancelActivity.length >= 1,
      cancelActivity.map((entry) => entry.action),
    );

    // ---------- Milestone 5: persistent conversations ----------

    const renameConversation = await runJavaScript(
      window,
      "window.jarvis.createConversation({title:'Rename me', model:'stub-model-a'})",
    );
    const renamedConversation = await runJavaScript(
      window,
      `window.jarvis.renameConversation(${JSON.stringify(renameConversation.id)}, 'Renamed chat')`,
    );
    check(
      'conversations can be renamed',
      renamedConversation.title === 'Renamed chat',
      renamedConversation,
    );
    const removedConversation = await runJavaScript(
      window,
      `window.jarvis.deleteConversation(${JSON.stringify(renameConversation.id)})`,
    );
    check('conversations can be deleted', removedConversation.removed === true, removedConversation);

    const persistenceConversation = await runJavaScript(
      window,
      "window.jarvis.createConversation({title:'Persistence Chat', model:'stub-model-a'})",
    );
    await runJavaScript(
      window,
      `window.jarvis.appendConversationMessage({conversationId:${JSON.stringify(persistenceConversation.id)}, role:'user', content:'persisted hello'})`,
    );
    await runJavaScript(window, 'window.__aiEvents = []');
    await runJavaScript(
      window,
      `window.jarvis.startChatStream('req-persist-001', {messages:[{role:'user',content:'persisted hello'}], model:'stub-model-a'})`,
    );
    await waitFor(
      window,
      "window.__aiEvents.some((entry) => entry.event.type === 'done')",
      5000,
      'persistent conversation stream',
    );
    const persistenceEvents = await runJavaScript(window, 'window.__aiEvents');
    const persistenceText = persistenceEvents
      .filter((entry) => entry.event.type === 'delta')
      .map((entry) => entry.event.text)
      .join('');
    await runJavaScript(
      window,
      `window.jarvis.appendConversationMessage({conversationId:${JSON.stringify(persistenceConversation.id)}, role:'assistant', content:${JSON.stringify(persistenceText)}, metadata:{status:'complete'}})`,
    );
    const beforeRestart = await runJavaScript(
      window,
      `window.jarvis.getConversation(${JSON.stringify(persistenceConversation.id)})`,
    );
    check(
      'conversation messages are stored before restart',
      beforeRestart.messages.length === 2 &&
        beforeRestart.messages[1].content === 'Hello from stub',
      beforeRestart.messages.map((entry) => entry.role),
    );

    shutdownCoreServices();
    const reopened = initializeCoreServices({
      userDataPath: USER_DATA,
      cipher: new SafeStorageCipher(),
    });
    check(
      'database reopens for conversation persistence',
      reopened.database.initialized && reopened.database.schemaVersion === 2,
      reopened.database,
    );
    await runJavaScript(window, 'window.location.reload()');
    await waitFor(window, "document.getElementById('root')?.innerHTML.length > 0", 10000, 'renderer reload after persistence restart');
    const afterConversationRestart = await runJavaScript(
      window,
      `window.jarvis.getConversation(${JSON.stringify(persistenceConversation.id)})`,
    );
    check(
      'conversation history survives restart',
      afterConversationRestart.conversation.title === 'Persistence Chat' &&
        afterConversationRestart.messages.length === 2 &&
        afterConversationRestart.messages[0].content === 'persisted hello' &&
        afterConversationRestart.messages[1].content === 'Hello from stub',
      afterConversationRestart.messages.map((entry) => entry.role),
    );
    await runJavaScript(
      window,
      `window.jarvis.deleteConversation(${JSON.stringify(persistenceConversation.id)})`,
    );

    await runJavaScript(window, 'window.__aiUnsub ? window.__aiUnsub() : true');

    // ---------- Milestone 3: settings UI ----------

    // Reload once more so the renderer context reflects every API mutation
    // performed above (providers, permissions, secrets) before UI assertions.
    await runJavaScript(window, 'window.location.reload()');
    await waitFor(window, "document.getElementById('root')?.innerHTML.length > 0", 10000, 'renderer reload for settings');
    await waitFor(window, "document.querySelector('.app-shell--compact') !== null", 6000, 'persisted compact sidebar after reload');

    await runJavaScript(window, "document.querySelector('[data-view=\"settings\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"settings\"]') !== null", 5000, 'settings view');

    check(
      'settings view shows real database status',
      await runJavaScript(window, "document.querySelector('[data-testid=\"database-status\"]')?.getAttribute('data-schema-version') === '2' && document.body.textContent.includes('Initialized')"),
      'database status',
    );

    check(
      'persisted appearance settings are applied to the shell',
      await runJavaScript(window, "document.querySelector('.app-shell--compact') !== null && document.querySelector('.app-shell--reduce-motion') !== null && document.querySelector('[data-setting=\"ui.reduceMotion\"]')?.getAttribute('aria-checked') === 'true'"),
      'shell classes',
    );

    await runJavaScript(window, "document.querySelector('[data-setting=\"ui.reduceMotion\"]')?.click()");
    await waitFor(window, "document.querySelector('.app-shell--reduce-motion') === null", 4000, 'reduce motion off');
    check('reduce-motion toggle changes the live shell', true, 'class removed');

    const compactBefore = await runJavaScript(window, "document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0");
    await runJavaScript(window, "document.querySelector('[data-setting=\"ui.compactSidebar\"]')?.click()");
    await waitFor(window, "document.querySelector('.app-shell--compact') === null", 4000, 'compact sidebar off');
    const compactAfter = await runJavaScript(window, "document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0");
    check(
      'compact-sidebar toggle changes the live layout',
      compactAfter > compactBefore,
      { compactBefore, compactAfter },
    );

    check(
      'permissions panel renders the enforced capability',
      await runJavaScript(window, "document.querySelector('[data-capability=\"credentials.manage\"]')?.textContent.includes('granted')"),
      'credentials.manage',
    );

    await runJavaScript(window, "document.querySelector('[data-capability=\"credentials.manage\"] [data-action=\"revoke-permission\"]')?.click()");
    await waitFor(window, "document.querySelector('[data-capability=\"credentials.manage\"]')?.textContent.includes('unset')", 4000, 'permission revoke');
    check('revoke updates the permission state', true, 'unset');
    await runJavaScript(window, "document.querySelector('[data-capability=\"credentials.manage\"] [data-action=\"grant-permission\"]')?.click()");
    await waitFor(window, "document.querySelector('[data-capability=\"credentials.manage\"]')?.textContent.includes('granted')", 4000, 'permission grant');
    check('grant restores the permission state', true, 'granted');

    check(
      'provider card is rendered from persisted data',
      await runJavaScript(window, `document.querySelector('[data-provider-id=\"${provider.id}\"]')?.textContent.includes('Verification Provider')`),
      provider.id,
    );

    check(
      'activity panel shows persisted entries',
      await runJavaScript(window, "document.querySelectorAll('[data-testid=\"activity-list\"] .activity-entry').length > 0"),
      'activity rows',
    );

    check(
      'AI panel renders real runtime status',
      await runJavaScript(
        window,
        `document.querySelector('[data-testid="ai-status"]')?.getAttribute('data-ai-ready') === 'true' && document.body.textContent.includes('Stub Provider')`,
      ),
      'AI runtime status',
    );

    await runJavaScript(
      window,
      "document.querySelector('[data-action=\"ai-test-connection\"]')?.click()",
    );
    await waitFor(
      window,
      "document.querySelector('[data-testid=\"ai-models\"]')?.textContent.includes('stub-model-a')",
      6000,
      'AI model list in UI',
    );
    check('AI test connection performs a real model request through the UI', true, 'models rendered');

    await runJavaScript(
      window,
      `(() => {
        const element = document.querySelector('[aria-label="AI stream test prompt"]');
        if (!element) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(element, 'ui stream');
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    await runJavaScript(
      window,
      "document.querySelector('[data-action=\"ai-run-stream\"]')?.click()",
    );
    await waitFor(
      window,
      "document.querySelector('[data-testid=\"ai-stream-output\"]')?.textContent.includes('Hello from stub')",
      6000,
      'UI stream output',
    );
    check('AI stream diagnostic renders real streamed output through the UI', true, 'output rendered');

    await runJavaScript(
      window,
      `(() => {
        const element = document.querySelector('[aria-label="Default AI model"]');
        if (!element) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(element, 'stub-model-b');
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    );
    let uiModelSetting = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      uiModelSetting = await runJavaScript(
        window,
        "window.jarvis.getSettings().then((current) => current['ai.defaultModel'])",
      );
      if (uiModelSetting === 'stub-model-b') {
        break;
      }
      await wait(100);
    }
    check(
      'default model can be switched through the settings UI',
      uiModelSetting === 'stub-model-b',
      uiModelSetting,
    );

    await runJavaScript(window, "document.querySelector('[data-view=\"chat\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"chat\"]') !== null", 5000, 'chat view');
    await waitFor(window, "document.querySelector('[data-conversation-id]') !== null", 8000, 'chat conversation');
    await runJavaScript(
      window,
      `(() => {
        const element = document.querySelector('[aria-label="Chat message"]');
        if (!element) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(element, 'ui chat message');
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    await runJavaScript(window, "document.querySelector('[data-action=\"send-message\"]')?.click()");
    await waitFor(
      window,
      "document.querySelector('.chat-message--assistant .markdown-message')?.textContent.includes('Hello from stub')",
      8000,
      'chat streamed response',
    );
    check('chat view streams a real response through the UI', true, 'Hello from stub');

    await runJavaScript(window, "document.querySelector('[data-view=\"settings\"]').click()");
    await waitFor(window, "document.querySelector('[data-view-heading=\"settings\"]') !== null", 5000, 'settings view return');

    check(
      'provider card exists before UI removal',
      await runJavaScript(window, `document.querySelector('[data-provider-id=\"${provider.id}\"]') !== null`),
      provider.id,
    );

    // Remove the verification provider through the real UI action.
    await runJavaScript(window, 'void (window.confirm = () => true)');
    await runJavaScript(window, `document.querySelector('[data-provider-id=\"${provider.id}\"] [data-action=\"remove-provider\"]')?.click()`);
    await waitFor(window, `document.querySelector('[data-provider-id=\"${provider.id}\"]') === null`, 5000, 'provider removal');
    check('provider removal works through the UI', true, provider.id);

    // Add a provider through the form with React-compatible input events.
    await runJavaScript(
      window,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          setter.call(element, value);
          element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
          return true;
        };
        return setValue('[aria-label="Provider name"]', 'UI Provider') &&
          setValue('[aria-label="Provider base URL"]', 'https://api.ui.test/v1') &&
          setValue('[aria-label="Provider models"]', 'ui-model-a, ui-model-b');
      })()`,
    );
    await runJavaScript(window, "document.querySelector('[data-action=\"save-provider\"]')?.click()");
    await waitFor(window, "document.body.textContent.includes('UI Provider')", 5000, 'provider form save');
    check('provider form saves through the real IPC path', true, 'UI Provider');

    // ---------- Existing error-state verification ----------

    // Exercise the error and loading states with a handler that cannot succeed.
    ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_GET_METRICS);
    ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_METRICS, async () => {
      await wait(400);
      throw new Error('Deliberate verification failure');
    });

    await runJavaScript(window, "window.location.reload()");
    await waitFor(window, "document.querySelector('[data-loading=\"system-metrics\"]') !== null", 2000, 'loading state').catch(() => null);
    await waitFor(window, "document.body.textContent.includes('Telemetry unavailable')", 5000, 'error state');
    check('error state is shown for failed telemetry', true, 'Telemetry unavailable');

    window.setContentSize(960, 640);
    await wait(500);
    const layout = await runJavaScript(window, "({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, navCount: document.querySelectorAll('.nav-item').length, sidebarWidth: document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0 })");
    check('layout fits at 960x640', layout.scrollWidth <= layout.innerWidth + 1 && layout.navCount === 8 && layout.sidebarWidth > 0, layout);

    check('no renderer console errors', errors.length === 0, errors);
  } catch (error) {
    console.log(`WINDOW_VERIFY_ERROR ${error instanceof Error ? error.stack : String(error)} LAST_SCRIPT ${lastScript} CONSOLE ${JSON.stringify(errors)}`);
    window.destroy();
    await stopStubServer();
    cleanupUserData();
    app.exit(1);
    return;
  }

  const failed = checks.filter((item) => !item.passed);
  console.log(`WINDOW_VERIFY ${JSON.stringify({ checks, summary: { total: checks.length, failed: failed.length }, appInfo: null, logs: errors })}`);

  window.destroy();
  await stopStubServer();
  cleanupUserData();
  app.exit(failed.length === 0 ? 0 : 1);
});
