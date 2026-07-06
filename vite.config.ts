import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne servi depuis la racine (Capacitor,
  // localhost) comme depuis un sous-chemin (GitHub Pages /fruit-ninja-reunion/)
  base: './',
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
