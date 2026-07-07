import Phaser from 'phaser';
import { type GameMode } from '../utils/constants';
import { getBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, wholeTextureKey } from '../utils/fruitCatalog';
import { createMuteButton } from '../utils/ui';
import { backgroundKey } from '../utils/viewport';

/**
 * Écran titre : choix du mode de jeu et vitrine des fruits péi.
 * - Classique : 3 vies, un fruit manqué coûte une vie.
 * - Chrono : score maximal en 60 secondes, fruits manqués sans pénalité.
 *
 * Responsive : la mise en page suit l'orientation — les deux modes sont
 * empilés en portrait, côte à côte en paysage.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    this.add.image(0, 0, backgroundKey(this)).setOrigin(0);
    music.ensureRunning();

    const title = this.add
      .text(w / 2, h * 0.16, portrait ? 'Fruit Ninja\nRéunion' : 'Fruit Ninja Réunion', {
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
    title.setAlpha(0).setY(h * 0.13);
    this.tweens.add({ targets: title, alpha: 1, y: h * 0.16, duration: 500, ease: 'Cubic.easeOut' });

    this.add
      .text(w / 2, h * (portrait ? 0.28 : 0.3), 'Tranchez les fruits péi !', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '36px',
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    // Vitrine : plus de fruits en paysage (plus large), moins en portrait
    this.createFruitParade(portrait ? 6 : FRUIT_VARIETIES.length, h * (portrait ? 0.42 : 0.46));

    if (portrait) {
      // Portrait : les deux modes empilés
      this.createModeButton(
        w / 2,
        h * 0.62,
        'Classique',
        `3 vies — Record : ${getBestScore('classic')}`,
        0xe0455a,
        'classic',
        true
      );
      this.createModeButton(
        w / 2,
        h * 0.76,
        'Chrono',
        `60 s — Record : ${getBestScore('chrono')}`,
        0x1e90b4,
        'chrono',
        false
      );
    } else {
      // Paysage : les deux modes côte à côte
      this.createModeButton(
        w * 0.3,
        h * 0.72,
        'Classique',
        `3 vies — Record : ${getBestScore('classic')}`,
        0xe0455a,
        'classic',
        true
      );
      this.createModeButton(
        w * 0.7,
        h * 0.72,
        'Chrono',
        `60 s — Record : ${getBestScore('chrono')}`,
        0x1e90b4,
        'chrono',
        false
      );
    }

    createMuteButton(this, w - 52, h - 52);
  }

  /**
   * Défilé des fruits du catalogue sous le titre : vitrine du contenu
   * réunionnais, chaque fruit ondule doucement en décalé.
   */
  private createFruitParade(count: number, y: number): void {
    const showcased = FRUIT_VARIETIES.slice(0, count);
    const spacing = this.scale.width / (showcased.length + 1);
    showcased.forEach((variety, index) => {
      const x = spacing * (index + 1);
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
