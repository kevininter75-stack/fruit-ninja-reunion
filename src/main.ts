import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Point d'entrée : instancie le jeu Phaser avec la configuration globale.
const game = new Phaser.Game(gameConfig);

// Poignée de debug exposée en développement uniquement :
// permet d'inspecter/piloter le jeu depuis la console ou des tests navigateur.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

// PWA : service worker enregistré uniquement sur le build de production
// (en dev, il fausserait le rechargement à chaud de Vite).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // L'enregistrement peut échouer (contexte non sécurisé…) :
      // le jeu fonctionne alors simplement sans mode hors-ligne.
    });
  });
}
