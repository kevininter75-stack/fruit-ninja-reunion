import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Point d'entrée : instancie le jeu Phaser avec la configuration globale.
const game = new Phaser.Game(gameConfig);

// Poignée de debug exposée en développement uniquement :
// permet d'inspecter/piloter le jeu depuis la console ou des tests navigateur.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
