import { resolve } from 'path'

import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../dist',
    watch: {}
  },
  plugins: [ ],
  root: resolve(__dirname, 'src'),
  server: {
    allowedHosts: [ 'mattbook-m3.home.simerson.net', 'localhost.simerson.net', 'localhost'],
    cors: true,
    hmr: {
      // clientPort: 5173,
      // protocol: 'ws',
      // port: 5174,
      // overlay: false,
    },
    port: 8080
  }
})