const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  openAuthUrl: () => ipcRenderer.invoke('open-auth-url'),
  
  // Window controls
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
  setMouseEvents: (ignore) => ipcRenderer.invoke('set-mouse-events', ignore),
  
  // Permissions
  requestSystemPermissions: () => ipcRenderer.invoke('request-system-permissions'),
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  
  // Deep link events
  onLoginComplete: (callback) => {
    ipcRenderer.on('login-complete', (event, token) => callback(token));
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Window controls
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  
  // Screen sharing
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources')
});

// Platform information
contextBridge.exposeInMainWorld('platform', {
  isElectron: true,
  platform: process.platform,
  versions: process.versions
});