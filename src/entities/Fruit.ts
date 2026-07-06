import Phaser from 'phaser';
import { GAME_HEIGHT, FRUIT_RADIUS } from '../utils/constants';
import { type FruitVariety, wholeTextureKey } from '../utils/fruitCatalog';

/**
 * Un fruit lancé à l'écran.
 * Les fruits sont recyclés via un pool (Phaser Group) : on ne les détruit
 * jamais, on les désactive avec kill() puis on les relance avec launchAs().
 * Un même sprite du pool change de variété (texture, rayon, jus) à chaque
 * relance — c'est le catalogue qui porte les données par variété.
 */
export class Fruit extends Phaser.Physics.Arcade.Sprite {
  /** Rayon de détection de coupe — mis à jour à chaque launchAs(). */
  public sliceRadius = FRUIT_RADIUS;

  /** Couleur des particules de jus de la variété courante. */
  public juiceColor = 0xe0455a;

  /** Vrai pour le combava doré (déclenche le score x2 à la coupe). */
  public isBonus = false;

  private variety: FruitVariety | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  getVariety(): FruitVariety | null {
    return this.variety;
  }

  /**
   * (Re)lance le fruit sous une variété donnée depuis une position avec
   * une vélocité initiale. Appelé par le SpawnManager via le pool.
   */
  launchAs(
    variety: FruitVariety,
    isBonus: boolean,
    x: number,
    y: number,
    velocityX: number,
    velocityY: number
  ): void {
    this.variety = variety;
    this.isBonus = isBonus;
    this.sliceRadius = variety.radius;
    this.juiceColor = variety.juiceColor;
    this.setTexture(wholeTextureKey(variety));

    this.enableBody(true, x, y, true, true);
    this.setVelocity(velocityX, velocityY);
    // Petite rotation continue pour donner de la vie au sprite
    this.setAngularVelocity(Phaser.Math.Between(-160, 160));
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Cercle de collision centré sur le sprite (les fruits sont ~ronds)
    body.setCircle(this.sliceRadius, this.width / 2 - this.sliceRadius, this.height / 2 - this.sliceRadius);

    // Le combava doré pulse pour attirer l'œil (une allocation par spawn
    // bonus — événement rare, pas de pression GC)
    if (isBonus) {
      this.pulseTween = this.scene.tweens.add({
        targets: this,
        scale: 1.15,
        duration: 280,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** Désactive le fruit et le rend au pool. */
  kill(): void {
    if (this.pulseTween !== null) {
      this.pulseTween.stop();
      this.pulseTween = null;
      this.setScale(1);
    }
    this.disableBody(true, true);
  }

  /**
   * Détection de fruit manqué : quand le fruit repasse sous le bas de
   * l'écran en tombant (vélocité Y positive), il est perdu.
   * On émet un événement de scène plutôt que d'appeler directement la
   * logique de vies, pour garder l'entité découplée des systèmes.
   * (Un combava manqué ne coûte jamais de vie : voir GameScene.)
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
