import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { wallpaper } from './wallpaper.js';
import { setupTray } from './tray.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Application state
let mainWindow = null;
let trayController = null;
let currentMode = 'wallpaper'; // 'wallpaper' | 'windowed'
let currentScale = 6;          // 6x default (320x180 on 1080p)
let isPaused = false;

// Disable hardware acceleration so Chromium renders cleanly into GDI WorkerW wallpaper layer
app.disableHardwareAcceleration();

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: currentMode === 'wallpaper',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.on('console-message', (event) => {
    console.log('[Renderer]', event.message || event);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (currentMode === 'wallpaper') {
      applyWallpaperMode();
    }
  });

  // Setup System Tray
  trayController = setupTray({
    currentMode,
    currentScale,
    isPaused,
    onToggleMode: (mode) => setMode(mode),
    onSetScale: (scale) => setScale(scale),
    onTogglePause: () => togglePause(),
    onResetSnow: () => mainWindow.webContents.send('reset-snow'),
    onToggleHud: () => mainWindow.webContents.send('toggle-hud'),
    onQuit: () => {
      cleanup();
      app.quit();
    },
  });
}

async function applyWallpaperMode() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  mainWindow.setBounds(primaryDisplay.bounds);
  mainWindow.setSkipTaskbar(true);

  const attached = await wallpaper.attach(mainWindow, primaryDisplay.bounds);
  if (attached) {
    console.log('[LiveWP] Live wallpaper attached behind desktop icons');
  } else {
    console.log('[LiveWP] Running in desktop windowed fallback mode');
  }

  wallpaper.startMouseTracking(mainWindow.webContents, () => primaryDisplay.bounds);
  mainWindow.webContents.send('set-mode', 'wallpaper');
}

function applyWindowedMode() {
  if (!mainWindow) return;
  wallpaper.stopMouseTracking();
  wallpaper.detach(mainWindow, { x: 100, y: 100, width: 1280, height: 720 });

  mainWindow.setSkipTaskbar(false);
  mainWindow.setBounds({ x: 100, y: 100, width: 1280, height: 720 });
  mainWindow.center();
  mainWindow.focus();
  mainWindow.webContents.send('set-mode', 'windowed');
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  if (mode === 'wallpaper') {
    applyWallpaperMode();
  } else {
    applyWindowedMode();
  }
  if (trayController) {
    trayController.updateMenu({ currentMode, currentScale, isPaused });
  }
}

function setScale(scale) {
  currentScale = scale;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-scale', scale);
  }
  if (trayController) {
    trayController.updateMenu({ currentMode, currentScale, isPaused });
  }
}

function togglePause() {
  isPaused = !isPaused;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toggle-pause', isPaused);
  }
  if (trayController) {
    trayController.updateMenu({ currentMode, currentScale, isPaused });
  }
}

function cleanup() {
  wallpaper.stopMouseTracking();
  if (mainWindow && !mainWindow.isDestroyed()) {
    wallpaper.detach(mainWindow, { x: 0, y: 0, width: 100, height: 100 });
  }
}

// IPC Handlers
ipcMain.handle('get-initial-state', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    mode: currentMode,
    scale: currentScale,
    isPaused,
    displayBounds: primaryDisplay.bounds,
  };
});

ipcMain.handle('request-mode', (_event, mode) => {
  setMode(mode);
  return currentMode;
});

ipcMain.handle('request-scale', (_event, scale) => {
  setScale(scale);
  return currentScale;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', cleanup);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});

