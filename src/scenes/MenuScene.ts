import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

/**
 * Écran titre minimal (Phase 1) : titre + appel à l'action.
 * TODO Phase 2 : choix du mode (Classique / Chrono), boutons stylisés,
 * meilleur score, animations d'entrée.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, 'Fruit Ninja\nRéunion', {
        fontFamily: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
        fontSize: '88px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.52, 'Tranchez les fruits péi !', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '36px',
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    const cta = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.7, 'Touchez pour jouer', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#e0455a',
        padding: { x: 36, y: 20 }, // zone tactile généreuse (> 44px)
      })
      .setOrigin(0.5);

    // Pulsation douce du bouton pour attirer l'œil
    this.tweens.add({
      targets: cta,
      scale: 1.06,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.once('pointerdown', () => {
      this.scene.start('GameScene');
    });
  }
}
