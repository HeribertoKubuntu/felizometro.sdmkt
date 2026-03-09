const path = require('node:path');
const { app, BrowserWindow, shell } = require('electron');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  console.warn('electron-updater no esta disponible:', error.message);
}

function parseConfig() {
  const raw = process.env.APP_CONFIG_JSON;
  if (!raw) {
    return {
      id: 'default',
      name: 'WebApp',
      url: 'https://example.com',
      width: 1280,
      height: 800,
      fullscreen: false,
      kiosk: false,
      userAgent: '',
      autoUpdate: {
        enabled: false,
        feedUrl: '',
      },
    };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('No se pudo parsear APP_CONFIG_JSON:', error);
    return {
      id: 'default',
      name: 'WebApp',
      url: 'https://example.com',
      width: 1280,
      height: 800,
      fullscreen: false,
      kiosk: false,
      userAgent: '',
      autoUpdate: {
        enabled: false,
        feedUrl: '',
      },
    };
  }
}

function setupAutoUpdater(config) {
  const updatesEnabled = Boolean(config?.autoUpdate?.enabled);
  const provider = config?.autoUpdate?.provider || process.env.AUTO_UPDATE_PROVIDER || 'generic';
  const feedUrl = config?.autoUpdate?.feedUrl || process.env.AUTO_UPDATE_FEED_URL || '';
  const githubOwner = config?.autoUpdate?.githubOwner || process.env.AUTO_UPDATE_GITHUB_OWNER || '';
  const githubRepo = config?.autoUpdate?.githubRepo || process.env.AUTO_UPDATE_GITHUB_REPO || '';

  if (!autoUpdater || !updatesEnabled || !app.isPackaged) {
    return;
  }

  if (provider === 'generic' && !feedUrl) {
    console.warn('[updater] provider generic requiere autoUpdate.feedUrl');
    return;
  }

  if (provider === 'github' && (!githubOwner || !githubRepo)) {
    console.warn('[updater] provider github requiere githubOwner y githubRepo');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] revisando actualizaciones...');
  });
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] actualizacion disponible:', info?.version || 'sin version');
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no hay actualizaciones disponibles');
  });
  autoUpdater.on('error', (error) => {
    console.error('[updater] error:', error?.message || error);
  });
  autoUpdater.on('update-downloaded', () => {
    console.log('[updater] actualizacion descargada, se instalara al cerrar la app');
  });

  if (provider === 'generic') {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: feedUrl,
    });
  }

  if (provider === 'github') {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: githubOwner,
      repo: githubRepo,
      private: Boolean(config?.autoUpdate?.private),
      token: process.env.GH_TOKEN || '',
    });
  }

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[updater] fallo al buscar actualizaciones:', error?.message || error);
  });
}

function createWindow(config) {
  const win = new BrowserWindow({
    width: config.width || 1280,
    height: config.height || 800,
    fullscreen: Boolean(config.fullscreen),
    kiosk: Boolean(config.kiosk),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  if (config.userAgent) {
    win.webContents.setUserAgent(config.userAgent);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(config.url);
}

app.commandLine.appendSwitch('disable-features', 'TranslateUI');

app.whenReady().then(() => {
  const config = parseConfig();
  app.name = config.name || 'WebApp';
  createWindow(config);
  setupAutoUpdater(config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
