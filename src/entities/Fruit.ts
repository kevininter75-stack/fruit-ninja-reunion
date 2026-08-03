import Phaser from 'phaser';
import { FRUIT_RADIUS, DEPTH_FRUIT } from '../utils/constants';
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

  /** Vrai pour la grenade : elle survit à la première coupe et s'emballe. */
  public isFrenzy = false;
  /** Frénésie amorcée : la grenade flotte et compte les coups reçus. */
  public frenzyActive = false;
  /** Nombre de coups encaissés pendant la frénésie. */
  public slashCount = 0;
  /** Horodatage du dernier coup compté (anti-rafale, cf. FRENZY_HIT_COOLDOWN_MS). */
  public lastSlashAt = 0;

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
    velocityY: number,
    isFrenzy = false
  ): void {
    this.variety = variety;
    this.isBonus = isBonus;
    this.isFrenzy = isFrenzy;
    this.frenzyActive = false;
    this.slashCount = 0;
    this.lastSlashAt = 0;
    this.sliceRadius = variety.radius;
    this.juiceColor = variety.juiceColor;
    this.setTexture(wholeTextureKey(variety));
    this.setDepth(DEPTH_FRUIT); // au-dessus des taches de jus persistantes

    this.enableBody(true, x, y, true, true);
    this.setVelocity(velocityX, velocityY);
    // Petite rotation continue pour donner de la vie au sprite
    this.setAngularVelocity(Phaser.Math.Between(-160, 160));
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Cercle de collision centré sur le sprite (les fruits sont ~ronds)
    body.setCircle(this.sliceRadius, this.width / 2 - this.sliceRadius, this.height / 2 - this.sliceRadius);

    // Le combava doré et la grenade pulsent pour attirer l'œil (une allocation
    // par spawn spécial — événement rare, pas de pression GC)
    if (isBonus || isFrenzy) {
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

  /**
   * Amorce la frénésie de la grenade : elle cesse de retomber et flotte
   * doucement, le temps que le joueur l'écharpe autant qu'il peut.
   * La gravité est annulée sur ce corps uniquement (pas sur le monde), donc
   * les autres fruits continuent leur course normalement.
   */
  startFrenzy(floatVelocityY: number): void {
    this.frenzyActive = true;
    this.slashCount = 0;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    this.setVelocity(0, floatVelocityY);
    this.setAngularVelocity(90);
  }

  /** Désactive le fruit et le rend au pool. */
  kill(): void {
    if (this.pulseTween !== null) {
      this.pulseTween.stop();
      this.pulseTween = null;
      this.setScale(1);
    }
    // La gravité est réactivée pour le prochain occupant du pool
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body !== null) {
      body.setAllowGravity(true);
    }
    this.frenzyActive = false;
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
    if (this.active && body.velocity.y > 0 && this.y > this.scene.scale.height + this.sliceRadius * 2) {
      this.scene.events.emit('fruit-missed', this);
      this.kill();
    }
  }
}
