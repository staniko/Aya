const { app, BrowserWindow, ipcMain, shell, systemPreferences, desktopCapturer } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Load environment variables
require('dotenv').config();

const config = require('./config');

const nodeEnv = config.ENV;
const authHost = config.AUTH_HOST;
const debugMode = config.DEBUG_MODE;

console.log('main.js config loaded:', { authHost, debugMode, nodeEnv });

// Set app name immediately - must be done before app ready
app.setName('Aya Assistant');
console.log('App name set to:', app.getName());
console.log('Using config environment:', nodeEnv);
console.log('config:', config);

// Enable live reload for Electron in development
if (nodeEnv === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (_) {}
}

let mainWindow;

function createWindow() {
  console.log('Creating main window...');
  
  // Set the icon path - prioritize environment variable, then default
  let iconPath;
  if (process.env.ELECTRON_ICON) {
    iconPath = process.env.ELECTRON_ICON;
  } else if (nodeEnv === 'development') {
    iconPath = path.join(__dirname, 'assets', 'aya-logo.png');
  } else {
    iconPath = path.join(__dirname, '../aya-logo.png');
  }
  console.log('Using icon:', iconPath);
  
  // Get primary display dimensions
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calculate window dimensions - full screen width, reasonable height
  const windowWidth = screenWidth; // Full screen width
  const windowHeight = Math.min(700, Math.floor(screenHeight * 0.8)); // 80% of screen height or 700px max
  
  // Create the browser window with transparency
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0, // Full screen width, start at left edge
    y: 0, // Position at top of screen
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    transparent: true,
    frame: false, // Remove frame for custom dragging
    titleBarStyle: 'hidden',
    show: false, // Don't show until ready
    title: 'Aya Assistant',
    alwaysOnTop: true, // Keep window on top for overlay functionality
    skipTaskbar: false,
    icon: iconPath,
    // Additional properties for app identification
    autoHideMenuBar: true,
    fullscreenable: false, // Disable fullscreen for overlay
    resizable: true,
    minimizable: true,
    maximizable: false // Disable maximize for overlay
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Force set the title after the window is ready
    mainWindow.setTitle('Aya Assistant');
    
    // Set click-through by default - mouse events will pass through
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    
    // Open DevTools in development in a separate detached window
    if (nodeEnv === 'development' || nodeEnv === 'staging') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    
  });

  // Load the app
  if (nodeEnv === 'development') {
    console.log('Loading development URL...');
    mainWindow.loadURL('http://localhost:1420');
  } else {
    console.log('Loading production file...');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure single instance with specific name
const gotTheLock = app.requestSingleInstanceLock({
  // Use a unique key for this specific app
  key: 'livekit-screen-recorder-2024'
});

if (!gotTheLock) {
  console.log('Another instance is already running');
  app.quit();
} else {
  // Force protocol registration removal and re-registration
  console.log('=== Aya Assistant Starting ===');
  console.log('Process execPath:', process.execPath);
  console.log('Process argv:', process.argv);
  
  // Set app name early for development mode
  app.setName('Aya Assistant');
  
  // Remove any existing registration first
  app.removeAsDefaultProtocolClient('livekit-recorder');
  
  // Register protocol with launcher script for development
  if (nodeEnv === 'development') {
    // Use appropriate launcher script based on platform
    let launcherPath;
    if (process.platform === 'win32') {
      // Windows: use Node.js launcher
      launcherPath = process.execPath; // path to node.exe
      const scriptPath = path.resolve(__dirname, '..', 'livekit-recorder-launcher.js');
      const registered = app.setAsDefaultProtocolClient('livekit-recorder', launcherPath, [scriptPath]);
      console.log(`Protocol registration (dev, Windows) result: ${registered}`);
      console.log(`Registered with launcher: ${launcherPath} ${scriptPath}`);
    } else {
      // macOS/Linux: use bash launcher
      launcherPath = path.resolve(__dirname, '..', 'livekit-recorder');
      const registered = app.setAsDefaultProtocolClient('livekit-recorder', launcherPath);
      console.log(`Protocol registration (dev, Unix) result: ${registered}`);
      console.log(`Registered with launcher: ${launcherPath}`);
    }
  } else {
    const registered = app.setAsDefaultProtocolClient('livekit-recorder');
    console.log(`Protocol registration (prod) result: ${registered}`);
  }

  // App event handlers
  app.whenReady().then(() => {
    console.log('App is ready, creating window...');
    
    // Set dock icon and app name on macOS
    if (process.platform === 'darwin') {
      let dockIconPath;
      if (process.env.ELECTRON_ICON) {
        dockIconPath = process.env.ELECTRON_ICON;
      } else if (nodeEnv === 'development') {
        dockIconPath = path.join(__dirname, 'assets', 'aya-logo.png');
      } else {
        dockIconPath = path.join(__dirname, '../aya-logo.png');
      }
      try {
        app.dock.setIcon(dockIconPath);
        app.setName('Aya Assistant');
        console.log('Dock icon set to:', dockIconPath);
        console.log('App name set to: Aya Assistant');
      } catch (error) {
        console.error('Failed to set dock icon:', error);
      }
    }
    
    createWindow();

    // Handle any pending protocol URL from environment variable
    const envProtocolUrl = process.env.LIVEKIT_PROTOCOL_URL;
    if (envProtocolUrl) {
      console.log('Handling protocol URL from environment:', envProtocolUrl);
      setTimeout(() => {
        handleProtocolUrl(envProtocolUrl);
      }, 1000);
    } else if (global.pendingProtocolUrl) {
      console.log('Handling pending protocol URL:', global.pendingProtocolUrl);
      setTimeout(() => {
        handleProtocolUrl(global.pendingProtocolUrl);
        global.pendingProtocolUrl = null;
      }, 1000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch(error => {
    console.error('Error during app startup:', error);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('open-auth-url', async () => {
  const host = authHost || "http://undefined-auth-url";
  const authUrl = `${host}/auth?callback_url=livekit-recorder://auth/callback`;
  console.log('main.js opening auth URL:', authUrl);
  await shell.openExternal(authUrl);
  return 'Auth URL opened';
});

// Add mouse event control handlers
ipcMain.handle('set-mouse-events', async (event, ignore) => {
  if (mainWindow) {
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
    return `Mouse events ${ignore ? 'ignored' : 'captured'}`;
  }
  throw new Error('Main window not found');
});

ipcMain.handle('set-window-opacity', async (event, opacity) => {
  if (mainWindow) {
    const clampedOpacity = Math.max(0.01, Math.min(1.0, opacity));
    mainWindow.setOpacity(clampedOpacity);
    return `Opacity set to ${clampedOpacity}`;
  }
  throw new Error('Main window not found');
});

ipcMain.handle('request-system-permissions', async () => {
  const permissions = await checkPermissions();
  
  if (permissions.microphone && permissions.screen) {
    return 'All permissions are already granted! ✅';
  }

  const messages = [];

  // Request microphone permission
  if (!permissions.microphone) {
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      if (micStatus === 'not-determined') {
        try {
          const granted = await systemPreferences.askForMediaAccess('microphone');
          messages.push(granted ? '🎤 Microphone permission granted' : '🎤 Microphone permission denied');
        } catch (error) {
          messages.push('🎤 Microphone permission request failed');
        }
      } else {
        messages.push('🎤 Microphone permission already determined - check System Preferences');
      }
    } else {
      messages.push('🎤 Microphone permission needs to be granted manually');
    }
  } else {
    messages.push('🎤 Microphone permission already granted');
  }

  // Request screen recording permission
  if (!permissions.screen) {
    if (process.platform === 'darwin') {
      const screenStatus = systemPreferences.getMediaAccessStatus('screen');
      messages.push('🖥️ Screen recording permission needed - please grant it manually in System Settings > Privacy & Security > Screen Recording');
    } else {
      messages.push('🖥️ Screen recording permission needs to be granted manually');
    }
  } else {
    messages.push('🖥️ Screen recording permission already granted');
  }

  return messages.join('\\n');
});

ipcMain.handle('check-permissions', async () => {
  return await checkPermissions();
});

ipcMain.handle('close-window', async () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('minimize-window', async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// Screen sharing with desktopCapturer
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false,
      thumbnailSize: {
        width: 300,
        height: 200
      }
    });
    
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (error) {
    console.error('Error getting screen sources:', error);
    throw error;
  }
});

async function checkPermissions() {
  let microphone = false;
  let screen = false;

  if (process.platform === 'darwin') {
    // Check microphone permission
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    microphone = micStatus === 'granted';

    // Check screen recording permission
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    screen = screenStatus === 'granted';
  } else {
    // For other platforms, assume permissions are granted
    // In a real app, you'd implement platform-specific checks
    microphone = true;
    screen = true;
  }

  return {
    microphone,
    screen,
    audio: screen, // Audio is included with screen recording
    debug: {
      platform: process.platform,
      micStatus: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'unknown',
      screenStatus: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unknown'
    }
  };
}

// Handle protocol for Windows/Linux
if (process.platform === 'win32' || process.platform === 'linux') {
  // Check if we were launched with a protocol URL
  const protocolUrl = process.argv.find(arg => arg.startsWith('livekit-recorder://'));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }
}

// Handle protocol for macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Handle protocol for Windows/Linux when app is already running
app.on('second-instance', (event, argv) => {
  // Focus the main window if it exists
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    
    // Check for protocol URL in the arguments
    const protocolUrl = argv.find(arg => arg.startsWith('livekit-recorder://'));
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
    }
  }
});

function handleProtocolUrl(url) {
  console.log('Handling protocol URL:', url);
  
  if (mainWindow) {
    // Parse the deep link URL
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'livekit-recorder:' && urlObj.hostname === 'auth' && urlObj.pathname === '/callback') {
        const token = urlObj.searchParams.get('token');
        if (token) {
          console.log('Sending token to renderer:', token);
          // Send the token to the renderer process
          mainWindow.webContents.send('login-complete', token);
          
          // Focus and show the window
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.show();
        }
      }
    } catch (error) {
      console.error('Error parsing protocol URL:', error);
    }
  } else {
    console.log('Main window not available, storing URL for later');
    // Store the URL to handle after window is created
    global.pendingProtocolUrl = url;
  }
}

