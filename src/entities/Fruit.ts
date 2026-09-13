import Phaser from 'phaser';
import { FRUIT_RADIUS, DEPTH_FRUIT, TEX_SHEEN, DEPTH_SHEEN } from '../utils/constants';
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

  /**
   * Le reflet : un calque additif posé sur le fruit, qui ne tourne JAMAIS.
   *
   * Un fruit tourne jusqu'à 160°/s. Tout ce qui est peint dans sa texture
   * tourne avec lui, reflet compris — et un soleil qui fait le tour d'un
   * fruit est ce qui trahit le plus sûrement une fausse 3D. Le grand reflet
   * est donc sorti de la texture (cf. SPECULAIRE_CUIT) et posé ici, à
   * rotation nulle : la lumière reste en place pendant que le fruit tourne
   * dessous, comme dans le monde réel.
   *
   * Créé une fois avec le fruit, jamais détruit : les fruits viennent d'un
   * pool, donc le nombre de reflets est borné par la taille du pool.
   */
  private sheen: Phaser.GameObjects.Image | null = null;

  getVariety(): FruitVariety | null {
    return this.variety;
  }

  /** Crée le calque de reflet au premier lancer (le pool le réutilise ensuite). */
  private ensureSheen(): Phaser.GameObjects.Image {
    if (this.sheen === null) {
      this.sheen = this.scene.add
        .image(this.x, this.y, TEX_SHEEN)
        .setDepth(DEPTH_SHEEN)
        .setBlendMode(Phaser.BlendModes.ADD);
    }
    return this.sheen;
  }

  /**
   * Recale le reflet sur le fruit : même position, même taille, mais angle
   * toujours nul. C'est la ligne `setRotation(0)` implicite — on ne touche
   * simplement jamais à l'angle — qui porte tout l'effet.
   */
  private syncSheen(): void {
    const sheen = this.sheen;
    if (sheen === null) {
      return;
    }
    if (!this.active || !this.visible) {
      sheen.setVisible(false);
      return;
    }
    // Le reflet couvre le CORPS du fruit, pas sa texture : celle-ci comprend
    // une marge pour les feuilles et l'ombre portée, où aucun reflet n'a lieu
    // d'apparaître. On se cale donc sur le rayon de coupe.
    const diametre = this.sliceRadius * 2 * this.scaleX;
    sheen
      .setVisible(true)
      .setPosition(this.x, this.y)
      .setDisplaySize(diametre, diametre)
      .setAlpha(this.alpha);
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

    this.ensureSheen();
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

    // Le combava doré et la grenade pulsent pour attirer l'œil (une allocation
    // par spawn spécial — événement rare, pas de pression GC)
    if (isBonus || isFrenzy) {
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
   * Amorce la frénésie de la grenade : elle sort de la simulation physique
   * pour que la scène puisse la placer et la maintenir à un endroit
   * atteignable pendant toute la frénésie.
   *
   * `body.moves = false` est le point clé : sans cela le corps Arcade
   * continuerait d'intégrer sa vitesse et d'écraser la position à chaque
   * frame, ce qui rendait la grenade incontrôlable — elle dérivait vers le
   * haut jusqu'à sortir de l'écran, combo impossible à terminer.
   * La détection de coupe lit la position du SPRITE (cf. SliceDetector), donc
   * elle reste parfaitement tranchable une fois le corps figé.
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
    // flottement de la grenade) : un tween survivant continuerait de déplacer
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
    this.sheen?.setVisible(false);
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
    this.syncSheen();
    if (this.frenzyActive) {
      return; // grenade figée en frénésie : elle ne tombe pas, donc rien à manquer
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.active && body.velocity.y > 0 && this.y > this.scene.scale.height + this.sliceRadius * 2) {
      this.scene.events.emit('fruit-missed', this);
      this.kill();
    }
  }
}
