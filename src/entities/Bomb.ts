import Phaser from 'phaser';
import { BOMB_RADIUS, GAME_HEIGHT, DEPTH_FRUIT } from '../utils/constants';

/**
 * Bombe : la trancher provoque le game over immédiat (flash + explosion).
 * Poolée et recyclée comme les fruits. Contrairement à un fruit, une bombe
 * qui retombe hors écran disparaît sans pénalité — la laisser passer est
 * précisément le bon réflexe.
 */
export class Bomb extends Phaser.Physics.Arcade.Sprite {
  /** Rayon utilisé pour la détection de coupe (cercle approximatif). */
  public readonly sliceRadius = BOMB_RADIUS;

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
    this.disableBody(true, true);
  }

  /** Une bombe sortie par le bas disparaît silencieusement (pas d'événement). */
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.active && body.velocity.y > 0 && this.y > GAME_HEIGHT + this.sliceRadius * 2) {
      this.kill();
    }
  }
}
