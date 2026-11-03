import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;

export function setupTray({
  currentMode,
  currentScale,
  isPaused,
  onToggleMode,
  onSetScale,
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
            label: '6x (Classic 320x180 - Retro Chunky)',
            type: 'radio',
            checked: scale === 6,
            click: () => onSetScale(6),
          },
          {
            label: '4x (480x270 - Balanced Pixel Art)',
            type: 'radio',
            checked: scale === 4,
            click: () => onSetScale(4),
          },
          {
            label: '3x (640x360 - Crisp Medium)',
            type: 'radio',
            checked: scale === 3,
            click: () => onSetScale(3),
          },
          {
            label: '2x (960x540 - High Density)',
            type: 'radio',
            checked: scale === 2,
            click: () => onSetScale(2),
          },
          {
            label: '1x (1920x1080 - Native Resolution)',
            type: 'radio',
            checked: scale === 1,
            click: () => onSetScale(1),
          },
        ],
      },
      {
        label: 'Toggle Controls Overlay (Press H)',
        click: () => onToggleHud(),
      },
      {
        label: 'Clear / Reset Snow Drift',
        click: () => onResetSnow(),
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

  updateMenu({ currentMode, currentScale, isPaused });

  tray.on('double-click', () => {
    onToggleHud();
  });

  return {
    tray,
    updateMenu,
  };
}

