import Phaser from 'phaser';
import { FRUIT_RADIUS, DEPTH_FRUIT } from '../utils/constants';
import { SheenLayer } from './SheenLayer';
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

  /** Vrai pour le piment cabri : il survit à la première coupe et s'emballe. */
  public isFrenzy = false;

  /**
   * Vrai pour la papaye cyclone : elle se tranche NORMALEMENT, en un coup —
   * c'est ce qu'elle déclenche qui n'a rien de normal. Elle est donc l'exact
   * inverse du piment cabri, qui lui refuse de se couper.
   */
  public isCyclone = false;
  /** Frénésie amorcée : le piment flotte et compte les coups reçus. */
  public frenzyActive = false;
  /** Nombre de coups encaissés pendant la frénésie. */
  public slashCount = 0;
  /** Horodatage du dernier coup compté (anti-rafale, cf. FRENZY_HIT_COOLDOWN_MS). */
  public lastSlashAt = 0;

  private variety: FruitVariety | null = null;

  /** Éclairage fixe posé par-dessus le fruit qui tourne (cf. SheenLayer). */
  private readonly sheen = new SheenLayer(this.scene);

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
    isFrenzy = false,
    isCyclone = false
  ): void {
    this.variety = variety;
    this.isBonus = isBonus;
    this.isFrenzy = isFrenzy;
    this.isCyclone = isCyclone;
    this.frenzyActive = false;
    this.slashCount = 0;
    this.lastSlashAt = 0;
    this.sliceRadius = variety.radius;
    this.juiceColor = variety.juiceColor;
    this.setTexture(wholeTextureKey(variety));
    this.setDepth(DEPTH_FRUIT); // au-dessus des taches de jus persistantes

    this.enableBody(true, x, y, true, true);
    // Ceinture et bretelles : un fruit sortant du pool doit toujours retrouver
    // une physique normale, même si la frénésie précédente s'est mal terminée.
    const freshBody = this.body as Phaser.Physics.Arcade.Body;
    freshBody.setAllowGravity(true);
    freshBody.moves = true;
    this.setVelocity(velocityX, velocityY);
    // Petite rotation continue pour donner de la vie au sprite
    this.setAngularVelocity(Phaser.Math.Between(-160, 160));
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Cercle de collision centré sur le sprite (les fruits sont ~ronds)
    body.setCircle(this.sliceRadius, this.width / 2 - this.sliceRadius, this.height / 2 - this.sliceRadius);

    // Les trois fruits spéciaux pulsent pour attirer l'œil (une allocation
    // par spawn spécial — événement rare, pas de pression GC)
    if (isBonus || isFrenzy || isCyclone) {
      this.scene.tweens.add({
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
   * Amorce la frénésie du piment : il sort de la simulation physique pour
   * que la scène puisse le placer et le maintenir à un endroit atteignable
   * pendant toute la frénésie.
   *
   * `body.moves = false` est le point clé : sans cela le corps Arcade
   * continuerait d'intégrer sa vitesse et d'écraser la position à chaque
   * frame, ce qui rendait le piment incontrôlable — il dérivait vers le haut
   * jusqu'à sortir de l'écran, combo impossible à terminer.
   * La détection de coupe lit la position du SPRITE (cf. SliceDetector), donc
   * il reste parfaitement tranchable une fois le corps figé.
   */
  startFrenzy(): void {
    this.frenzyActive = true;
    this.slashCount = 0;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.moves = false;
    this.setVelocity(0, 0);
    this.setAngularVelocity(0);
    this.setRotation(0);
  }

  /** Désactive le fruit et le rend au pool. */
  kill(): void {
    // Purge de TOUS les tweens visant ce sprite (pulsation, recadrage et
    // flottement du piment) : un tween survivant continuerait de déplacer
    // ou de redimensionner le prochain fruit tiré du pool.
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.setAngle(0);
    // Gravité ET intégration physique réactivées pour le prochain occupant du
    // pool : sans ce rétablissement, le fruit suivant resterait figé en l'air.
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body !== null) {
      body.setAllowGravity(true);
      body.moves = true;
    }
    this.frenzyActive = false;
    this.disableBody(true, true);
    this.sheen.hide();
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
    this.sheen.sync(this, this.sliceRadius);
    if (this.frenzyActive) {
      return; // piment figé en frénésie : il ne tombe pas, donc rien à manquer
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.active && body.velocity.y > 0 && this.y > this.scene.scale.height + this.sliceRadius * 2) {
      this.scene.events.emit('fruit-missed', this);
      this.kill();
    }
  }
}
