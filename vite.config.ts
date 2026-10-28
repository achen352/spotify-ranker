import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spotify only accepts loopback IP literals (not "localhost") for http redirect URIs,
// so the dev server is pinned to http://127.0.0.1:5173.
const server = { host: '127.0.0.1', port: 5173, strictPort: true };

export default defineConfig({
  plugins: [react()],
  server,
  preview: server,
});
