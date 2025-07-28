<picture>
  <img alt="Banner with Aya logo" src="./images/aya-banner.png"  width="full">
</picture>

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python Version](https://img.shields.io/badge/python-3.12+-blue.svg)
[![Discord](https://img.shields.io/discord/1372691179740729354?color=7289DA&label=Discord&logo=discord&logoColor=white)](https://discord.gg/3KAmWKeyjR)
[![GitHub stars](https://img.shields.io/github/stars/MiraiPitch/Aya?style=social)](https://github.com/MiraiPitch/Aya/stargazers)

# Aya Assistant - Professional AI assistant

A professional screen recording application built with Electron and LiveKit, featuring transparent windows, custom dragging, and seamless system integration.

## Features

- 🎥 **Screen Recording**: High-quality screen capture with LiveKit integration
- 🔍 **Transparent Windows**: Fully transparent background with custom UI elements
- 🖱️ **Custom Dragging**: Frameless window with draggable header region
- 🎛️ **Opacity Control**: Adjustable window transparency (20-100%)
- 🔐 **System Permissions**: Automated microphone and screen recording permission requests
- 🌐 **Deep Linking**: Protocol handler for authentication callbacks (`livekit-recorder://`)
- 🍎 **macOS Integration**: Native dock icon and app name support
- ⚡ **Hot Reload**: Development mode with live reload capabilities

## Technology Stack

- **Electron** - Cross-platform desktop application framework
- **Vite** - Fast build tool and development server
- **TypeScript** - Type-safe JavaScript development
- **LiveKit Client** - Real-time video/audio streaming
- **CSS3** - Modern styling with backdrop filters and transparency effects

## Prerequisites

- Node.js 16+ 
- npm or yarn
- macOS/Windows/Linux (tested primarily on macOS)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd livekit-recorder-electron
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the icon**
   - Ensure `aya-logo.png` is in the root directory
   - The build process will copy it to the appropriate locations

## Development

### Start Development Server
```bash
npm run dev
```

This runs two processes concurrently:
- **Vite dev server** on `http://localhost:1420`
- **Electron app** with hot reload enabled

### Development Scripts
```bash
npm run dev # Run in development mode
npm run dev:staging   # Run in staging mode
npm run dev:production # Run in production mode
```

### Protocol Registration (Development)
```bash
npm run register-protocol  # Register deep link protocol
npm run test-protocol      # Test protocol handling
npm run test-protocol-system # Test protocol with system call
npm run fix-protocol       # Fix protocol registration issues
```

## Building

```bash
npm run build        # Build web assets + create Electron installer
npm run build:dev    # Build for development environment
npm run build:staging # Build for staging environment
npm run pack         # Package without creating installer
npm run dist         # Create distribution packages
```

## Architecture

### File Structure
```
src/
├── main.js          # Electron main process
├── main.ts          # TypeScript renderer process
├── preload.js       # Preload script for IPC
├── style.css        # Application styles
└── assets/
    └── aya-logo.png  # App icon for development

public/              # Vite static assets
├── aya-logo.png # Web favicon

index.html          # Main HTML template
package.json        # Project configuration
vite.config.ts      # Vite configuration
```

### IPC Communication

The app uses Electron's IPC for secure communication between processes:

```javascript
// Available in renderer process via window.electronAPI
- openAuthUrl()                    # Open authentication URL
- setWindowOpacity(opacity)        # Adjust window transparency
- requestSystemPermissions()       # Request mic/screen permissions
- checkPermissions()               # Check current permission status
- closeWindow()                    # Close the application
- onLoginComplete(callback)        # Handle authentication callbacks
```

### Transparency & Dragging

- **Transparent Window**: Uses `transparent: true` and `frame: false`
- **Custom Drag Region**: Top 40px header with `-webkit-app-region: drag`
- **Interactive Elements**: Buttons use `-webkit-app-region: no-drag`
- **Backdrop Effects**: CSS `backdrop-filter: blur()` for modern glass effects

## Configuration

### Window Settings
- **Default Size**: 800x800px
- **Transparency**: Fully transparent background
- **Frame**: Frameless with custom controls
- **Opacity Range**: 20-100% adjustable

### Build Configuration
The app builds to different formats per platform:
- **macOS**: DMG installer with dock integration
- **Windows**: NSIS installer 
- **Linux**: AppImage package

### Protocol Handler
- **Scheme**: `livekit-recorder://`
- **Auth Callback**: `livekit-recorder://auth/callback?token=<token>`
- **Single Instance**: Prevents multiple app instances

## Development Tips

### Debugging
- Development mode automatically opens DevTools
- Console logs show app initialization and permission status
- Use `npm run test-protocol` to test deep link handling

### Icon Issues
If the app shows "Electron" instead of "Aya Assistant":
- Restart the development server
- Check that `productName` is set in package.json
- Verify icon files exist in all required locations

### Permission Issues (macOS)
- Grant permissions in System Settings > Privacy & Security
- Use `npm run register-protocol` if deep links aren't working
- Check Console.app for system-level permission errors

## Troubleshooting

### Common Issues

1. **Port in use**: If port 1420 is occupied, Vite will try 1421
2. **Permission denied**: Run permission request and check System Settings
3. **Protocol not registered**: Run `npm run register-protocol`
4. **App shows as "Electron"**: Restart development server
5. **Transparency not working**: Check CSS for `background: transparent !important`

### Reset Development Environment
```bash
# Kill all processes
pkill -f "livekit-recorder"
pkill -f "electron"
pkill -f "vite"

# Clean and restart
npm run dev
```

## TODO

Backend
- [ ] Set default language for the agent
- [ ] Add prewarm to the agent for things that can be loaded in advance
- [ ] Add tools to the agent the agent can use from it's own server
- [ ] Add tools to the agent that it can pass to the user (might be a bit tricky to do async with default LiveKit agent tools)


UI
- [ ] Add a way to choose the used prompts and language
- [ ] After login, app should come to the foreground
- [ ] microphone device choice dropdown
- [ ] Save the conversation log to a file
- [ ] Clear conversation log button



## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Built with ❤️ using Electron and LiveKit