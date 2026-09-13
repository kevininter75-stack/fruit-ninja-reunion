import Phaser from 'phaser';
import { TEX_SHEEN, DEPTH_SHEEN } from '../utils/constants';

/**
 * Le reflet d'un objet sphérique : un calque additif posé par-dessus lui,
 * qui ne tourne JAMAIS.
 *
 * POURQUOI CE CALQUE EXISTE. Fruits et bombes tournent en vol — jusqu'à
 * 160°/s pour un fruit, 120°/s pour une bombe. Tout ce qui est peint dans
 * leur texture tourne avec eux, reflet compris. Or un reflet spéculaire ne
 * tourne pas avec l'objet : il reste face à la lumière, c'est même sa
 * définition. Cuit dans la texture, il donne un soleil qui fait le tour de
 * l'objet, et c'est l'indice numéro un qui trahit une fausse 3D.
 *
 * On sort donc le grand reflet de la texture (cf. SPECULAIRE_CUIT dans
 * surfaceShading) pour le poser ici, à rotation nulle. C'est ce que fait un
 * moteur 3D, obtenu avec une texture partagée par tous les objets et un
 * sprite de plus à l'écran : ni shader, ni cible de rendu, ni passe de flou.
 *
 * CE QUE ÇA NE CORRIGE PAS. L'ombrage diffus de grande échelle reste, lui,
 * cuit dans la texture et tourne donc encore. Il est bien plus discret qu'un
 * point spéculaire — un dégradé doux, pas un point vif que l'œil suit — mais
 * il est là. Le corriger demanderait un second calque en fusion MULTIPLY et
 * la régénération de toutes les textures sans lumière directionnelle.
 */
export class SheenLayer {
  private image: Phaser.GameObjects.Image | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Recale le reflet sur son porteur : même position, même taille, angle
   * toujours nul. C'est le fait de ne JAMAIS toucher à l'angle qui porte
   * tout l'effet.
   *
   * `radius` est le rayon du CORPS, pas la demi-largeur de la texture :
   * celle-ci comprend une marge pour les feuilles, la mèche et l'ombre
   * portée, où aucun reflet n'a lieu d'apparaître.
   */
  sync(porteur: Phaser.GameObjects.Sprite, radius: number): void {
    if (!porteur.active || !porteur.visible) {
      this.image?.setVisible(false);
      return;
    }

    // Création différée : un objet qui n'a jamais volé ne consomme rien.
    // Les porteurs viennent d'un pool, donc le nombre de reflets est borné.
    if (this.image === null) {
      this.image = this.scene.add
        .image(porteur.x, porteur.y, TEX_SHEEN)
        .setDepth(DEPTH_SHEEN)
        .setBlendMode(Phaser.BlendModes.ADD);
    }

    const diametre = radius * 2 * porteur.scaleX;
    this.image
      .setVisible(true)
      .setPosition(porteur.x, porteur.y)
      .setDisplaySize(diametre, diametre)
      .setAlpha(porteur.alpha);
  }

  /** Masque le reflet (retour au pool, explosion, fin de partie). */
  hide(): void {
    this.image?.setVisible(false);
  }
}
