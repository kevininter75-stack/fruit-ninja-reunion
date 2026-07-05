import Phaser from 'phaser';

/**
 * Bombe : si le joueur la tranche, c'est le game over immédiat.
 *
 * TODO Phase 2 : implémentation complète (spawn via SpawnManager,
 * flash d'écran, son d'explosion, transition GameOverScene).
 * Le squelette est posé dès la Phase 1 pour figer l'architecture.
 */
export class Bomb extends Phaser.Physics.Arcade.Sprite {
  launch(x: number, y: number, velocityX: number, velocityY: number): void {
    this.enableBody(true, x, y, true, true);
    this.setVelocity(velocityX, velocityY);
  }

  kill(): void {
    this.disableBody(true, true);
  }
}
