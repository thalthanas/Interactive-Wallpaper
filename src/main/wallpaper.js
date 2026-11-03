import * as win32 from './wallpaper-win32.js';

class WallpaperManager {
  constructor() {
    this.platform = process.platform;
    this.isAttached = false;
  }

  async attach(window, bounds) {
    if (this.platform === 'win32') {
      const hwndBuf = window.getNativeWindowHandle();
      const success = await win32.attachToWallpaper(hwndBuf, bounds);
      this.isAttached = success;
      return success;
    } else if (this.platform === 'darwin') {
      window.setHiddenInMissionControl(true);
      window.setVisibleOnAllWorkspaces(true);
      window.setType('desktop');
      this.isAttached = true;
      return true;
    } else if (this.platform === 'linux') {
      window.setType('desktop');
      this.isAttached = true;
      return true;
    }
    return false;
  }

  detach(window, bounds) {
    if (this.platform === 'win32') {
      const hwndBuf = window.getNativeWindowHandle();
      win32.detachFromWallpaper(hwndBuf, bounds);
      this.isAttached = false;
      return true;
    } else if (this.platform === 'darwin' || this.platform === 'linux') {
      window.setType('normal');
      this.isAttached = false;
      return true;
    }
    return false;
  }

  startMouseTracking(webContents, getBounds) {
    if (this.platform === 'win32') {
      win32.startMouseTracking(webContents, getBounds);
    }
  }

  stopMouseTracking() {
    if (this.platform === 'win32') {
      win32.stopMouseTracking();
    }
  }
}

export const wallpaper = new WallpaperManager();
