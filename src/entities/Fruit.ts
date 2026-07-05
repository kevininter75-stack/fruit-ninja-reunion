import Phaser from 'phaser';
import { FRUIT_RADIUS, GAME_HEIGHT } from '../utils/constants';

/**
 * Un fruit lancé à l'écran.
 * Les fruits sont recyclés via un pool (Phaser Group) : on ne les détruit
 * jamais, on les désactive avec kill() puis on les relance avec launch().
 */
export class Fruit extends Phaser.Physics.Arcade.Sprite {
  /** Rayon utilisé pour la détection de coupe (cercle approximatif). */
  public readonly sliceRadius = FRUIT_RADIUS;

  /**
   * (Re)lance le fruit depuis une position avec une vélocité initiale.
   * Appelé par le SpawnManager quand il récupère un fruit du pool.
   */
  launch(x: number, y: number, velocityX: number, velocityY: number): void {
    this.enableBody(true, x, y, true, true);
    this.setVelocity(velocityX, velocityY);
    // Petite rotation continue pour donner de la vie au sprite
    this.setAngularVelocity(Phaser.Math.Between(-160, 160));
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Cercle de collision centré sur le sprite (les fruits sont ronds)
    body.setCircle(this.sliceRadius, this.width / 2 - this.sliceRadius, this.height / 2 - this.sliceRadius);
  }

  /** Désactive le fruit et le rend au pool. */
  kill(): void {
    this.disableBody(true, true);
  }

  /**
   * Détection de fruit manqué : quand le fruit repasse sous le bas de
   * l'écran en tombant (vélocité Y positive), il est perdu.
   * On émet un événement de scène plutôt que d'appeler directement la
   * logique de vies, pour garder l'entité découplée des systèmes.
   */
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.active && body.velocity.y > 0 && this.y > GAME_HEIGHT + this.sliceRadius * 2) {
      this.scene.events.emit('fruit-missed', this);
      this.kill();
    }
  }
}
