const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('livewp', {
  // Desktop mouse listener (forwarded from global tracker)
  onDesktopMouse: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-mouse', handler);
    return () => ipcRenderer.removeListener('desktop-mouse', handler);
  },

  // State sync listeners
  onScaleChange: (callback) => {
    const handler = (_event, scale) => callback(scale);
    ipcRenderer.on('set-scale', handler);
    return () => ipcRenderer.removeListener('set-scale', handler);
  },

  onModeChange: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('set-mode', handler);
    return () => ipcRenderer.removeListener('set-mode', handler);
  },

  onToggleHud: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-hud', handler);
    return () => ipcRenderer.removeListener('toggle-hud', handler);
  },

  onTogglePause: (callback) => {
    const handler = (_event, paused) => callback(paused);
    ipcRenderer.on('toggle-pause', handler);
    return () => ipcRenderer.removeListener('toggle-pause', handler);
  },

  onResetSnow: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('reset-snow', handler);
    return () => ipcRenderer.removeListener('reset-snow', handler);
  },

  // Actions sent from renderer to main
  requestMode: (mode) => ipcRenderer.invoke('request-mode', mode),
  requestScale: (scale) => ipcRenderer.invoke('request-scale', scale),
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
});

