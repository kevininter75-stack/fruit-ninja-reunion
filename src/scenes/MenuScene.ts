import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, type GameMode } from '../utils/constants';
import { getBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, wholeTextureKey } from '../utils/fruitCatalog';
import { createMuteButton } from '../utils/ui';

/**
 * Écran titre : choix du mode de jeu et vitrine des fruits péi.
 * - Classique : 3 vies, un fruit manqué coûte une vie.
 * - Chrono : score maximal en 60 secondes, fruits manqués sans pénalité.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);
    music.ensureRunning();

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, 'Fruit Ninja\nRéunion', {
        fontFamily: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
        fontSize: '88px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    // Entrée douce du titre
    title.setAlpha(0).setY(GAME_HEIGHT * 0.2);
    this.tweens.add({ targets: title, alpha: 1, y: GAME_HEIGHT * 0.22, duration: 500, ease: 'Cubic.easeOut' });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36, 'Tranchez les fruits péi !', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '36px',
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    this.createFruitParade();

    this.createModeButton(
      GAME_HEIGHT * 0.58,
      'Classique',
      `3 vies — Record : ${getBestScore('classic')}`,
      0xe0455a,
      'classic',
      true
    );
    this.createModeButton(
      GAME_HEIGHT * 0.74,
      'Chrono',
      `60 secondes — Record : ${getBestScore('chrono')}`,
      0x1e90b4,
      'chrono',
      false
    );

    createMuteButton(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.9);
  }

  /**
   * Défilé des fruits du catalogue sous le titre : vitrine du contenu
   * réunionnais, chaque fruit ondule doucement en décalé.
   */
  private createFruitParade(): void {
    const showcased = FRUIT_VARIETIES.slice(0, 6);
    const spacing = GAME_WIDTH / (showcased.length + 1);
    showcased.forEach((variety, index) => {
      const x = spacing * (index + 1);
      const y = GAME_HEIGHT * 0.455;
      const sprite = this.add.image(x, y, wholeTextureKey(variety)).setScale(0.72);
      this.tweens.add({
        targets: sprite,
        y: y - 14,
        angle: index % 2 === 0 ? 8 : -8,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: index * 130, // ondulation en vague
      });
    });
  }

  /** Bouton de mode : grande zone tactile (>= 44px), feedback au survol/appui. */
  private createModeButton(
    y: number,
    label: string,
    subtitle: string,
    color: number,
    mode: GameMode,
    pulse: boolean
  ): void {
    const button = this.add
      .rectangle(GAME_WIDTH / 2, y, 480, 140, color)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });

    const labelText = this.add
      .text(GAME_WIDTH / 2, y - 22, label, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const subtitleText = this.add
      .text(GAME_WIDTH / 2, y + 32, subtitle, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '26px',
        color: '#fff3e0',
      })
      .setOrigin(0.5);

    if (pulse) {
      this.tweens.add({
        targets: [button, labelText, subtitleText],
        scale: 1.04,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    button.on('pointerdown', () => {
      sfx.click();
      this.scene.start('GameScene', { mode });
    });
  }
}
