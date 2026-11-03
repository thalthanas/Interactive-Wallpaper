import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { wallpaper } from './wallpaper.js';
import { setupTray } from './tray.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable hardware acceleration so Chromium renders cleanly into GDI WorkerW wallpaper layer
app.disableHardwareAcceleration();

// Application state
let mainWindow = null;
let trayController = null;
let currentMode = 'wallpaper'; // 'wallpaper' | 'windowed'
let currentScale = 6;          // 6x default (320x180 on 1080p)
let isPaused = false;

// Scene & feature settings
let density = 1.0;
let pileSpeed = 1.0;
let maxHeight = 0.25;
let wind = 4;
let santaEnabled = true;
let santaFreq = 60;
let musicPlaying = false;
let musicVolume = 75;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

/**
 * Calculates current taskbar insets (bottom, top, left, right margins)
 */
function getTaskbarInsets() {
  try {
    const display = screen.getPrimaryDisplay();
    const bounds = display.bounds;
    const workArea = display.workArea;

    const bottom = Math.max(0, bounds.height - (workArea.y - bounds.y + workArea.height));
    const top = Math.max(0, workArea.y - bounds.y);
    const left = Math.max(0, workArea.x - bounds.x);
    const right = Math.max(0, bounds.width - (workArea.x - bounds.x + workArea.width));

    // If taskbar is auto-hidden, Windows keeps <= 4px for peek trigger. Treat as 0.
    return {
      bottom: bottom > 4 ? bottom : 0,
      top: top > 4 ? top : 0,
      left: left > 4 ? left : 0,
      right: right > 4 ? right : 0,
      bounds,
      workArea,
    };
  } catch {
    return { bottom: 0, top: 0, left: 0, right: 0 };
  }
}

function sendTaskbarInsets() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const insets = currentMode === 'wallpaper' ? getTaskbarInsets() : { bottom: 0, top: 0, left: 0, right: 0 };
    mainWindow.webContents.send('taskbar-insets', insets);
  }
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
    sendTaskbarInsets();
  });

  // Setup System Tray
  trayController = setupTray({
    currentMode,
    currentScale,
    isPaused,
    density,
    pileSpeed,
    maxHeight,
    wind,
    santaEnabled,
    santaFreq,
    musicPlaying,
    musicVolume,
    onToggleMode: (mode) => setMode(mode),
    onSetScale: (scale) => setScale(scale),
    onSettingChange: (key, val) => handleSettingChange(key, val),
    onTogglePause: () => togglePause(),
    onResetSnow: () => mainWindow.webContents.send('reset-snow'),
    onToggleHud: () => mainWindow.webContents.send('toggle-hud'),
    onQuit: () => {
      cleanup();
      app.quit();
    },
  });

  // Monitor display resolution & taskbar metric changes
  screen.on('display-metrics-changed', () => {
    sendTaskbarInsets();
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
  sendTaskbarInsets();
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
  sendTaskbarInsets();
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  if (mode === 'wallpaper') {
    applyWallpaperMode();
  } else {
    applyWindowedMode();
  }
  updateTray();
}

function setScale(scale) {
  currentScale = scale;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-scale', scale);
  }
  updateTray();
}

function handleSettingChange(key, val) {
  if (key === 'density') density = val;
  else if (key === 'pileSpeed') pileSpeed = val;
  else if (key === 'maxHeight') maxHeight = val;
  else if (key === 'wind') wind = val;
  else if (key === 'santaEnabled') santaEnabled = val;
  else if (key === 'santaFreq') santaFreq = val;
  else if (key === 'musicCommand') {
    if (val === 'play') musicPlaying = true;
    else if (val === 'pause') musicPlaying = false;
    else if (typeof val === 'number') musicVolume = val;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key, value: val });
  }
  updateTray();
}

function togglePause() {
  isPaused = !isPaused;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toggle-pause', isPaused);
  }
  updateTray();
}

function updateTray() {
  if (trayController) {
    trayController.updateMenu({
      currentMode,
      currentScale,
      isPaused,
      density,
      pileSpeed,
      maxHeight,
      wind,
      santaEnabled,
      santaFreq,
      musicPlaying,
      musicVolume,
    });
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
  const insets = currentMode === 'wallpaper' ? getTaskbarInsets() : { bottom: 0, top: 0, left: 0, right: 0 };
  return {
    mode: currentMode,
    scale: currentScale,
    isPaused,
    density,
    pileSpeed,
    maxHeight,
    wind,
    santaEnabled,
    santaFreq,
    musicPlaying,
    musicVolume,
    insets,
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

ipcMain.handle('notify-setting', (_event, data) => {
  if (!data) return;
  if (data.key === 'density') density = data.value;
  else if (data.key === 'pileSpeed') pileSpeed = data.value;
  else if (data.key === 'maxHeight') maxHeight = data.value;
  else if (data.key === 'wind') wind = data.value;
  else if (data.key === 'santaEnabled') santaEnabled = data.value;
  else if (data.key === 'santaFreq') santaFreq = data.value;
  else if (data.key === 'musicPlaying') musicPlaying = data.value;
  updateTray();
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
