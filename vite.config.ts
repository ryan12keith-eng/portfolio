import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /portfolio/).
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, open: true },
})
