import Phaser from 'phaser';

/**
 * L'étalonnage : une matrice de couleur appliquée à toute l'image, sur GPU.
 *
 * POURQUOI. Chaque élément du jeu a été dessiné séparément — le décor, les
 * dix fruits, le jus, le HUD. Chacun est juste pris isolément, et pourtant
 * l'ensemble « fait maquette ». C'est le défaut classique d'une image
 * composée d'éléments justes mais sans lumière commune : au cinéma on ne
 * monte jamais des plans bruts, on les étalonne pour qu'une seule lumière
 * paraisse les avoir éclairés tous.
 *
 * C'est exactement ce que fait cette classe, et c'est le plus gros écart
 * visuel pour le plus petit coût de toute la chaîne de rendu : une
 * multiplication de matrice par pixel, dans le shader que Phaser fournit
 * déjà. Aucune passe supplémentaire, aucune cible de rendu, aucun flou.
 *
 * POURQUOI PAS DE BLOOM. Phaser propose bien un Bloom, mais son shader n'a
 * PAS de seuil : il floute et rajoute toute l'image, pas seulement les zones
 * lumineuses. Sur la caméra principale il rendrait le score et les libellés
 * baveux — c'est-à-dire qu'il paierait un halo décoratif avec de la
 * lisibilité, ce qui est exactement le mauvais côté de l'échange sur un
 * écran de téléphone. Le rayonnement de la lame et du soleil est donc obtenu
 * par des passes additives dessinées, qui ne coûtent rien et ne touchent pas
 * au texte.
 *
 * SUR LE CONTRASTE. L'étalonnage AUGMENTE le contraste et laisse les gris
 * neutres où ils sont (la saturation ne déplace pas un gris). Les rapports
 * de contraste du HUD ne peuvent donc que s'améliorer, jamais se dégrader.
 */

/** Matrice 4x5 : 4 lignes RGBA, la 5e colonne étant un décalage en 0-1. */
type Matrix5 = number[];

/**
 * Étalonnage de base : hautes lumières chaudes, ombres froides.
 *
 * C'est le « teal & orange » du cinéma, et ici il ne force rien : la scène
 * EST un couchant au-dessus d'un lagon, donc chaud en haut et froid en bas.
 * On ne fait qu'appuyer ce qui est déjà là — un étalonnage qui contredit son
 * image se voit immédiatement.
 */
const CHAUD_FROID: Matrix5 = [
  1.045, 0.0, 0.0, 0, 0.004,
  0.0, 1.005, 0.0, 0, 0.002,
  0.0, 0.0, 0.955, 0, 0.022,
  0, 0, 0, 1, 0,
];

/** Intensités de l'étalonnage selon le moment de jeu. */
export type GradingMode = 'normal' | 'frenzy' | 'danger';

export class SceneGrading {
  private readonly fx: Phaser.FX.ColorMatrix | null;
  private mode: GradingMode = 'normal';

  constructor(scene: Phaser.Scene) {
    const camera = scene.cameras.main;
    // En rendu Canvas (très vieux appareils, ou WebGL indisponible), postFX
    // n'existe pas. Le jeu doit rester jouable sans étalonnage : on renonce
    // silencieusement plutôt que de planter au démarrage.
    this.fx = camera.postFX ? camera.postFX.addColorMatrix() : null;
    this.rebuild();

    // Rien à défaire au shutdown : l'effet vit sur la caméra, et le
    // gestionnaire de caméras est détruit avec la scène qui le possède.
  }

  /** Change d'ambiance. Sans effet si l'on y est déjà. */
  setMode(mode: GradingMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.rebuild();
  }

  /**
   * Reconstruit la matrice. Appelé uniquement aux CHANGEMENTS d'ambiance,
   * jamais par frame : la matrice reste ensuite un uniforme constant, et le
   * coût par image se réduit au shader lui-même.
   */
  private rebuild(): void {
    const fx = this.fx;
    if (!fx) {
      return;
    }

    fx.reset();
    fx.multiply(CHAUD_FROID, true);

    switch (this.mode) {
      case 'normal':
        fx.saturate(0.16, true);
        fx.contrast(0.07, true);
        break;

      case 'frenzy':
        // Frénésie : plus saturé et plus chaud, l'image « chauffe » avec
        // l'action. Le contraste monte moins que la saturation — pousser les
        // deux ensemble boucherait les ombres et l'on perdrait les bombes.
        fx.saturate(0.42, true);
        fx.contrast(0.12, true);
        fx.multiply(
          [
            1.09, 0.0, 0.0, 0, 0.012,
            0.0, 1.01, 0.0, 0, 0.0,
            0.0, 0.0, 0.9, 0, 0.0,
            0, 0, 0, 1, 0,
          ],
          true
        );
        break;

      case 'danger':
        // Fin de partie imminente : l'image se désature et se refroidit.
        // C'est un signal PÉRIPHÉRIQUE — il n'occupe aucune place à l'écran
        // et ne masque rien, contrairement à un bandeau d'alerte.
        fx.saturate(-0.3, true);
        fx.contrast(0.1, true);
        fx.multiply(
          [
            0.94, 0.0, 0.0, 0, 0.0,
            0.0, 0.96, 0.0, 0, 0.0,
            0.0, 0.0, 1.06, 0, 0.014,
            0, 0, 0, 1, 0,
          ],
          true
        );
        break;
    }
  }

}
