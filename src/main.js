const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');

let autoUpdater = null;
let updaterHandlersBound = false;
let manualUpdateCheckInProgress = false;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  console.warn('electron-updater no esta disponible:', error.message);
}

function defaultConfig() {
  return {
    id: 'default',
    name: 'WebApp',
    url: 'https://example.com',
    width: 1280,
    height: 800,
    fullscreen: false,
    kiosk: false,
    userAgent: '',
    graphics: {
      mode: 'auto',
    },
    autoUpdate: {
      enabled: false,
      feedUrl: '',
    },
    help: {
      authorGithubUrl: 'https://github.com/HeribertoKubuntu',
    },
  };
}

function readConfigFromEnv() {
  const raw = process.env.APP_CONFIG_JSON;
  if (!raw) {
    return defaultConfig();
  }

  try {
    const parsed = JSON.parse(raw);
    const base = defaultConfig();
    return {
      ...base,
      ...parsed,
      graphics: {
        ...base.graphics,
        ...(parsed.graphics || {}),
      },
      autoUpdate: {
        ...base.autoUpdate,
        ...(parsed.autoUpdate || {}),
      },
      help: {
        ...base.help,
        ...(parsed.help || {}),
      },
    };
  } catch (error) {
    console.error('No se pudo parsear APP_CONFIG_JSON:', error);
    return defaultConfig();
  }
}

function buildAppMenu(mainWindow, config) {
  const authorGithubUrl =
    config?.help?.authorGithubUrl || process.env.AUTHOR_GITHUB_URL || 'https://github.com/HeribertoKubuntu';
  const fullScreenAccelerator = process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11';

  const template = [
    {
      label: 'Herramientas',
      submenu: [
        {
          label: 'Eliminar cache',
          click: async () => {
            try {
              await mainWindow.webContents.session.clearCache();
              mainWindow.webContents.reloadIgnoringCache();
            } catch (error) {
              console.error('No se pudo limpiar la cache:', error?.message || error);
            }
          },
        },
        {
          label: 'Reiniciar app',
          click: () => {
            app.relaunch();
            app.exit(0);
          },
        },
      ],
    },
    {
      label: 'Vista',
      submenu: [
        {
          label: 'Acercar',
          role: 'zoomin',
          accelerator: 'CmdOrCtrl+Plus',
        },
        {
          label: 'Alejar',
          role: 'zoomout',
          accelerator: 'CmdOrCtrl+-',
        },
        {
          label: 'Restablecer zoom',
          role: 'resetzoom',
          accelerator: 'CmdOrCtrl+0',
        },
        {
          type: 'separator',
        },
        {
          label: 'Pantalla completa',
          role: 'togglefullscreen',
          accelerator: fullScreenAccelerator,
        },
        ...(process.platform === 'darwin'
          ? []
          : [
              {
                label: 'Pantalla completa (Alt+Enter)',
                accelerator: 'Alt+Enter',
                click: () => {
                  const isFullScreen = mainWindow.isFullScreen();
                  mainWindow.setFullScreen(!isFullScreen);
                },
              },
            ]),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Perfil GitHub del autor',
          click: () => {
            shell.openExternal(authorGithubUrl);
          },
        },
        {
          label: 'Buscar actualizaciones',
          click: () => {
            checkForUpdatesFromMenu(config);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function parseConfig() {
  return readConfigFromEnv();
}

function configureGraphics(config) {
  const mode = config?.graphics?.mode || process.env.GRAPHICS_MODE || 'auto';

  if (mode === 'software') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    app.commandLine.appendSwitch('use-gl', 'swiftshader');
    return;
  }

  if (mode === 'hardware') {
    return;
  }

  // En Linux ARM dejamos la deteccion automatica de Chromium.
}

async function checkForUpdatesFromMenu(config) {
  if (!autoUpdater) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Actualizaciones',
      message: 'El modulo de actualizaciones no esta disponible en esta instalacion.',
    });
    return;
  }

  if (!Boolean(config?.autoUpdate?.enabled)) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Actualizaciones',
      message: 'Las actualizaciones automaticas estan desactivadas en la configuracion.',
    });
    return;
  }

  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Actualizaciones',
      message: 'La busqueda de actualizaciones solo funciona en app empaquetada.',
    });
    return;
  }

  await dialog.showMessageBox({
    type: 'info',
    title: 'Actualizaciones',
    message: 'Buscando actualizaciones...',
  });

  manualUpdateCheckInProgress = true;
  setupAutoUpdater(config);
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

  if (!updaterHandlersBound) {
    autoUpdater.on('checking-for-update', () => {
      console.log('[updater] revisando actualizaciones...');
    });
    autoUpdater.on('update-available', (info) => {
      console.log('[updater] actualizacion disponible:', info?.version || 'sin version');
      if (manualUpdateCheckInProgress) {
        manualUpdateCheckInProgress = false;
        dialog
          .showMessageBox({
            type: 'info',
            title: 'Actualizaciones',
            message: `Hay una actualizacion disponible (${info?.version || 'nueva version'}). Se descargara automaticamente.`,
          })
          .catch(() => {});
      }
    });
    autoUpdater.on('update-not-available', () => {
      console.log('[updater] no hay actualizaciones disponibles');
      if (manualUpdateCheckInProgress) {
        manualUpdateCheckInProgress = false;
        dialog
          .showMessageBox({
            type: 'info',
            title: 'Actualizaciones',
            message: 'No hay actualizaciones disponibles por ahora.',
          })
          .catch(() => {});
      }
    });
    autoUpdater.on('error', (error) => {
      console.error('[updater] error:', error?.message || error);
      if (manualUpdateCheckInProgress) {
        manualUpdateCheckInProgress = false;
        dialog
          .showMessageBox({
            type: 'error',
            title: 'Actualizaciones',
            message: `No se pudo buscar actualizaciones: ${error?.message || error}`,
          })
          .catch(() => {});
      }
    });
    autoUpdater.on('update-downloaded', () => {
      console.log('[updater] actualizacion descargada, se instalara al cerrar la app');
      const cameFromManualCheck = manualUpdateCheckInProgress;
      manualUpdateCheckInProgress = false;

      if (Boolean(config?.kiosk)) {
        dialog
          .showMessageBox({
            type: 'info',
            title: 'Actualizacion lista',
            message: 'Se descargo una actualizacion y se reiniciara la app para instalarla ahora.',
            buttons: ['Reiniciar ahora'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
          .then(() => {
            autoUpdater.quitAndInstall();
          })
          .catch(() => {});
        return;
      }

      dialog
        .showMessageBox({
          type: 'info',
          title: 'Actualizacion lista',
          message: cameFromManualCheck
            ? 'La actualizacion ya se descargo. Puedes reiniciar ahora para instalarla.'
            : 'Se descargo una actualizacion en segundo plano. Puedes reiniciar ahora para instalarla.',
          buttons: ['Reiniciar ahora', 'Despues'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        .then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall();
          }
        })
        .catch(() => {});
    });
    updaterHandlersBound = true;
  }

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
    autoHideMenuBar: Boolean(config.kiosk),
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
  buildAppMenu(win, config);
}

const startupConfig = readConfigFromEnv();
configureGraphics(startupConfig);
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
