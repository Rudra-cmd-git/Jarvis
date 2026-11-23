const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { registerActivityIpc } = require('../dist-main/main/ipc/activity.ipc.js');
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

async function runJavaScript(window, expression) {
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

const EXPECTED_API = [
  'deleteSecret',
  'getAppInfo',
  'getDatabaseStatus',
  'getSecretStatus',
  'getSettings',
  'getSystemMetrics',
  'listActivity',
  'listPermissions',
  'listProviders',
  'quitApp',
  'removeProvider',
  'resetSetting',
  'saveProvider',
  'setActiveProvider',
  'setPermission',
  'setSecret',
  'setSetting',
].sort();

app.whenReady().then(async () => {
  const errors = [];
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
      coreStatus.database.initialized && coreStatus.database.schemaVersion === 1,
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
        dbStatus.database.schemaVersion === 1 &&
        dbStatus.database.appliedMigrations.length === 1,
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
      restarted.database.initialized && restarted.database.schemaVersion === 1,
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
      await runJavaScript(window, "document.querySelector('[data-testid=\"database-status\"]')?.getAttribute('data-schema-version') === '1' && document.body.textContent.includes('Initialized')"),
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
    console.log(`WINDOW_VERIFY_ERROR ${error instanceof Error ? error.message : String(error)} ${JSON.stringify(errors)}`);
    window.destroy();
    cleanupUserData();
    app.exit(1);
    return;
  }

  const failed = checks.filter((item) => !item.passed);
  console.log(`WINDOW_VERIFY ${JSON.stringify({ checks, summary: { total: checks.length, failed: failed.length }, appInfo: null, logs: errors })}`);

  window.destroy();
  cleanupUserData();
  app.exit(failed.length === 0 ? 0 : 1);
});
