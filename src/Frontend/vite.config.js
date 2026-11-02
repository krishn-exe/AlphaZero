import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load .env from root directory (AlphaZero/.env) if present, or local Frontend directory
  envDir: path.resolve(__dirname, '../../'),
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
