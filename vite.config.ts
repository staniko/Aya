import { defineConfig } from 'vite'

// Import the config file to get environment-specific values
const config = require('./src/config');
console.log('Vite NODE_ENV:', process.env.NODE_ENV);
console.log('Vite using config:', config);

export default defineConfig({
  server: {
    port: 1420,
    host: true
  },
  plugins: [
    {
      name: 'protocol-url-handler',
      configureServer(server) {
        server.middlewares.use('/protocol-url', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const { url } = JSON.parse(body);
                console.log('Received protocol URL from launcher:', url);
                
                // Send the URL to all connected WebSocket clients (Electron renderer)
                server.ws.send('protocol-url', { url });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (error) {
                console.error('Error handling protocol URL:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
          } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  base: './',
  define: {
    // Build-time configuration replacement using config file
    __AUTH_HOST__: JSON.stringify(config.AUTH_HOST),
    __DEBUG_MODE__: JSON.stringify(config.DEBUG_MODE),
    __NODE_ENV__: JSON.stringify(process.env.NODE_ENV || 'development'),
  }
})