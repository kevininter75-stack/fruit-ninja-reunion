import Phaser from 'phaser';
import { GRAVITY_Y } from '../utils/constants';
import { computeViewport } from '../utils/viewport';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { GameOverScene } from '../scenes/GameOverScene';

// Résolution logique initiale = orientation au démarrage. Elle bascule ensuite
// à la rotation du device (main.ts appelle scale.setGameSize + relayout).
const initial = computeViewport();

/**
 * Configuration principale de Phaser.
 * - Scale.FIT + autoCenter : le canvas s'adapte à l'écran en gardant le ratio courant.
 * - Physique Arcade avec gravité verticale : trajectoires paraboliques des fruits.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b2a3a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initial.width,
    height: initial.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
    },
  },
  input: {
    // Multi-touch prévu pour la Phase 4 : on réserve 2 pointeurs supplémentaires dès maintenant
    activePointers: 3,
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, GameOverScene],
};
