#!/usr/bin/env node

/**
 * LiveKit Screen Recorder Protocol Launcher
 * This script ensures the correct app opens when livekit-recorder:// URLs are clicked
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('=== LiveKit Screen Recorder Launcher ===');
console.log('Arguments:', process.argv);

// Get the protocol URL from command line arguments
const protocolUrl = process.argv.find(arg => arg.startsWith('livekit-recorder://'));

if (!protocolUrl) {
  console.log('No protocol URL found, starting app normally...');
  startElectronApp();
} else {
  console.log('Protocol URL detected:', protocolUrl);
  
  // Try to send the URL to an existing development server first
  tryNotifyRunningApp(protocolUrl)
    .then(success => {
      if (success) {
        console.log('Successfully sent protocol URL to running app');
        process.exit(0);
      } else {
        console.log('No running app found, starting new instance...');
        startElectronApp(protocolUrl);
      }
    })
    .catch(error => {
      console.log('Failed to notify running app, starting new instance...', error.message);
      startElectronApp(protocolUrl);
    });
}

function tryNotifyRunningApp(url) {
  return new Promise((resolve) => {
    // Try to connect to the Vite dev server (indicates app is running)
    const req = http.request({
      hostname: 'localhost',
      port: 1420,
      path: '/protocol-url',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 2000
    }, (res) => {
      console.log('Development server responded:', res.statusCode);
      resolve(res.statusCode === 200);
    });

    req.on('error', (error) => {
      console.log('Development server not reachable:', error.code);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('Development server timeout');
      req.destroy();
      resolve(false);
    });

    req.write(JSON.stringify({ url }));
    req.end();
  });
}

function startElectronApp(protocolUrl = null) {
  // Path to the main Electron app
  const appPath = path.join(__dirname, 'src', 'main.js');
  // Use platform-specific electron path
  const electronPath = process.platform === 'win32' 
    ? path.join(__dirname, 'node_modules', '.bin', 'electron.cmd')
    : path.join(__dirname, 'node_modules', '.bin', 'electron');

  console.log('App path:', appPath);
  console.log('Electron path:', electronPath);

  // Launch the Electron app
  const args = [appPath];
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    LIVEKIT_APP_ID: 'livekit-screen-recorder',
  };

  if (protocolUrl) {
    // Pass the protocol URL as an environment variable
    env.LIVEKIT_PROTOCOL_URL = protocolUrl;
  }

  console.log('Launching with args:', args);

  const child = spawn(electronPath, args, {
    stdio: 'inherit',
    env: env
  });

  child.on('error', (error) => {
    console.error('Failed to start app:', error);
  });

  child.on('exit', (code) => {
    console.log('App exited with code:', code);
  });
} 