import Phaser from 'phaser';
import { backgroundKey } from '../utils/viewport';
import {
  TEX_GLOW,
  TEX_CLOUD,
  TEX_JUICE,
  SUN_FRAC_X,
  SUN_FRAC_Y,
  BG_CLOUD_COUNT,
  DEPTH_BG_BASE,
  DEPTH_BG_GLOW,
  DEPTH_BG_CLOUD,
  DEPTH_BG_MOTE,
} from '../utils/constants';

/**
 * Décor animé, partagé par toutes les scènes.
 *
 * Sur le fond baké (ciel, volcan, océan, palmiers) viennent se superposer,
 * sous tout le reste (profondeurs négatives, sous le voile sombre en jeu) :
 * - un halo de soleil qui respire (pulse d'échelle/alpha) ;
 * - des nuages qui dérivent lentement en boucle ;
 * - de fines particules d'ambiance qui montent (poussière de lumière).
 *
 * Tout est piloté par tweens/émetteur : aucune logique par frame, donc
 * rien à mettre à jour dans les scènes. Recréé à chaque entrée de scène
 * (et donc à chaque rotation), il lit la taille courante de l'écran.
 */
export class AnimatedBackground {
  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    // Décor de base (adapté à l'orientation)
    scene.add.image(0, 0, backgroundKey(scene)).setOrigin(0).setDepth(DEPTH_BG_BASE);

    // Halo de soleil qui respire, en fusion additive pour un vrai rayonnement
    const glow = scene.add
      .image(w * SUN_FRAC_X, h * SUN_FRAC_Y, TEX_GLOW)
      .setDepth(DEPTH_BG_GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.55);
    scene.tweens.add({
      targets: glow,
      scale: 1.14,
      alpha: 0.85,
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.createDriftingClouds(scene, w, h);

    // Particules d'ambiance : fine poussière de lumière qui monte doucement
    scene.add
      .particles(0, 0, TEX_JUICE, {
        x: { min: 0, max: w },
        y: h + 10,
        lifespan: 9000,
        speedY: { min: -42, max: -16 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.22, end: 0 },
        alpha: { start: 0.35, end: 0 },
        tint: 0xfff2cc,
        frequency: 380,
        quantity: 1,
      })
      .setDepth(DEPTH_BG_MOTE);
  }

  /**
   * Nuages en dérive : chaque nuage traverse d'un bord à l'autre en boucle.
   * On les répartit dès le départ avec seek() (position aléatoire dans le
   * cycle) pour éviter qu'ils entrent tous en même temps.
   */
  private createDriftingClouds(scene: Phaser.Scene, w: number, h: number): void {
    for (let i = 0; i < BG_CLOUD_COUNT; i++) {
      const y = h * Phaser.Math.FloatBetween(0.05, 0.3);
      const cloud = scene.add
        .image(0, y, TEX_CLOUD)
        .setDepth(DEPTH_BG_CLOUD)
        .setAlpha(Phaser.Math.FloatBetween(0.1, 0.2))
        .setScale(Phaser.Math.FloatBetween(0.6, 1.35));
      const cw = cloud.displayWidth;
      cloud.x = -cw / 2;
      const duration = Phaser.Math.Between(28000, 46000);
      const tween = scene.tweens.add({
        targets: cloud,
        x: w + cw / 2,
        duration,
        repeat: -1,
        ease: 'Linear',
      });
      // Décale chaque nuage à un point aléatoire de sa traversée
      tween.seek(Math.random() * duration);
    }
  }
}
