import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Every demo app lives in projects/<id>/ and is built as its own page. */
export const demos = ['geomind', 'landscope', 'earthwatch', 'job-tracker', 'printflow', 'quote-assistant']

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /portfolio/).
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, open: true },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: root('./index.html'),
        ...Object.fromEntries(demos.map((id) => [id, root(`./projects/${id}/index.html`)])),
      },
    },
  },
  test: { include: ['projects/**/*.test.ts'] },
})
