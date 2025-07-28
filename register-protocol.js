const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Registering LiveKit Screen Recorder protocol...');

if (process.platform === 'darwin') {
  // macOS
  try {
    // Create a simple Info.plist for protocol handling
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.livekit.screenrecorder</string>
    <key>CFBundleName</key>
    <string>LiveKit Screen Recorder</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>LiveKit Recorder Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>livekit-recorder</string>
            </array>
        </dict>
    </array>
</dict>
</plist>`;

    // For development, we can try to register using duti if available
    try {
      execSync('which duti', { stdio: 'ignore' });
      console.log('Using duti to register protocol...');
      
      // First, let's try to set up a temporary registration
      const tempAppPath = '/tmp/LiveKitRecorder.app';
      if (!fs.existsSync(tempAppPath)) {
        fs.mkdirSync(tempAppPath, { recursive: true });
        fs.mkdirSync(`${tempAppPath}/Contents`, { recursive: true });
        fs.writeFileSync(`${tempAppPath}/Contents/Info.plist`, plistContent);
      }
      
      // Register the protocol
      execSync(`duti -s com.livekit.screenrecorder livekit-recorder all`, { stdio: 'inherit' });
      console.log('✅ Protocol registered successfully with duti');
    } catch (dutiError) {
      console.log('duti not available, protocol registration may not work in development');
      console.log('Install duti with: brew install duti');
    }
    
  } catch (error) {
    console.error('Error registering protocol on macOS:', error.message);
  }
} else if (process.platform === 'win32') {
  // Windows - requires admin privileges
  console.log('Windows protocol registration requires building the app or admin privileges');
  console.log('Run: npm run build && npm run dist');
} else {
  // Linux
  console.log('Linux protocol registration varies by desktop environment');
  console.log('Build the app with: npm run build && npm run dist');
}

console.log('\n📋 Next steps:');
console.log('1. For development testing, you may need to build the app first');
console.log('2. Run: npm run build && npm run dist');
console.log('3. Install the built app to properly register protocols');
console.log('4. Or test the protocol directly by opening: livekit-recorder://auth/callback?token=test'); 