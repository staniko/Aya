#!/usr/bin/env node

/**
 * Fix Protocol Registration
 * This script creates a proper app bundle for development and registers the protocol
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Protocol Registration for LiveKit Screen Recorder');

// Create a temporary app bundle
const tempAppPath = '/tmp/LiveKitScreenRecorder.app';
const contentsPath = path.join(tempAppPath, 'Contents');
const macOSPath = path.join(contentsPath, 'MacOS');
const resourcesPath = path.join(contentsPath, 'Resources');

console.log('Creating temporary app bundle...');

// Create directories
[tempAppPath, contentsPath, macOSPath, resourcesPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Create Info.plist
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.livekit.screenrecorder</string>
    <key>CFBundleName</key>
    <string>LiveKit Screen Recorder</string>
    <key>CFBundleDisplayName</key>
    <string>LiveKit Screen Recorder</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>LiveKitScreenRecorder</string>
    <key>CFBundleIconFile</key>
    <string>icon.png</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>LiveKit Recorder Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>livekit-recorder</string>
            </array>
            <key>CFBundleTypeRole</key>
            <string>Viewer</string>
        </dict>
    </array>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
</dict>
</plist>`;

fs.writeFileSync(path.join(contentsPath, 'Info.plist'), infoPlist);

// Copy the launcher script as the executable
const currentDir = process.cwd();
const launcherSource = path.join(currentDir, 'livekit-recorder');
const executableTarget = path.join(macOSPath, 'LiveKitScreenRecorder');

fs.copyFileSync(launcherSource, executableTarget);
fs.chmodSync(executableTarget, '755');

// Copy the icon
const iconSource = path.join(currentDir, 'aya-logo.png');
const iconTarget = path.join(resourcesPath, 'icon.png');
if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, iconTarget);
}

console.log('App bundle created at:', tempAppPath);

// Register the protocol
try {
  console.log('Registering protocol with system...');
  
  // Use duti if available
  try {
    execSync('which duti >/dev/null 2>&1');
    execSync(`duti -s com.livekit.screenrecorder livekit-recorder all`, { stdio: 'inherit' });
    console.log('✅ Protocol registered with duti');
  } catch (dutiError) {
    console.log('⚠️  duti not available, trying alternative method');
    
    // Alternative: Use LSRegister
    try {
      execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "${tempAppPath}"`, { stdio: 'inherit' });
      console.log('✅ App registered with Launch Services');
    } catch (lsError) {
      console.log('⚠️  LSRegister failed, manual registration needed');
    }
  }
  
} catch (error) {
  console.error('❌ Failed to register protocol:', error.message);
}

console.log('\n📋 Next steps:');
console.log('1. Try running: npm run test-protocol');
console.log('2. Or test directly: open "livekit-recorder://auth/callback?token=test"');
console.log('3. If still not working, install duti: brew install duti');
console.log('4. Then run this script again');

console.log('\n🔍 Debugging:');
console.log('- Check what handles the protocol: duti -x livekit-recorder');
console.log('- List all protocol handlers: duti -l');
console.log('- Force register: duti -s com.livekit.screenrecorder livekit-recorder all'); 