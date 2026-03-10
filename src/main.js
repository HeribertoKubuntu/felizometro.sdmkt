const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, net, shell, nativeImage } = require('electron');

let autoUpdater = null;
let updaterHandlersBound = false;
let manualUpdateCheckInProgress = false;
let connectivityTimer = null;
let connectivityLastStatus = null;
let connectivityDialogOpen = false;

const CONNECTIVITY_BANNER_ID = '__hery_connectivity_banner__';
const RUNTIME_PREFS_FILENAME = 'runtime-preferences.json';
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  console.warn('electron-updater no esta disponible:', error.message);
}

function defaultConfig() {
  return {
    id: 'default',
    name: 'WebApp',
    windowTitle: 'Felizometro',
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
    welcome: {
      enabled: true,
      delayMs: 2200,
      developerName: 'Heriberto Delgado',
      message: 'Preparando el entorno para abrir la aplicacion...',
    },
    connectivity: {
      enabled: true,
      checkIntervalMs: 30000,
      testUrl: '',
      notifyOnRestore: true,
      banner: {
        offlineMessage: 'Sin conexion a internet. Reintentando automaticamente...',
        restoredMessage: 'Conexion restaurada.',
        offlineBackgroundColor: '#b45309',
        restoredBackgroundColor: '#0f766e',
        textColor: '#ffffff',
        fontFamily: 'sans-serif',
        fontSizePx: 13,
        hideAfterMs: 2500,
      },
    },
  };
}

function readConfigFromEnv() {
  const raw = process.env.APP_CONFIG_JSON;
  const mergeWithDefaults = (input) => {
    const base = defaultConfig();
    return {
      ...base,
      ...input,
      graphics: {
        ...base.graphics,
        ...(input.graphics || {}),
      },
      autoUpdate: {
        ...base.autoUpdate,
        ...(input.autoUpdate || {}),
      },
      help: {
        ...base.help,
        ...(input.help || {}),
      },
      welcome: {
        ...base.welcome,
        ...(input.welcome || {}),
      },
      connectivity: {
        ...base.connectivity,
        ...(input.connectivity || {}),
        banner: {
          ...base.connectivity.banner,
          ...((input.connectivity && input.connectivity.banner) || {}),
        },
      },
    };
  };

  if (raw) {
    try {
      return mergeWithDefaults(JSON.parse(raw));
    } catch (error) {
      console.error('No se pudo parsear APP_CONFIG_JSON:', error);
      return defaultConfig();
    }
  }

  // En app empaquetada usamos la config embebida en package.json.
  try {
    const packagedPackageJsonPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(packagedPackageJsonPath)) {
      const packagedRaw = fs.readFileSync(packagedPackageJsonPath, 'utf8');
      const packaged = JSON.parse(packagedRaw);
      if (packaged?.heryAppConfig && typeof packaged.heryAppConfig === 'object') {
        return mergeWithDefaults(packaged.heryAppConfig);
      }
    }
  } catch (error) {
    console.warn('No se pudo leer config embebida del paquete:', error?.message || error);
  }

  // Fallback para modo desarrollo cuando APP_CONFIG_JSON no esta definido.
  try {
    const appsPath = path.join(process.cwd(), 'config', 'apps.json');
    const rawApps = fs.readFileSync(appsPath, 'utf8');
    const parsedApps = JSON.parse(rawApps);
    const firstApp = Array.isArray(parsedApps?.apps) && parsedApps.apps.length > 0 ? parsedApps.apps[0] : null;

    if (!firstApp) {
      return defaultConfig();
    }

    return mergeWithDefaults(firstApp);
  } catch (error) {
    console.error('No se pudo leer config/apps.json para modo desarrollo:', error?.message || error);
    return defaultConfig();
  }
}

function resolveIconPath(iconValue) {
  if (!iconValue || typeof iconValue !== 'string') {
    return '';
  }

  return path.isAbsolute(iconValue) ? iconValue : path.join(process.cwd(), iconValue);
}

