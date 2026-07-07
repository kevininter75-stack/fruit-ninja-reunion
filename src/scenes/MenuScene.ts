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
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.16, 'Fruit Ninja Réunion', {
        fontFamily: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
        fontSize: '80px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    // Entrée douce du titre
    title.setAlpha(0).setY(GAME_HEIGHT * 0.13);
    this.tweens.add({ targets: title, alpha: 1, y: GAME_HEIGHT * 0.16, duration: 500, ease: 'Cubic.easeOut' });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, 'Tranchez les fruits péi !', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '36px',
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    this.createFruitParade();

    // Paysage : les deux modes côte à côte plutôt qu'empilés
    this.createModeButton(
      GAME_WIDTH * 0.3,
      GAME_HEIGHT * 0.72,
      'Classique',
      `3 vies — Record : ${getBestScore('classic')}`,
      0xe0455a,
      'classic',
      true
    );
    this.createModeButton(
      GAME_WIDTH * 0.7,
      GAME_HEIGHT * 0.72,
      'Chrono',
      `60 s — Record : ${getBestScore('chrono')}`,
      0x1e90b4,
      'chrono',
      false
    );

    createMuteButton(this, GAME_WIDTH - 52, GAME_HEIGHT - 52);
  }

  /**
   * Défilé des fruits du catalogue sous le titre : vitrine du contenu
   * réunionnais, chaque fruit ondule doucement en décalé.
   */
  private createFruitParade(): void {
    // Paysage : plus de largeur, on montre les 9 fruits + le combava en vitrine
    const showcased = FRUIT_VARIETIES;
    const spacing = GAME_WIDTH / (showcased.length + 1);
    showcased.forEach((variety, index) => {
      const x = spacing * (index + 1);
      const y = GAME_HEIGHT * 0.46;
      const sprite = this.add.image(x, y, wholeTextureKey(variety)).setScale(0.5);
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
    x: number,
    y: number,
    label: string,
    subtitle: string,
    color: number,
    mode: GameMode,
    pulse: boolean
  ): void {
    const button = this.add
      .rectangle(x, y, 440, 150, color)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });

    const labelText = this.add
      .text(x, y - 24, label, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const subtitleText = this.add
      .text(x, y + 34, subtitle, {
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
