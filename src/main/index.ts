import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerAiIpc } from './ipc/ai.ipc';
import { registerActivityIpc } from './ipc/activity.ipc';
import { registerAppIpc } from './ipc/app.ipc';
import { registerConversationsIpc } from './ipc/conversations.ipc';
import { registerDatabaseIpc } from './ipc/database.ipc';
import { registerPermissionsIpc } from './ipc/permissions.ipc';
import { registerProvidersIpc } from './ipc/providers.ipc';
import { registerSecretsIpc } from './ipc/secrets.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';
import { registerSystemIpc } from './ipc/system.ipc';
import { initializeCoreServices, shutdownCoreServices } from './services/core-services';
import { SafeStorageCipher } from './services/safe-storage-cipher';

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://127.0.0.1:5173/';

function applyContentSecurityPolicy(): void {
  const csp = [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? ' ws://127.0.0.1:5173 http://127.0.0.1:5173' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#05070f',
    title: 'J.A.R.V.I.S.',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    void window.loadURL(DEV_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let hasLoaded = false;
  window.webContents.on('did-finish-load', () => {
    hasLoaded = true;
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!hasLoaded) {
      return;
    }

    const trustedUrl = isDev
      ? url.startsWith(DEV_URL)
      : url === pathToFileURL(path.join(__dirname, '../../dist-renderer/index.html')).toString();

    if (!trustedUrl) {
      event.preventDefault();
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });
}

app.whenReady().then(() => {
  applyContentSecurityPolicy();
  initializeCoreServices({
    userDataPath: app.getPath('userData'),
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  shutdownCoreServices();
});
