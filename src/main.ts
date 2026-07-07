import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { computeViewport } from './utils/viewport';

// Point d'entrée : instancie le jeu Phaser avec la configuration globale.
const game = new Phaser.Game(gameConfig);

// Responsive : le jeu suit l'orientation du device. Quand elle change, on
// bascule la résolution logique (portrait ↔ paysage) et on relance la scène
// active pour qu'elle se réagence à la nouvelle taille.
let currentPortrait = computeViewport().isPortrait;
function handleOrientation(): void {
  const vp = computeViewport();
  if (vp.isPortrait === currentPortrait) {
    return; // simple redimensionnement sans changement d'orientation : FIT gère seul
  }
  currentPortrait = vp.isPortrait;
  game.scale.setGameSize(vp.width, vp.height);
  // Relayout : la seule scène active (Menu, Game ou GameOver) se recrée à la
  // nouvelle taille. Tourner l'écran en pleine partie repart donc à zéro —
  // c'est un geste volontaire et rare, on l'accepte.
  for (const scene of game.scene.getScenes(true)) {
    scene.scene.restart();
  }
}
window.addEventListener('resize', handleOrientation);
window.addEventListener('orientationchange', handleOrientation);

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
