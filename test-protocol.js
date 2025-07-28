#!/usr/bin/env node

/**
 * Test Protocol Handler
 * This bypasses system protocol registration and directly launches our app with a protocol URL
 */

const { spawn } = require('child_process');
const path = require('path');

const testUrl = process.argv[2] || 'livekit-recorder://auth/callback?token=test-12345';

console.log('🧪 Testing Protocol Handler');
console.log('Test URL:', testUrl);

// Path to our launcher
const launcherPath = path.join(__dirname, 'livekit-recorder');

console.log('Launcher path:', launcherPath);
console.log('Starting app with protocol URL...');

// Launch our app directly with the protocol URL
const child = spawn(launcherPath, [testUrl], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LIVEKIT_PROTOCOL_URL: testUrl
  }
});

child.on('error', (error) => {
  console.error('❌ Failed to start app:', error);
});

child.on('exit', (code) => {
  console.log(`App exited with code: ${code}`);
}); 