function resolveRuntimeIconPath(config) {
  const candidates = [
    config?.icon,
    config?.iconWin,
    config?.iconMac,
    'src/icon.png',
    'src/icon.jpg',
    'src/icon.jpeg',
  ];

  for (const candidate of candidates) {
    const iconPath = resolveIconPath(candidate);
    if (iconPath && fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return '';
}

function applyDockIconIfNeeded(iconPath) {
  if (process.platform !== 'darwin' || !iconPath) {
    return;
  }

  try {
    const iconImage = nativeImage.createFromPath(iconPath);
    if (!iconImage.isEmpty() && app.dock && typeof app.dock.setIcon === 'function') {
      app.dock.setIcon(iconImage);
    }
  } catch (error) {
    console.warn('No se pudo aplicar icono al dock en desarrollo:', error?.message || error);
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRuntimePrefsPath() {
  return path.join(app.getPath('userData'), RUNTIME_PREFS_FILENAME);
}

function loadRuntimePrefs() {
  const defaults = {
    startInFullscreen: false,
    startMaximized: false,
  };

  try {
    const prefsPath = getRuntimePrefsPath();
    if (!fs.existsSync(prefsPath)) {
      return defaults;
    }

    const raw = fs.readFileSync(prefsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      startInFullscreen: Boolean(parsed?.startInFullscreen),
      startMaximized: Boolean(parsed?.startMaximized),
    };
  } catch (error) {
    console.warn('No se pudieron leer preferencias locales:', error?.message || error);
    return defaults;
  }
}

function saveRuntimePrefs(preferences) {
  const prefsPath = getRuntimePrefsPath();
  const prefsDir = path.dirname(prefsPath);
  fs.mkdirSync(prefsDir, { recursive: true });
  fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2), 'utf8');
}

async function loadWelcomePage(mainWindow, config) {
  if (!Boolean(config?.welcome?.enabled) || mainWindow.isDestroyed()) {
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, 'welcome.html'), {
    query: {
      appName: config?.name || 'Aplicacion',
      developer: config?.welcome?.developerName || 'Heriberto Delgado',
      message: config?.welcome?.message || 'Preparando el entorno para abrir la aplicacion...',
    },
  });

  const delayMs = Math.max(0, Number(config?.welcome?.delayMs) || 2200);
  if (delayMs > 0) {
    await wait(delayMs);
  }
}

function buildAppMenu(mainWindow, config, runtimePrefs) {
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
        {
          type: 'checkbox',
          id: 'start-in-fullscreen',
          label: 'Iniciar siempre en pantalla completa',
          checked: Boolean(runtimePrefs?.startInFullscreen),
          enabled: !Boolean(config?.kiosk),
          click: (menuItem) => {
            const previousValue = Boolean(runtimePrefs?.startInFullscreen);
            const previousMaximized = Boolean(runtimePrefs?.startMaximized);
            const nextValue = Boolean(menuItem.checked);

            try {
              runtimePrefs.startInFullscreen = nextValue;
              if (nextValue) {
                runtimePrefs.startMaximized = false;
              }
              saveRuntimePrefs(runtimePrefs);

              if (!mainWindow.isDestroyed()) {
                if (nextValue) {
                  mainWindow.unmaximize();
                  mainWindow.setFullScreen(true);
                } else {
                  mainWindow.setFullScreen(false);
                }
              }

              if (nextValue) {
                const appMenu = Menu.getApplicationMenu();
                const maximizeItem = appMenu?.getMenuItemById('start-maximized');
                if (maximizeItem) {
                  maximizeItem.checked = false;
                }
              }
            } catch (error) {
              runtimePrefs.startInFullscreen = previousValue;
              runtimePrefs.startMaximized = previousMaximized;
              menuItem.checked = previousValue;
              dialog
                .showMessageBox(mainWindow, {
                  type: 'error',
                  title: 'Preferencias',
                  message: 'No se pudo guardar la preferencia de pantalla completa.',
                  detail: error?.message || String(error),
                })
                .catch(() => {});
            }
          },
        },
        {
          type: 'checkbox',
          id: 'start-maximized',
          label: 'Iniciar siempre maximizada',
          checked: Boolean(runtimePrefs?.startMaximized),
          enabled: !Boolean(config?.kiosk),
          click: (menuItem) => {
            const previousFullscreen = Boolean(runtimePrefs?.startInFullscreen);
            const previousMaximized = Boolean(runtimePrefs?.startMaximized);
            const nextValue = Boolean(menuItem.checked);

            try {
              runtimePrefs.startMaximized = nextValue;
              if (nextValue) {
                runtimePrefs.startInFullscreen = false;
              }
              saveRuntimePrefs(runtimePrefs);

              if (!mainWindow.isDestroyed()) {
                if (nextValue) {
                  mainWindow.setFullScreen(false);
                  mainWindow.maximize();
                } else if (mainWindow.isMaximized()) {
                  mainWindow.unmaximize();
                }
              }

              if (nextValue) {
                const appMenu = Menu.getApplicationMenu();
                const fullscreenItem = appMenu?.getMenuItemById('start-in-fullscreen');
                if (fullscreenItem) {
                  fullscreenItem.checked = false;
                }
              }
            } catch (error) {
              runtimePrefs.startInFullscreen = previousFullscreen;
              runtimePrefs.startMaximized = previousMaximized;
              menuItem.checked = previousMaximized;
              dialog
                .showMessageBox(mainWindow, {
                  type: 'error',
                  title: 'Preferencias',
                  message: 'No se pudo guardar la preferencia de inicio maximizado.',
                  detail: error?.message || String(error),
                })
                .catch(() => {});
            }
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Restablecer preferencias de ventana',
          enabled: !Boolean(config?.kiosk),
          click: () => {
            const previousFullscreen = Boolean(runtimePrefs?.startInFullscreen);
            const previousMaximized = Boolean(runtimePrefs?.startMaximized);

            try {
              runtimePrefs.startInFullscreen = false;
              runtimePrefs.startMaximized = false;
              saveRuntimePrefs(runtimePrefs);

              if (!mainWindow.isDestroyed()) {
                mainWindow.setFullScreen(false);
                if (mainWindow.isMaximized()) {
                  mainWindow.unmaximize();
                }
              }

              const appMenu = Menu.getApplicationMenu();
              const fullscreenItem = appMenu?.getMenuItemById('start-in-fullscreen');
              const maximizeItem = appMenu?.getMenuItemById('start-maximized');

              if (fullscreenItem) {
                fullscreenItem.checked = false;
              }

              if (maximizeItem) {
                maximizeItem.checked = false;
              }

              dialog
                .showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Preferencias',
                  message: 'Las preferencias de ventana se restablecieron correctamente.',
                })
                .catch(() => {});
            } catch (error) {
              runtimePrefs.startInFullscreen = previousFullscreen;
              runtimePrefs.startMaximized = previousMaximized;
              dialog
                .showMessageBox(mainWindow, {
                  type: 'error',
                  title: 'Preferencias',
                  message: 'No se pudieron restablecer las preferencias de ventana.',
                  detail: error?.message || String(error),
                })
                .catch(() => {});
            }
          },
        },
        {
          label: 'Salir',
          click: () => {
            app.quit();
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

function applyAppIdentity(config) {
  const appName = config?.name || 'WebApp';
  const appId = config?.id || 'default';

  app.setName(appName);
  app.name = appName;

  if (typeof app.setAppUserModelId === 'function') {
    app.setAppUserModelId(`com.herynativefier.${appId}`);
  }
}

function stopConnectivityMonitoring() {
  if (connectivityTimer) {
    clearInterval(connectivityTimer);
    connectivityTimer = null;
  }
}

function getConnectivityProbeUrl(config) {
  if (config?.connectivity?.testUrl) {
    return config.connectivity.testUrl;
  }

  try {
    return new URL(config.url).origin;
  } catch (error) {
    return 'https://example.com';
  }
}

function probeConnectivity(probeUrl) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    const request = net.request({
      method: 'HEAD',
      url: probeUrl,
    });

    const done = (result) => {
      if (!settled) {
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(result);
      }
    };

    request.on('response', (response) => {
      done(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on('error', () => {
      done(false);
    });

    request.setHeader('Cache-Control', 'no-cache');
    timeoutId = setTimeout(() => {
      try {
        request.abort();
      } catch (error) {
        // Ignoramos error de abortado y reportamos sin conexion.
      }
      done(false);
    }, 5000);

    request.end();
  });
}

async function showConnectivityDialog(mainWindow, options) {
  if (connectivityDialogOpen || mainWindow.isDestroyed()) {
    return;
  }

  connectivityDialogOpen = true;
  try {
    await dialog.showMessageBox(mainWindow, options);
  } finally {
    connectivityDialogOpen = false;
  }
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function getOfflineMessage(config) {
  return (
    config?.connectivity?.banner?.offlineMessage ||
    'No se detecto conexion. La aplicacion seguira intentando reconectar automaticamente.'
  );
}

function isOfflinePageLoaded(currentUrl) {
  if (!currentUrl) {
    return false;
  }

  return currentUrl.includes('/offline.html') || currentUrl.includes('\\offline.html');
}

async function loadOfflinePage(mainWindow, config) {
  await mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
    query: {
      message: getOfflineMessage(config),
    },
  });
}

function getConnectivityBannerStyle(config, level) {
  const bannerConfig = config?.connectivity?.banner || {};
  return {
    message:
      level === 'ok'
        ? bannerConfig.restoredMessage || 'Conexion restaurada.'
        : bannerConfig.offlineMessage || 'Sin conexion a internet. Reintentando automaticamente...',
    backgroundColor:
      level === 'ok'
        ? bannerConfig.restoredBackgroundColor || '#0f766e'
        : bannerConfig.offlineBackgroundColor || '#b45309',
    textColor: bannerConfig.textColor || '#ffffff',
    fontFamily: bannerConfig.fontFamily || 'sans-serif',
    fontSizePx: Number(bannerConfig.fontSizePx) || 13,
    hideAfterMs: Math.max(500, Number(bannerConfig.hideAfterMs) || 2500),
  };
}

async function showConnectivityBanner(mainWindow, config, level = 'warning') {
  if (mainWindow.isDestroyed()) {
    return;
  }

  const style = getConnectivityBannerStyle(config, level);
  const script = `
    (() => {
      const id = ${jsString(CONNECTIVITY_BANNER_ID)};
      let banner = document.getElementById(id);
      if (!banner) {
        banner = document.createElement('div');
        banner.id = id;
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.zIndex = '2147483647';
        banner.style.padding = '8px 12px';
        banner.style.fontFamily = ${jsString(style.fontFamily)};
        banner.style.fontSize = ${jsString(`${style.fontSizePx}px`)};
        banner.style.fontWeight = '600';
        banner.style.color = ${jsString(style.textColor)};
        banner.style.textAlign = 'center';
        banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        document.documentElement.appendChild(banner);
      }
      banner.style.background = ${jsString(style.backgroundColor)};
      banner.textContent = ${jsString(style.message)};
    })();
  `;

  try {
    await mainWindow.webContents.executeJavaScript(script);
  } catch (error) {
    // Si la pagina no permite inyeccion temporalmente, solo registramos en consola.
    console.warn('No se pudo mostrar banner de conectividad:', error?.message || error);
  }
}

async function showConnectivityRestoreNotification(mainWindow, config) {
  if (mainWindow.isDestroyed()) {
    return;
  }

  const style = getConnectivityBannerStyle(config, 'ok');
  const script = `
    (() => {
      const message = ${jsString(style.message)};
      const hideAfterMs = ${jsString(String(style.hideAfterMs))};

      // Si la pagina tiene AWN disponible, la usamos para una notificacion mas visible.
      if (window.AWN) {
        try {
          if (!window.__heryRestoreNotifier) {
            window.__heryRestoreNotifier = new window.AWN({
              position: 'top-right',
              maxNotifications: 1,
              labels: {
                success: 'Conexion restaurada',
              },
            });
          }
          window.__heryRestoreNotifier.success(message);
          return;
        } catch (error) {
          // Si AWN falla, seguimos con fallback toast.
        }
      }

      const id = '__hery_restore_toast__';
      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }

      const toast = document.createElement('div');
      toast.id = id;
      toast.textContent = message;
      toast.style.position = 'fixed';
      toast.style.top = '16px';
      toast.style.right = '16px';
      toast.style.zIndex = '2147483647';
      toast.style.padding = '10px 14px';
      toast.style.borderRadius = '10px';
      toast.style.fontFamily = ${jsString(style.fontFamily)};
      toast.style.fontSize = ${jsString(`${style.fontSizePx}px`)};
      toast.style.fontWeight = '600';
      toast.style.color = ${jsString(style.textColor)};
      toast.style.background = ${jsString(style.backgroundColor)};
      toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
      toast.style.maxWidth = '70vw';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'opacity 180ms ease, transform 180ms ease';

      document.documentElement.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 220);
      }, Number(hideAfterMs));
    })();
  `;

  try {
    await mainWindow.webContents.executeJavaScript(script);
  } catch (error) {
    console.warn('No se pudo mostrar notificacion de reconexion:', error?.message || error);
  }
}

async function hideConnectivityBanner(mainWindow) {
  if (mainWindow.isDestroyed()) {
    return;
  }

  const script = `
    (() => {
      const banner = document.getElementById(${jsString(CONNECTIVITY_BANNER_ID)});
      if (banner) {
        banner.remove();
      }
    })();
  `;

  try {
    await mainWindow.webContents.executeJavaScript(script);
  } catch (error) {
    console.warn('No se pudo ocultar banner de conectividad:', error?.message || error);
  }
}

async function loadWebAppWithConnectivityCheck(mainWindow, config) {
  const connectivityEnabled = Boolean(config?.connectivity?.enabled);
  if (!connectivityEnabled) {
    mainWindow.loadURL(config.url);
    return;
  }

  const probeUrl = getConnectivityProbeUrl(config);
  const online = await probeConnectivity(probeUrl);
  connectivityLastStatus = online;

  if (online) {
    mainWindow.loadURL(config.url);
    return;
  }

  await showConnectivityDialog(mainWindow, {
    type: 'warning',
    title: 'Sin conexion a internet',
    message: 'No se detecto conexion a internet al iniciar la app.',
    detail: 'La aplicacion seguira revisando la conexion automaticamente.',
  });

  await loadOfflinePage(mainWindow, config);
  await showConnectivityBanner(mainWindow, config, 'warning');
}

function startConnectivityMonitoring(mainWindow, config) {
  stopConnectivityMonitoring();

  if (!Boolean(config?.connectivity?.enabled)) {
    return;
  }

  const probeUrl = getConnectivityProbeUrl(config);
  const intervalMs = Math.max(10000, Number(config?.connectivity?.checkIntervalMs) || 30000);

  const runCheck = async () => {
    if (mainWindow.isDestroyed()) {
      stopConnectivityMonitoring();
      return;
    }

    const online = await probeConnectivity(probeUrl);

    if (connectivityLastStatus === null) {
      connectivityLastStatus = online;
      return;
    }

    if (!online && connectivityLastStatus) {
      connectivityLastStatus = false;
      await loadOfflinePage(mainWindow, config);
      await showConnectivityBanner(mainWindow, config, 'warning');
      return;
    }

    if (online && !connectivityLastStatus) {
      connectivityLastStatus = true;

      const currentUrl = mainWindow.webContents.getURL();
      const wasOfflinePage = isOfflinePageLoaded(currentUrl);

      if (wasOfflinePage) {
        await mainWindow.loadURL(config.url);
      }

      if (Boolean(config?.connectivity?.notifyOnRestore)) {
        const bannerStyle = getConnectivityBannerStyle(config, 'ok');
        await showConnectivityBanner(mainWindow, config, 'ok');
        await showConnectivityRestoreNotification(mainWindow, config);
        setTimeout(() => {
          hideConnectivityBanner(mainWindow).catch(() => {});
        }, bannerStyle.hideAfterMs);
      } else {
        await hideConnectivityBanner(mainWindow);
      }
    }
  };

  connectivityTimer = setInterval(() => {
    runCheck().catch((error) => {
      console.error('Error al verificar conectividad:', error?.message || error);
    });
  }, intervalMs);
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

async function createWindow(config) {
  const runtimePrefs = loadRuntimePrefs();
  const fixedWindowTitle = config.name || config.windowTitle || 'WebApp';
  const shouldStartFullscreen = Boolean(config.fullscreen) || Boolean(runtimePrefs?.startInFullscreen);
  const shouldStartMaximized = !shouldStartFullscreen && Boolean(runtimePrefs?.startMaximized);
  const runtimeIconPath = resolveRuntimeIconPath(config);

  const win = new BrowserWindow({
    title: fixedWindowTitle,
    width: config.width || 1280,
    height: config.height || 800,
    fullscreen: shouldStartFullscreen,
    kiosk: Boolean(config.kiosk),
    autoHideMenuBar: Boolean(config.kiosk),
    ...(runtimeIconPath && process.platform !== 'darwin' ? { icon: runtimeIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  if (shouldStartMaximized) {
    win.maximize();
  }

  if (config.userAgent) {
    win.webContents.setUserAgent(config.userAgent);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Evita que el title de la pagina web cambie el titulo nativo de la ventana.
  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(fixedWindowTitle);
  });

  buildAppMenu(win, config, runtimePrefs);
  await loadWelcomePage(win, config);

  if (win.isDestroyed()) {
    return;
  }

  await loadWebAppWithConnectivityCheck(win, config);
  win.setTitle(fixedWindowTitle);
  startConnectivityMonitoring(win, config);
}

const startupConfig = readConfigFromEnv();

applyAppIdentity(startupConfig);

configureGraphics(startupConfig);
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

app.whenReady().then(() => {
  const config = parseConfig();
  applyAppIdentity(config);
  applyDockIconIfNeeded(resolveRuntimeIconPath(config));
  createWindow(config).catch((error) => {
    console.error('No se pudo crear la ventana principal:', error?.message || error);
  });
  setupAutoUpdater(config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config).catch((error) => {
        console.error('No se pudo recrear la ventana principal:', error?.message || error);
      });
    }
  });
});

app.on('window-all-closed', () => {
  stopConnectivityMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
