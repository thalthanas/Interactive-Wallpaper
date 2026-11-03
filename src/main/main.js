import { app, BrowserWindow, screen, ipcMain, session } from 'electron';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { wallpaper } from './wallpaper.js';
import { setupTray } from './tray.js';
import { loadSettings, saveSettings } from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set application name for consistent Windows registry and shortcut handling
app.setName('Interactive Wallpaper');

// Disable hardware acceleration so Chromium renders cleanly into GDI WorkerW wallpaper layer
app.disableHardwareAcceleration();

// Allow audio playback without requiring prior user gestures
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Load persistent settings
const saved = loadSettings();

// Application state
let mainWindow = null;
let trayController = null;
let currentMode = saved.currentMode || 'wallpaper'; // 'wallpaper' | 'windowed'
let currentScale = saved.currentScale || 6;          // 6x default (320x180 on 1080p)
let isPaused = false;

// Scene & feature settings
let density = saved.density ?? 1.0;
let pileSpeed = saved.pileSpeed ?? 1.0;
let maxHeight = saved.maxHeight ?? 0.25;
let wind = saved.wind ?? 4;
let santaEnabled = saved.santaEnabled ?? true;
let santaFreq = saved.santaFreq ?? 60;
let musicPlaying = false; // Always starts stopped/paused initially per requirements
let musicVolume = saved.musicVolume ?? 75;
let villageEnabled = saved.villageEnabled ?? false;
let snowScale = saved.snowScale ?? 6;

function persistCurrentSettings() {
  saveSettings({
    currentMode,
    currentScale,
    snowScale,
    density,
    pileSpeed,
    maxHeight,
    wind,
    santaEnabled,
    santaFreq,
    villageEnabled,
    musicVolume,
  });
}

function isAutoStartEnabled() {
  try {
    const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Interactive Wallpaper"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    if (out && out.includes('Interactive Wallpaper')) return true;
  } catch {}
  try {
    if (app.getLoginItemSettings().openAtLogin) return true;
  } catch {}
  return false;
}

function setAutoStart(enable) {
  const exePath = process.execPath;
  if (enable) {
    try {
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Interactive Wallpaper" /t REG_SZ /d "\\"${exePath}\\"" /f`, {
        stdio: 'ignore',
      });
    } catch {}
    try {
      app.setLoginItemSettings({ openAtLogin: true, path: exePath });
    } catch {}
  } else {
    try {
      execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Interactive Wallpaper" /f', {
        stdio: 'ignore',
      });
    } catch {}
    try {
      app.setLoginItemSettings({ openAtLogin: false, path: exePath });
    } catch {}
  }
}

// Local HTTP Server to serve renderer over standard http origin (required for YouTube embedded audio)
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

let localServer = null;
let localPort = 0;

