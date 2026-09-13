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
  SCREEN_BLEED,
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
  /**
   * @param parallax Active la dérive en parallaxe des plans du décor. Réservé
   * aux écrans hors-jeu (menu, fin de partie) : en pleine partie, un décor qui
   * bouge sous des fruits qui volent brouille la lecture de l'action.
   */
  constructor(scene: Phaser.Scene, parallax = false) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    // Décor de base (adapté à l'orientation), débordant légèrement de l'écran
    // pour qu'une secousse de caméra ne découvre jamais le vide (SCREEN_BLEED).
    const base = scene.add
      .image(-SCREEN_BLEED, -SCREEN_BLEED, backgroundKey(scene))
      .setOrigin(0)
      .setDisplaySize(w + SCREEN_BLEED * 2, h + SCREEN_BLEED * 2)
      .setDepth(DEPTH_BG_BASE);

    // Halo de soleil qui respire, en fusion additive pour un vrai rayonnement
    const glow = scene.add
      .image(w * SUN_FRAC_X, h * SUN_FRAC_Y, TEX_GLOW)
      .setDepth(DEPTH_BG_GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.55);

    if (parallax) {
      this.addParallaxDrift(scene, base, glow, w, h);
    }
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
  /**
   * Dérive en parallaxe : les plans du décor oscillent lentement, d'autant
   * plus que l'on est près de l'observateur. Le décor gagne de la profondeur
   * sans qu'aucune scène n'ait à calculer quoi que ce soit par frame.
   *
   * Le fond est légèrement AGRANDI avant d'être déplacé : à taille exacte,
   * le moindre décalage découvrirait le bord de l'écran.
   *
   * Les périodes X et Y sont volontairement différentes (et non multiples) :
   * la trajectoire ne se referme jamais sur elle-même, le mouvement ne
   * paraît donc pas cyclique.
   */
  private addParallaxDrift(
    scene: Phaser.Scene,
    base: Phaser.GameObjects.Image,
    glow: Phaser.GameObjects.Image,
    w: number,
    h: number
  ): void {
    const amplitude = w * 0.016;
    base.setDisplaySize(w * 1.05, h * 1.05).setPosition(-w * 0.025, -h * 0.025);

    scene.tweens.add({
      targets: base,
      x: base.x + amplitude,
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: base,
      y: base.y + amplitude * 0.6,
      duration: 7000, // période différente de X : trajectoire jamais bouclée
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Le soleil est le plan le plus lointain : il bouge deux fois moins
    scene.tweens.add({
      targets: glow,
      x: glow.x - amplitude * 0.45,
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

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
