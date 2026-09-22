import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const token = process.env.PEEKER_TOKEN
            if (!token) return
            if (!req.url?.includes('token=')) {
              proxyReq.setHeader('x-peeker-token', token)
            }
          })
        },
      },
    },
  },
})
