import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

// The Cloudflare plugin runs the /api Worker (with local D1, R2 and email) inside the dev server.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
