import Phaser from 'phaser';
import { BOMB_RADIUS, DEPTH_FRUIT, px } from '../utils/constants';
import { SheenLayer } from './SheenLayer';

/**
 * Bombe : la trancher provoque le game over immédiat (flash + explosion).
 * Poolée et recyclée comme les fruits. Contrairement à un fruit, une bombe
 * qui retombe hors écran disparaît sans pénalité — la laisser passer est
 * précisément le bon réflexe.
 */
// Position du bout de la mèche dans la texture, relative au centre de la bombe
// (voir PreloadScene.createBombTexture : étincelle en (r+17, 8) sur un canvas 2r).
const FUSE_LOCAL_X = px(17);
const FUSE_LOCAL_Y = px(8) - BOMB_RADIUS;

export class Bomb extends Phaser.Physics.Arcade.Sprite {
  /** Rayon utilisé pour la détection de coupe (cercle approximatif). */
  public readonly sliceRadius = BOMB_RADIUS;

  /**
   * Reflet fixe. C'est sur la bombe qu'il compte le plus : une sphère de
   * métal poli est l'objet dont le reflet se remarque le plus, et sa
   * silhouette est un vrai cercle, donc le calque épouse exactement sa forme.
   */
  private readonly sheen = new SheenLayer(this.scene);

  /**
   * Écrit dans `out` la position MONDE du bout de la mèche (là où crépitent
   * les étincelles). La mèche tourne avec la bombe : on fait donc pivoter
   * l'offset local par la rotation courante. `out` est réutilisé (pas d'alloc).
   */
  fuseTip(out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    out.x = this.x + FUSE_LOCAL_X * cos - FUSE_LOCAL_Y * sin;
    out.y = this.y + FUSE_LOCAL_X * sin + FUSE_LOCAL_Y * cos;
    return out;
  }

  /** (Re)lance la bombe depuis le bas de l'écran. Appelé par le SpawnManager. */
  launch(x: number, y: number, velocityX: number, velocityY: number): void {
    this.enableBody(true, x, y, true, true);
    this.setDepth(DEPTH_FRUIT);
    this.setVelocity(velocityX, velocityY);
    this.setAngularVelocity(Phaser.Math.Between(-120, 120));
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.sliceRadius, this.width / 2 - this.sliceRadius, this.height / 2 - this.sliceRadius);
  }

  /** Désactive la bombe et la rend au pool. */
  kill(): void {
    this.sheen.hide();
    this.disableBody(true, true);
  }

  /** Une bombe sortie par le bas disparaît silencieusement (pas d'événement). */
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.sheen.sync(this, this.sliceRadius);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.active && body.velocity.y > 0 && this.y > this.scene.scale.height + this.sliceRadius * 2) {
      this.kill();
    }
  }
}