function startLocalServer() {
  return new Promise((resolve) => {
    localServer = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/renderer/index.html';
      else if (!reqPath.startsWith('/renderer') && !reqPath.startsWith('/pixelfx')) {
        reqPath = '/renderer' + reqPath;
      }
      const filePath = path.join(__dirname, '..', reqPath);
      fs.readFile(filePath, (err, data) => {
        if (err || !data) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    });

    localServer.listen(0, '127.0.0.1', () => {
      localPort = localServer.address().port;
      resolve(localPort);
    });
  });
}

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
    return { bottom, top, left, right };
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
  await startLocalServer();

  // Grant audio and media permissions unconditionally
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

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
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);

  mainWindow.webContents.on('console-message', (event) => {
    console.log('[Renderer]', event.message || event);
  });

  mainWindow.once('ready-to-show', () => {
    if (currentMode === 'wallpaper') {
      applyWallpaperMode();
    } else {
      mainWindow.show();
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
    villageEnabled,
    snowScale,
    autoStart: isAutoStartEnabled(),
    onToggleMode: (mode) => setMode(mode),
    onSetScale: (scale) => setScale(scale),
    onSettingChange: (key, val) => handleSettingChange(key, val),
    onTogglePause: () => togglePause(),
    onResetSnow: () => mainWindow.webContents.send('reset-snow'),
    onToggleHud: () => mainWindow.webContents.send('toggle-hud'),
    onToggleAutoStart: () => {
      const current = isAutoStartEnabled();
      setAutoStart(!current);
      updateTray();
    },
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

let wallpaperRetryTimer = null;
let wallpaperAttachAttempts = 0;
const MAX_ATTACH_ATTEMPTS = 30; // 30 attempts * 1.5s = 45s maximum window during cold boot

async function attemptAttachToWallpaper() {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'wallpaper') {
    if (wallpaperRetryTimer) {
      clearInterval(wallpaperRetryTimer);
      wallpaperRetryTimer = null;
    }
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  mainWindow.setBounds(primaryDisplay.bounds);

  const attached = await wallpaper.attach(mainWindow, primaryDisplay.bounds);
  if (attached) {
    console.log('[LiveWP] Live wallpaper attached behind desktop icons successfully!');
    if (wallpaperRetryTimer) {
      clearInterval(wallpaperRetryTimer);
      wallpaperRetryTimer = null;
    }
    wallpaperAttachAttempts = 0;

    wallpaper.startMouseTracking(mainWindow.webContents, () => primaryDisplay.bounds);
    mainWindow.show();
    mainWindow.webContents.send('set-mode', 'wallpaper');
    sendTaskbarInsets();
  } else {
    wallpaperAttachAttempts++;
    console.log(`[LiveWP] Waiting for Windows Explorer/WorkerW to initialize (attempt ${wallpaperAttachAttempts}/${MAX_ATTACH_ATTEMPTS})...`);
    if (!wallpaperRetryTimer) {
      wallpaperRetryTimer = setInterval(attemptAttachToWallpaper, 1500);
    }
    if (wallpaperAttachAttempts >= MAX_ATTACH_ATTEMPTS) {
      clearInterval(wallpaperRetryTimer);
      wallpaperRetryTimer = null;
      console.warn('[LiveWP] Maximum attach attempts reached, keeping fallback overlay mode.');
      mainWindow.show();
      mainWindow.webContents.send('set-mode', 'wallpaper');
      sendTaskbarInsets();
    }
  }
}

async function applyWallpaperMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  mainWindow.setBounds(primaryDisplay.bounds);
  mainWindow.setSkipTaskbar(true);

  if (wallpaperRetryTimer) {
    clearInterval(wallpaperRetryTimer);
    wallpaperRetryTimer = null;
  }
  wallpaperAttachAttempts = 0;

  await attemptAttachToWallpaper();
}

function applyWindowedMode() {
  if (!mainWindow) return;
  if (wallpaperRetryTimer) {
    clearInterval(wallpaperRetryTimer);
    wallpaperRetryTimer = null;
  }

  wallpaper.stopMouseTracking();
  wallpaper.detach(mainWindow, { x: 100, y: 100, width: 1280, height: 720 });

  mainWindow.setSkipTaskbar(false);
  mainWindow.setBounds({ x: 100, y: 100, width: 1280, height: 720 });
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('set-mode', 'windowed');
  sendTaskbarInsets();
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  persistCurrentSettings();
  if (mode === 'wallpaper') {
    applyWallpaperMode();
  } else {
    applyWindowedMode();
  }
  updateTray();
}

function setScale(scale) {
  currentScale = scale;
  persistCurrentSettings();
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
  else if (key === 'villageEnabled') villageEnabled = val;
  else if (key === 'snowScale') snowScale = val;
  else if (key === 'musicCommand') {
    if (val === 'play') musicPlaying = true;
    else if (val === 'pause') musicPlaying = false;
    else if (typeof val === 'number') musicVolume = val;
  }

  persistCurrentSettings();

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
      villageEnabled,
      snowScale,
      autoStart: isAutoStartEnabled(),
    });
  }
}

function cleanup() {
  if (wallpaperRetryTimer) {
    clearInterval(wallpaperRetryTimer);
    wallpaperRetryTimer = null;
  }
  if (localServer) {
    try { localServer.close(); } catch {}
  }
  wallpaper.stopMouseTracking();
  if (mainWindow && !mainWindow.isDestroyed()) {
    wallpaper.detach(mainWindow, { x: 0, y: 0, width: 100, height: 100 });
  }
}

// Health check: periodically ensure wallpaper remains attached (re-attaches if Windows Explorer restarts)
setInterval(() => {
  if (currentMode === 'wallpaper' && mainWindow && !mainWindow.isDestroyed()) {
    if (!wallpaper.checkAttached(mainWindow)) {
      console.log('[LiveWP] Wallpaper detached, reattaching to WorkerW...');
      attemptAttachToWallpaper();
    }
  }
}, 5000);

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
    villageEnabled,
    snowScale,
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
  else if (data.key === 'villageEnabled') villageEnabled = data.value;
  else if (data.key === 'snowScale') snowScale = data.value;
  else if (data.key === 'musicPlaying') musicPlaying = data.value;
  persistCurrentSettings();
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
