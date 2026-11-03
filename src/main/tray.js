import electron from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const { Tray, Menu, nativeImage } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;

export function setupTray({
  currentMode,
  currentScale,
  isPaused,
  density = 1.0,
  pileSpeed = 1.0,
  maxHeight = 0.25,
  wind = 4,
  santaEnabled = true,
  santaFreq = 60,
  musicPlaying = false,
  musicVolume = 75,
  onToggleMode,
  onSetScale,
  onSettingChange,
  onTogglePause,
  onResetSnow,
  onToggleHud,
  onQuit,
}) {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('LiveWP - Pixel Snow Live Wallpaper');

  function updateMenu(state = {}) {
    const mode = state.currentMode ?? currentMode;
    const scale = state.currentScale ?? currentScale;
    const paused = state.isPaused ?? isPaused;
    const d = state.density ?? density;
    const ps = state.pileSpeed ?? pileSpeed;
    const mh = state.maxHeight ?? maxHeight;
    const w = state.wind ?? wind;
    const santa = state.santaEnabled ?? santaEnabled;
    const freq = state.santaFreq ?? santaFreq;
    const music = state.musicPlaying ?? musicPlaying;
    const vol = state.musicVolume ?? musicVolume;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'LiveWP (Pixel Snow)',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Desktop Wallpaper Mode',
        type: 'radio',
        checked: mode === 'wallpaper',
        click: () => onToggleMode('wallpaper'),
      },
      {
        label: 'Windowed Preview Mode',
        type: 'radio',
        checked: mode === 'windowed',
        click: () => onToggleMode('windowed'),
      },
      { type: 'separator' },
      {
        label: 'Pixel Art Scale',
        submenu: [
          {
            label: '8x (Chunky 240×135)',
            type: 'radio',
            checked: scale === 8,
            click: () => onSetScale(8),
          },
          {
            label: '6x (Classic 320×180 - Retro Chunky)',
            type: 'radio',
            checked: scale === 6,
            click: () => onSetScale(6),
          },
          {
            label: '4x (480×270 - Balanced Pixel Art)',
            type: 'radio',
            checked: scale === 4,
            click: () => onSetScale(4),
          },
          {
            label: '2x (960×540 - High Density)',
            type: 'radio',
            checked: scale === 2,
            click: () => onSetScale(2),
          },
          {
            label: '1x (1920×1080 - Native Resolution)',
            type: 'radio',
            checked: scale === 1,
            click: () => onSetScale(1),
          },
        ],
      },
      {
        label: 'Snow Scene Settings',
        submenu: [
          {
            label: 'Snowfall Density',
            submenu: [
              {
                label: 'Light (0.5x)',
                type: 'radio',
                checked: Math.abs(d - 0.5) < 0.2,
                click: () => onSettingChange('density', 0.5),
              },
              {
                label: 'Medium (1.0x)',
                type: 'radio',
                checked: Math.abs(d - 1.0) < 0.2,
                click: () => onSettingChange('density', 1.0),
              },
              {
                label: 'Heavy (1.8x)',
                type: 'radio',
                checked: Math.abs(d - 1.8) < 0.2,
                click: () => onSettingChange('density', 1.8),
              },
              {
                label: 'Blizzard (2.8x)',
                type: 'radio',
                checked: Math.abs(d - 2.8) < 0.2,
                click: () => onSettingChange('density', 2.8),
              },
            ],
          },
          {
            label: 'Drift Piling Speed',
            submenu: [
              {
                label: 'Off (0x)',
                type: 'radio',
                checked: ps === 0,
                click: () => onSettingChange('pileSpeed', 0),
              },
              {
                label: 'Slow (0.5x)',
                type: 'radio',
                checked: Math.abs(ps - 0.5) < 0.2,
                click: () => onSettingChange('pileSpeed', 0.5),
              },
              {
                label: 'Normal (1.0x)',
                type: 'radio',
                checked: Math.abs(ps - 1.0) < 0.2,
                click: () => onSettingChange('pileSpeed', 1.0),
              },
              {
                label: 'Fast (2.0x)',
                type: 'radio',
                checked: Math.abs(ps - 2.0) < 0.2,
                click: () => onSettingChange('pileSpeed', 2.0),
              },
              {
                label: 'Blizzard Accumulation (3.5x)',
                type: 'radio',
                checked: Math.abs(ps - 3.5) < 0.2,
                click: () => onSettingChange('pileSpeed', 3.5),
              },
            ],
          },
          {
            label: 'Max Pile Height',
            submenu: [
              {
                label: 'Low (15% Screen)',
                type: 'radio',
                checked: Math.abs(mh - 0.15) < 0.04,
                click: () => onSettingChange('maxHeight', 0.15),
              },
              {
                label: 'Medium (25% Screen)',
                type: 'radio',
                checked: Math.abs(mh - 0.25) < 0.04,
                click: () => onSettingChange('maxHeight', 0.25),
              },
              {
                label: 'High (35% Screen)',
                type: 'radio',
                checked: Math.abs(mh - 0.35) < 0.04,
                click: () => onSettingChange('maxHeight', 0.35),
              },
              {
                label: 'Deep Snow (50% Screen)',
                type: 'radio',
                checked: Math.abs(mh - 0.5) < 0.04,
                click: () => onSettingChange('maxHeight', 0.5),
              },
            ],
          },
          {
            label: 'Wind Speed',
            submenu: [
              {
                label: 'Calm (0)',
                type: 'radio',
                checked: w === 0,
                click: () => onSettingChange('wind', 0),
              },
              {
                label: 'Gentle Breeze (4)',
                type: 'radio',
                checked: Math.abs(w - 4) < 2,
                click: () => onSettingChange('wind', 4),
              },
              {
                label: 'Brisk Wind (8)',
                type: 'radio',
                checked: Math.abs(w - 8) < 2,
                click: () => onSettingChange('wind', 8),
              },
              {
                label: 'Gale (14)',
                type: 'radio',
                checked: Math.abs(w - 14) < 2,
                click: () => onSettingChange('wind', 14),
              },
            ],
          },
          { type: 'separator' },
          {
            label: 'Clear / Reset Snow Drift',
            click: () => onResetSnow(),
          },
        ],
      },
      {
        label: "Santa's Sleigh",
        submenu: [
          {
            label: 'Enable Flying Santa',
            type: 'checkbox',
            checked: santa,
            click: () => onSettingChange('santaEnabled', !santa),
          },
          {
            label: 'Sleigh Frequency',
            submenu: [
              {
                label: 'Every 30 seconds',
                type: 'radio',
                checked: freq === 30,
                click: () => onSettingChange('santaFreq', 30),
              },
              {
                label: 'Every 1 minute',
                type: 'radio',
                checked: freq === 60,
                click: () => onSettingChange('santaFreq', 60),
              },
              {
                label: 'Every 2 minutes',
                type: 'radio',
                checked: freq === 120,
                click: () => onSettingChange('santaFreq', 120),
              },
              {
                label: 'Every 3 minutes',
                type: 'radio',
                checked: freq === 180,
                click: () => onSettingChange('santaFreq', 180),
              },
            ],
          },
          {
            label: 'Fly Santa Now!',
            click: () => onSettingChange('flySantaNow', true),
          },
        ],
      },
      {
        label: 'Christmas Music',
        submenu: [
          {
            label: music ? '⏸ Pause Music' : '▶ Play Music',
            click: () => onSettingChange('musicCommand', music ? 'pause' : 'play'),
          },
          {
            label: '⏭ Next Track',
            click: () => onSettingChange('musicCommand', 'next'),
          },
          {
            label: '⏮ Previous Track',
            click: () => onSettingChange('musicCommand', 'prev'),
          },
          {
            label: 'Volume',
            submenu: [
              {
                label: '25%',
                type: 'radio',
                checked: vol === 25,
                click: () => onSettingChange('musicCommand', 25),
              },
              {
                label: '50%',
                type: 'radio',
                checked: vol === 50,
                click: () => onSettingChange('musicCommand', 50),
              },
              {
                label: '75%',
                type: 'radio',
                checked: vol === 75,
                click: () => onSettingChange('musicCommand', 75),
              },
              {
                label: '100%',
                type: 'radio',
                checked: vol === 100,
                click: () => onSettingChange('musicCommand', 100),
              },
              {
                label: 'Mute',
                type: 'radio',
                checked: vol === 0,
                click: () => onSettingChange('musicCommand', 0),
              },
            ],
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Toggle Controls Overlay (Press H)',
        click: () => onToggleHud(),
      },
      {
        label: paused ? 'Resume Animation' : 'Pause Animation',
        click: () => onTogglePause(),
      },
      { type: 'separator' },
      {
        label: 'Quit LiveWP',
        click: () => onQuit(),
      },
    ]);

    tray.setContextMenu(contextMenu);
  }

  updateMenu({
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

  tray.on('double-click', () => {
    onToggleHud();
  });

  return {
    tray,
    updateMenu,
  };
}
