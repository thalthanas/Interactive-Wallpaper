import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const DEFAULT_SETTINGS = {
  currentMode: 'wallpaper',
  currentScale: 6,
  snowScale: 6,
  density: 1.0,
  pileSpeed: 1.0,
  maxHeight: 0.25,
  wind: 4,
  santaEnabled: true,
  santaFreq: 60,
  villageEnabled: false,
  musicVolume: 75,
};

function getSettingsPath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'settings.json');
}

export function loadSettings() {
  try {
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (err) {
    console.warn('[Settings] Error loading settings:', err.message);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try {
    const file = getSettingsPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Never persist musicPlaying: music always starts paused on launch
    const toSave = { ...settings };
    delete toSave.musicPlaying;
    fs.writeFileSync(file, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Settings] Error saving settings:', err.message);
  }
}

