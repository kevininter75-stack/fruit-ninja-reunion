import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

/** Données passées par la GameScene à la fin d'une partie. */
interface GameOverData {
  score: number;
}

/**
 * Écran de fin de partie : score final + relance.
 * TODO Phase 2 : meilleur score persistant (localStorage), stats de combo.
 */
export class GameOverScene extends Phaser.Scene {
  private finalScore = 0;

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData): void {
    this.finalScore = data.score ?? 0;
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);

    // Voile sombre pour détacher le texte du fond
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b2a3a, 0.55).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, 'GAME OVER', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#ff6b6b',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.45, `Score : ${this.finalScore}`, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, 'Touchez pour rejouer', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#e0455a',
        padding: { x: 36, y: 20 },
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => {
      this.scene.start('GameScene');
    });
  }
}
