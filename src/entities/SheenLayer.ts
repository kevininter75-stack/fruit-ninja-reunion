import Phaser from 'phaser';
import { TEX_SHEEN, DEPTH_SHEEN } from '../utils/constants';
import { applyShadingTint } from '../utils/surfaceShading';

/**
 * L'éclairage d'un objet qui tourne. Il ne tourne pas avec lui.
 *
 * LE PROBLÈME. Fruits et bombes tournent en vol — jusqu'à 160°/s pour un
 * fruit. Tout ce qui est peint dans leur texture tourne avec eux, éclairage
 * compris. Or la lumière ne tourne pas avec un objet : c'est même ce qui la
 * définit. Cuite dans la texture, elle donne un soleil qui fait le tour de
 * l'objet — l'indice numéro un qui trahit une fausse 3D.
 *
 * LA DÉCOMPOSITION. La texture est peinte SOUS PLEINE LUMIÈRE, sans galbe,
 * et l'éclairage revient par deux voies calculées en espace ÉCRAN :
 *
 *   la pénombre — où la lumière MANQUE — par la TEINTE du sprite lui-même.
 *     Les quatre coins du quad sont replacés à l'écran selon la rotation
 *     courante, éclairés chacun, et Phaser interpole entre eux. Une teinte
 *     multiplie la couleur sans toucher à l'alpha : le galbe épouse donc
 *     exactement la silhouette, quelle qu'elle soit.
 *
 *   le reflet — où la lumière FRAPPE — par un calque additif à rotation
 *     nulle : le spéculaire et le contre-jour.
 *
 * POURQUOI PAS UN CALQUE DE PÉNOMBRE. C'était la première version, et elle
 * était fausse : une texture de pénombre découpée à la silhouette est
 * découpée UNE FOIS, donc son masque ne tourne pas. Dès que la carambole ou
 * l'ananas pivotait, le masque assombrissait le décor là où le fruit n'était
 * plus — une ombre fantôme, parfaitement visible. La teinte n'a pas ce
 * défaut : elle n'existe que là où le sprite existe.
 *
 * CE QUI TOURNE ENCORE, ET DOIT TOURNER. Le relief de la peau — les écailles
 * d'un letchi, les yeux d'un ananas — reste cuit dans la texture. C'est
 * correct : ces micro-ombres appartiennent à la peau et doivent la suivre.
 * Seul le galbe d'ensemble, qui appartient à la lumière, en a été sorti.
 */
export class SheenLayer {
  private sheen: Phaser.GameObjects.Image | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Recale l'éclairage sur son porteur.
   *
   * `radius` est le rayon du CORPS, pas la demi-largeur de la texture :
   * celle-ci comprend une marge pour les feuilles, la mèche et l'ombre
   * portée, où aucun reflet n'a lieu d'apparaître.
   */
  sync(porteur: Phaser.GameObjects.Sprite, radius: number): void {
    if (!porteur.active || !porteur.visible) {
      this.sheen?.setVisible(false);
      return;
    }

    applyShadingTint(porteur, radius);

    // Création différée : un objet qui n'a jamais volé ne consomme rien.
    // Les porteurs viennent d'un pool, le nombre de calques est donc borné.
    if (this.sheen === null) {
      this.sheen = this.scene.add
        .image(porteur.x, porteur.y, TEX_SHEEN)
        .setDepth(DEPTH_SHEEN)
        .setBlendMode(Phaser.BlendModes.ADD);
    }

    const diametre = radius * 2 * porteur.scaleX;
    this.sheen
      .setVisible(true)
      .setPosition(porteur.x, porteur.y)
      .setDisplaySize(diametre, diametre)
      .setAlpha(porteur.alpha);
  }

  /** Masque le reflet et rend sa couleur au porteur (retour au pool). */
  hide(): void {
    this.sheen?.setVisible(false);
  }
}
