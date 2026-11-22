const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { registerAppIpc } = require('../dist-main/main/ipc/app.ipc.js');
const { registerSystemIpc } = require('../dist-main/main/ipc/system.ipc.js');
const { IPC_CHANNELS } = require('../dist-main/shared/ipc-channels.js');

const PRELOAD = path.join(__dirname, '../dist-main/preload/index.js');
const PAGE = path.join(__dirname, '../dist-renderer/index.html');

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

app.whenReady().then(async () => {
  const errors = [];
  registerAppIpc();
  registerSystemIpc();

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
    await window.loadFile(PAGE);
    await waitFor(window, "document.getElementById('root')?.innerHTML.length > 0", 10000, 'renderer mount');

    const api = await runJavaScript(window, 'Object.keys(window.jarvis).sort()');
    check('preload exposes the typed API', JSON.stringify(api) === JSON.stringify(['getAppInfo', 'getSystemMetrics', 'quitApp']), api);

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
    app.exit(1);
    return;
  }

  const failed = checks.filter((item) => !item.passed);
  console.log(`WINDOW_VERIFY ${JSON.stringify({ checks, summary: { total: checks.length, failed: failed.length }, appInfo: null, logs: errors })}`);

  window.destroy();
  app.exit(failed.length === 0 ? 0 : 1);
});
