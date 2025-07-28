const { app } = require('electron');

// Function to set app name for development
function setDevAppName() {
  if (process.env.NODE_ENV === 'development') {
    console.log('Setting development app name to: Aya Assistant');
    
    // Set the app name multiple ways to ensure it takes effect
    app.setName('Aya Assistant');
    
    // On macOS, also try to set the dock name
    if (process.platform === 'darwin') {
      try {
        // Force the dock to update by hiding and showing
        if (app.dock) {
          app.dock.hide();
          setTimeout(() => {
            app.dock.show();
          }, 100);
        }
      } catch (error) {
        console.log('Could not manipulate dock:', error.message);
      }
    }
    
    console.log('App name set to:', app.getName());
  }
}

module.exports = { setDevAppName };