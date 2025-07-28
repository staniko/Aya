// Configuration for Aya Assistant
// This file gets bundled with the app and provides runtime configuration

const config = {
  // Development configuration
  development: {
    ENV: "development",
    AUTH_HOST: "http://localhost:3000",
    DEBUG_MODE: true
  },

  // Staging configuration
  staging: {
    ENV: "staging",
    AUTH_HOST: "https://aya-app.miraipitch.com",
    DEBUG_MODE: false
  },
  
  // Production configuration
  production: {
    ENV: "production",
    AUTH_HOST: "https://aya-app.miraipitch.com",
    DEBUG_MODE: false
  }
};

// Get current environment
// In production, NODE_ENV is not set for the main.js, so we default to production
const env = process.env.NODE_ENV || 'production';

// Export the appropriate configuration
module.exports = config[env] || config.development; 