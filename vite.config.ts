import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3010,
    host: true,
  },
  build: {
    target: 'es2022',
    // Phaser est volumineux : on relève le seuil d'avertissement de taille de chunk
    chunkSizeWarningLimit: 1600,
  },
});
