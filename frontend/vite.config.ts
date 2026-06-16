import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Prevent Vite from crashing on ECONNRESET from proxy targets
    {
      name: 'catch-socket-errors',
      configureServer(server) {
        server.httpServer?.on('connection', (socket) => {
          socket.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ECONNRESET') return // swallow
            console.error('Socket error:', err.message)
          })
        })
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/mcp': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[proxy] MCP backend error:', err.message)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
            }
            res.end(JSON.stringify({ error: 'Backend unavailable' }))
          })
        },
      },
      '/health': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[proxy] Health check error:', err.message)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
            }
            res.end(JSON.stringify({ status: 'error', healthy: false }))
          })
        },
      },
    },
  },
})
