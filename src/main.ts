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
    // Si un service worker nous contrôlait déjà, un changement de contrôleur
    // signifie qu'une nouvelle version vient de s'activer → on recharge une
    // seule fois pour servir le contenu frais. Sans ça, un joueur déjà venu
    // resterait sur la version en cache jusqu'à un vidage manuel.
    const hadController = navigator.serviceWorker.controller !== null;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) {
        return; // pas de rechargement au tout premier enregistrement
      }
      refreshing = true;
      window.location.reload();
    });

    // Chemin relatif : le SW garde la bonne portée même hébergé en sous-chemin
    navigator.serviceWorker.register('sw.js').catch(() => {
      // L'enregistrement peut échouer (contexte non sécurisé…) :
      // le jeu fonctionne alors simplement sans mode hors-ligne.
    });
  });
}
