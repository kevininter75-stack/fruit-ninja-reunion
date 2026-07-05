import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY_Y } from '../utils/constants';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { GameOverScene } from '../scenes/GameOverScene';

/**
 * Configuration principale de Phaser.
 * - Scale.FIT + autoCenter : le canvas s'adapte à l'écran en gardant le ratio portrait.
 * - Physique Arcade avec gravité verticale : trajectoires paraboliques des fruits.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b2a3a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
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
