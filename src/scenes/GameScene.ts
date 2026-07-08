import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { SliceTrail } from '../entities/SliceTrail';
import { SliceDetector } from '../systems/SliceDetector';
import { ScoreManager } from '../systems/ScoreManager';
import { ComboManager } from '../systems/ComboManager';
import { SpawnManager } from '../systems/SpawnManager';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, halfTextureKeys, wholeTextureKey } from '../utils/fruitCatalog';
import { createMuteButton } from '../utils/ui';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import {
  FRUIT_POOL_SIZE,
  HALF_POOL_SIZE,
  HALF_LIFETIME_MS,
  SCORE_PER_FRUIT,
  SLICE_MIN_SPEED,
  STARTING_LIVES,
  TEX_BOMB,
  TEX_JUICE,
  BOMB_POOL_SIZE,
  BOMB_GAMEOVER_DELAY_MS,
  JUICE_PARTICLE_COUNT,
  TEX_SPLAT_PREFIX,
  SPLAT_VARIANTS,
  SPLAT_POOL_SIZE,
  SPLAT_FADE_MS,
  DEPTH_SPLAT,
  DEPTH_HALF,
  DEPTH_JUICE,
  DEPTH_DARKEN,
  GAME_DARKEN_COLOR,
  GAME_DARKEN_ALPHA,
  COMBO_BONUS_PER_STEP,
  CHRONO_DURATION_MS,
  POPUP_POOL_SIZE,
  BONUS_X2_FACTOR,
  BONUS_X2_DURATION_MS,
  BOMB_ZOOM,
  BOMB_ZOOM_MS,
  BOMB_PHYSICS_SLOWMO,
  FUSE_SPARK_TINT,
  FUSE_SPARK_EVERY,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GESTURE_COMBO_MIN,
  GESTURE_COMBO_BONUS,
  type GameMode,
  type GameOverReason,
} from '../utils/constants';

/** Données passées par le menu au lancement d'une partie. */
interface GameSceneData {
  mode?: GameMode;
}

/**
 * État d'un geste de coupe en cours. Multi-touch : chaque doigt posé
 * occupe un slot (pré-alloué) avec sa propre traînée et son historique.
 */
interface SliceGesture {
  /** id du pointeur Phaser qui occupe ce slot, null si libre. */
  pointerId: number | null;
  trail: SliceTrail;
  lastX: number;
  lastY: number;
  lastTime: number;
  /** Nombre de fruits tranchés depuis que ce doigt s'est posé (combo par geste). */
  comboCount: number;
}

/** Nombre de gestes simultanés gérés (2 doigts + souris, cf. activePointers). */
const MAX_GESTURES = 3;

/**
 * Scène de jeu principale : boucle spawn → swipe → coupe → score.
 *
 * Deux modes :
 * - Classique : 3 vies, un fruit manqué coûte une vie.
 * - Chrono : 60 secondes, les fruits manqués sont ignorés.
 * Dans les deux modes, trancher une bombe termine immédiatement la partie.
 * Le combava doré active un score x2 temporaire (bannière sous le score).
 */
export class GameScene extends Phaser.Scene {
  private mode: GameMode = 'classic';

  private fruits!: Phaser.Physics.Arcade.Group;
  private halves!: Phaser.Physics.Arcade.Group;
  private bombs!: Phaser.Physics.Arcade.Group;
  private sliceDetector!: SliceDetector;
  private scoreManager!: ScoreManager;
  private comboManager!: ComboManager;
  private spawnManager!: SpawnManager;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fuseEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly fuseTip = new Phaser.Math.Vector2(); // réutilisé (pas d'alloc/frame)
  private frameCount = 0;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text; // compte à rebours (mode Chrono uniquement)
  private lifeCrosses: Phaser.GameObjects.Text[] = []; // strikes (mode Classique)
  private multiplierBanner!: Phaser.GameObjects.Text;
  private multiplierTimer: Phaser.Time.TimerEvent | null = null;
  private popupPool: Phaser.GameObjects.Text[] = [];
  private splatPool: Phaser.GameObjects.Image[] = [];
  private nextSplatIndex = 0;

  // Statistiques de la partie (affichées sur l'écran de fin — Étape 4)
  private fruitsSliced = 0;
  private bestGestureCombo = 0;

  // État de la partie — la même instance de scène est réutilisée à chaque
  // restart, donc TOUT l'état mutable doit être réinitialisé dans init().
  private gameEnded = false;
  private chronoEndTime = 0;
  private lastShownSecond = -1;

  // Gestes de coupe en cours, un slot par doigt (recréés dans create())
  private gestures: SliceGesture[] = [];

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode ?? 'classic';
    this.gameEnded = false;
    this.lastShownSecond = -1;
    this.multiplierTimer = null;
    this.fruitsSliced = 0;
    this.bestGestureCombo = 0;
    this.frameCount = 0;
    // La scène est réutilisée au restart : on repart d'un tableau vide pour
    // ne pas garder de références aux croix (détruites) de la partie passée.
    this.lifeCrosses = [];
  }

  create(): void {
    // Normalise le temps physique au cas où un ralenti de bombe traînerait
    // d'une partie précédente (le reset au shutdown planterait : world null).
    this.physics.world.timeScale = 1;

    new AnimatedBackground(this);
    // Voile sombre : atténue le décor pendant la partie pour que les fruits
    // ressortent. Au-dessus du fond animé (depths négatifs), sous les taches.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, GAME_DARKEN_COLOR, GAME_DARKEN_ALPHA)
      .setOrigin(0)
      .setDepth(DEPTH_DARKEN);
    music.ensureRunning();

    // Pools de sprites : fruits, moitiés et bombes sont recyclés, jamais
    // détruits, pour éviter les allocations/GC en partie (60 FPS mobile).
    this.fruits = this.physics.add.group({
      classType: Fruit,
      defaultKey: wholeTextureKey(FRUIT_VARIETIES[0]),
      maxSize: FRUIT_POOL_SIZE,
    });
    this.halves = this.physics.add.group({
      defaultKey: halfTextureKeys(FRUIT_VARIETIES[0]).left,
      maxSize: HALF_POOL_SIZE,
    });
    this.bombs = this.physics.add.group({
      classType: Bomb,
      defaultKey: TEX_BOMB,
      maxSize: BOMB_POOL_SIZE,
    });

    this.scoreManager = new ScoreManager(this);
    this.comboManager = new ComboManager();
    this.sliceDetector = new SliceDetector();
    this.spawnManager = new SpawnManager(this, this.fruits, this.bombs, this.scoreManager);

    // Slots de gestes multi-touch : traînées et états pré-alloués,
    // aucune allocation quand un doigt se pose en pleine partie.
    this.gestures = [];
    for (let i = 0; i < MAX_GESTURES; i++) {
      this.gestures.push({
        pointerId: null,
        trail: new SliceTrail(this),
        lastX: 0,
        lastY: 0,
        lastTime: 0,
        comboCount: 0,
      });
    }

    // Émetteur de jus : un seul émetteur réutilisé, teinté par fruit à l'émission
    this.juiceEmitter = this.add
      .particles(0, 0, TEX_JUICE, {
        speed: { min: 100, max: 340 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        lifespan: { min: 300, max: 650 },
        gravityY: 900,
        emitting: false,
      })
      .setDepth(DEPTH_JUICE);

    // Étincelles de mèche : petites particules vives émises au bout de la mèche
    // des bombes en vol (crépitement). Réutilise la texture de jus, teinte orange.
    this.fuseEmitter = this.add
      .particles(0, 0, TEX_JUICE, {
        speed: { min: 20, max: 90 },
        angle: { min: 200, max: 340 }, // vers le haut, gerbe étroite
        scale: { start: 0.5, end: 0 },
        lifespan: { min: 150, max: 320 },
        tint: FUSE_SPARK_TINT,
        gravityY: 300,
        emitting: false,
      })
      .setDepth(DEPTH_JUICE);

    // Flash blanc plein écran (bombe) — créé une fois, réactivé au besoin
    this.flashRect = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 1)
      .setOrigin(0)
      .setDepth(200)
      .setVisible(false)
      .setAlpha(0);

    this.createUi();
    this.createPopupPool();
    this.createSplatPool();
    this.registerGameEvents();
    this.registerPointerEvents();

    if (this.mode === 'chrono') {
      this.chronoEndTime = this.time.now + CHRONO_DURATION_MS;
    }

    this.spawnManager.start();
  }

  update(): void {
    for (const gesture of this.gestures) {
      gesture.trail.update(this.time.now);
    }
    this.updateFuseSparks();
    if (this.mode === 'chrono' && !this.gameEnded) {
      this.updateChrono();
    }
  }

  /** Fait crépiter la mèche de chaque bombe en vol (étincelles à son bout). */
  private updateFuseSparks(): void {
    this.frameCount++;
    if (this.gameEnded || this.frameCount % FUSE_SPARK_EVERY !== 0) {
      return;
    }
    const bombs = this.bombs.getChildren();
    for (let i = 0; i < bombs.length; i++) {
      const bomb = bombs[i] as Bomb;
      if (!bomb.active) {
        continue;
      }
      bomb.fuseTip(this.fuseTip);
      this.fuseEmitter.emitParticleAt(this.fuseTip.x, this.fuseTip.y, 1);
    }
  }

  private updateChrono(): void {
    const remainingMs = this.chronoEndTime - this.time.now;
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    // setText coûte cher : on ne met à jour qu'au changement de seconde
    if (seconds !== this.lastShownSecond) {
      this.lastShownSecond = seconds;
      this.infoText.setText(`${seconds} s`);
      if (seconds <= 5 && seconds > 0) {
        this.infoText.setColor('#ff5252'); // urgence visuelle en fin de chrono
      }
    }
    if (remainingMs <= 0) {
      this.gameEnded = true;
      this.spawnManager.stop();
      this.endGame('time');
    }
  }

  private createUi(): void {
    this.scoreText = this.add
      .text(24, 20, 'Score : 0', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2d3a4a',
        strokeThickness: 6,
      })
      .setDepth(50);

    // Bannière x2 sous le score, cachée par défaut, clignote quand active
    this.multiplierBanner = this.add
      .text(24, 76, `SCORE x${BONUS_X2_FACTOR} !`, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffd700',
        stroke: '#2d3a4a',
        strokeThickness: 6,
      })
      .setDepth(50)
      .setVisible(false);
    this.tweens.add({
      targets: this.multiplierBanner,
      alpha: 0.45,
      duration: 300,
      yoyo: true,
      repeat: -1,
    });

    if (this.mode === 'classic') {
      this.createLifeCrosses();
    } else {
      this.infoText = this.add
        .text(this.scale.width - 24, 20, '60 s', {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '44px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2d3a4a',
          strokeThickness: 6,
        })
        .setOrigin(1, 0)
        .setDepth(50);
    }

    createMuteButton(this, 52, this.scale.height - 52);
  }

  /**
   * Croix de vie (strikes) façon Fruit Ninja : trois croix éteintes en
   * haut à droite. Chaque fruit manqué en allume une en rouge avec un
   * "pop", jusqu'au game over — plus lisible que des cœurs qui disparaissent.
   */
  private createLifeCrosses(): void {
    this.lifeCrosses = [];
    const gap = 52;
    const rightEdge = this.scale.width - 30;
    for (let i = 0; i < STARTING_LIVES; i++) {
      // i = 0 le plus à gauche : les croix s'allument de gauche à droite
      const x = rightEdge - (STARTING_LIVES - 1 - i) * gap;
      const cross = this.add
        .text(x, 22, '✕', {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '46px',
          fontStyle: 'bold',
          color: '#55697a', // gris-bleu éteint : "vie encore disponible"
          stroke: '#2d3a4a',
          strokeThickness: 6,
        })
        .setOrigin(0.5, 0)
        .setDepth(50)
        .setAlpha(0.5);
      this.lifeCrosses.push(cross);
    }
  }

  /**
   * Taches de jus persistantes : pool d'images recyclées en round-robin
   * (la plus ancienne est réutilisée), teintées à la couleur du fruit.
   * Elles s'estompent lentement et racontent la partie sur le décor.
   */
  private createSplatPool(): void {
    this.splatPool = [];
    this.nextSplatIndex = 0;
    for (let i = 0; i < SPLAT_POOL_SIZE; i++) {
      const splat = this.add
        .image(0, 0, `${TEX_SPLAT_PREFIX}0`)
        .setDepth(DEPTH_SPLAT)
        .setVisible(false);
      this.splatPool.push(splat);
    }
  }

  private spawnSplat(x: number, y: number, color: number): void {
    const splat = this.splatPool[this.nextSplatIndex];
    this.nextSplatIndex = (this.nextSplatIndex + 1) % SPLAT_POOL_SIZE;
    this.tweens.killTweensOf(splat); // la tache recyclée abandonne son fondu en cours
    splat
      .setTexture(`${TEX_SPLAT_PREFIX}${Phaser.Math.Between(0, SPLAT_VARIANTS - 1)}`)
      .setPosition(x, y)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(Phaser.Math.FloatBetween(0.7, 1.25))
      .setTint(color)
      .setAlpha(0.75)
      .setVisible(true);
    this.tweens.add({
      targets: splat,
      alpha: 0,
      duration: SPLAT_FADE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => splat.setVisible(false),
    });
  }

  /** Pool de textes flottants (+10, Combo x2…) — aucune création en partie. */
  private createPopupPool(): void {
    this.popupPool = [];
    for (let i = 0; i < POPUP_POOL_SIZE; i++) {
      const popup = this.add
        .text(0, 0, '', {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2d3a4a',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setVisible(false);
      this.popupPool.push(popup);
    }
  }

  /** Affiche un texte flottant qui monte et s'estompe (recycle le pool). */
  private showPopup(x: number, y: number, message: string, color: string, fontSize: number): void {
    const popup = this.popupPool.find((p) => !p.visible);
    if (popup === undefined) {
      return; // pool saturé : on saute ce feedback plutôt que d'allouer
    }
    popup
      .setText(message)
      .setColor(color)
      .setFontSize(fontSize)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.6)
      .setVisible(true);
    this.tweens.add({
      targets: popup,
      y: y - 90,
      alpha: 0,
      scale: 1,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.setVisible(false),
    });
  }

  private registerGameEvents(): void {
    this.events.on('score-changed', this.onScoreChanged, this);
    this.events.on('lives-changed', this.onLivesChanged, this);
    this.events.on('fruit-missed', this.onFruitMissed, this);
    this.events.on('game-over', this.onLivesDepleted, this);

    // Les listeners de this.events survivent au restart de la scène :
    // on les retire explicitement au shutdown pour éviter les doublons.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('score-changed', this.onScoreChanged, this);
      this.events.off('lives-changed', this.onLivesChanged, this);
      this.events.off('fruit-missed', this.onFruitMissed, this);
      this.events.off('game-over', this.onLivesDepleted, this);
    });
  }

  /** Slot de geste occupé par ce pointeur (recherche linéaire : 3 slots). */
  private findGesture(pointerId: number): SliceGesture | undefined {
    return this.gestures.find((g) => g.pointerId === pointerId);
  }

  private registerPointerEvents(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Réutilise le slot si ce pointeur en avait déjà un, sinon en prend un libre
      const gesture = this.findGesture(pointer.id) ?? this.gestures.find((g) => g.pointerId === null);
      if (gesture === undefined) {
        return; // plus de 3 doigts : les suivants sont ignorés
      }
      gesture.pointerId = pointer.id;
      gesture.comboCount = 0; // nouveau geste : le combo par swipe repart de zéro
      gesture.trail.clear();
      gesture.lastX = pointer.x;
      gesture.lastY = pointer.y;
      gesture.lastTime = this.time.now;
      gesture.trail.addPoint(pointer.x, pointer.y, this.time.now);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) {
        return;
      }
      const gesture = this.findGesture(pointer.id);
      if (gesture === undefined) {
        return;
      }
      this.handleSliceMove(gesture, pointer);
    });

    // Doigt levé : on évalue le combo de ce geste, puis le slot redevient libre
    const endSlice = (pointer: Phaser.Input.Pointer): void => {
      const gesture = this.findGesture(pointer.id);
      if (gesture !== undefined) {
        this.celebrateGestureCombo(gesture);
        gesture.pointerId = null;
      }
    };
    this.input.on('pointerup', endSlice);
    this.input.on('pointerupoutside', endSlice);
  }

  /**
   * À chaque déplacement du pointeur pendant un geste :
   * 1. on ajoute le point à la traînée visuelle,
   * 2. on teste le segment [dernier point → point courant] contre fruits ET
   *    bombes, mais seulement si le geste est assez rapide — un doigt posé
   *    immobile sur l'écran ne doit pas couper.
   */
  private handleSliceMove(gesture: SliceGesture, pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) {
      return;
    }
    const now = this.time.now;
    const distance = Phaser.Math.Distance.Between(gesture.lastX, gesture.lastY, pointer.x, pointer.y);
    const elapsed = Math.max(now - gesture.lastTime, 1);
    const speed = distance / elapsed; // px par ms

    gesture.trail.addPoint(pointer.x, pointer.y, now);

    if (speed >= SLICE_MIN_SPEED) {
      // Angle du geste : les moitiés s'écarteront perpendiculairement à lui
      const sliceAngle = Math.atan2(pointer.y - gesture.lastY, pointer.x - gesture.lastX);
      this.sliceDetector.checkSegment<Fruit>(
        gesture.lastX,
        gesture.lastY,
        pointer.x,
        pointer.y,
        this.fruits,
        (fruit) => this.onFruitSliced(fruit, gesture, now, sliceAngle)
      );
      this.sliceDetector.checkSegment<Bomb>(
        gesture.lastX,
        gesture.lastY,
        pointer.x,
        pointer.y,
        this.bombs,
        (bomb) => this.onBombSliced(bomb)
      );
    }

    gesture.lastX = pointer.x;
    gesture.lastY = pointer.y;
    gesture.lastTime = now;
  }

  /** Un fruit vient d'être tranché : score, combo, coup critique, jus, moitiés. */
  private onFruitSliced(fruit: Fruit, gesture: SliceGesture, now: number, sliceAngle: number): void {
    if (this.gameEnded) {
      return;
    }

    // Suivi du combo par geste et des statistiques de fin
    gesture.comboCount++;
    this.fruitsSliced++;
    this.bestGestureCombo = Math.max(this.bestGestureCombo, gesture.comboCount);

    // Le combava doré active le multiplicateur AVANT le crédit des points :
    // sa propre coupe profite déjà du x2.
    if (fruit.isBonus) {
      this.activateBonus(fruit);
    }

    // Coup critique : bonus rare et appuyé (jamais sur le combava, déjà spécial)
    const isCrit = !fruit.isBonus && Math.random() < CRIT_CHANCE;
    const comboBonus = (this.comboManager.registerSlice(now) - 1) * COMBO_BONUS_PER_STEP;
    let points = SCORE_PER_FRUIT + comboBonus;
    if (isCrit) {
      points *= CRIT_MULTIPLIER;
    }
    const awarded = this.scoreManager.addScore(points);

    // Jus au point d'impact (teinté) + tache persistante sur le décor
    this.juiceEmitter.setParticleTint(fruit.juiceColor);
    this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT);
    this.spawnSplat(fruit.x, fruit.y, fruit.juiceColor);

    if (isCrit) {
      // Coup critique : popup doré, double jet de jus et son dédié
      this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT);
      this.showPopup(fruit.x, fruit.y - 20, `CRITIQUE ! +${awarded}`, '#ffd700', 46);
      sfx.crit();
    } else {
      this.showPopup(fruit.x, fruit.y - 20, `+${awarded}`, '#ffffff', 40);
    }

    sfx.slice();
    this.spawnHalves(fruit, sliceAngle);
    fruit.kill();
  }

  /**
   * Fin d'un geste : si le doigt a tranché GESTURE_COMBO_MIN fruits ou plus
   * dans le même swipe, on célèbre en grand (bannière centrée + bonus + son)
   * — la signature de Fruit Ninja, « couper plein de fruits d'un coup ».
   */
  private celebrateGestureCombo(gesture: SliceGesture): void {
    if (this.gameEnded || gesture.comboCount < GESTURE_COMBO_MIN) {
      return;
    }
    const n = gesture.comboCount;
    const awarded = this.scoreManager.addScore(n * GESTURE_COMBO_BONUS);
    this.showBigBanner(`COMBO x${n} !\n+${awarded}`);
    sfx.bigCombo(n);
  }

  /** Bannière centrée éphémère (gros combo) : apparition en "pop" puis fondu. */
  private showBigBanner(message: string): void {
    const banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, message, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '76px',
        fontStyle: 'bold',
        color: '#ffe066',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.3);
    this.tweens.add({
      targets: banner,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          scale: 1.15,
          delay: 350,
          duration: 350,
          onComplete: () => banner.destroy(),
        });
      },
    });
  }

  /** Combava doré tranché : score x2 temporaire + feedback doré appuyé. */
  private activateBonus(fruit: Fruit): void {
    this.scoreManager.activateMultiplier(BONUS_X2_FACTOR, BONUS_X2_DURATION_MS);
    this.showPopup(fruit.x, fruit.y - 160, 'COMBAVA DORÉ !', '#ffd700', 48);
    sfx.bonus();

    // Gros jet de jus doré en plus du jus normal
    this.juiceEmitter.setParticleTint(0xffd700);
    this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT * 2);

    // Bannière x2 affichée pendant toute la durée du multiplicateur ;
    // un nouveau combava pendant la fenêtre repousse simplement l'échéance.
    this.multiplierBanner.setVisible(true);
    if (this.multiplierTimer !== null) {
      this.multiplierTimer.remove();
    }
    this.multiplierTimer = this.time.delayedCall(BONUS_X2_DURATION_MS, () => {
      this.multiplierBanner.setVisible(false);
      this.multiplierTimer = null;
    });
  }

  /**
   * Bombe tranchée : moment fatal théâtral — gerbe d'explosion, ralenti
   * (bullet-time sur les fruits en vol), zoom caméra, secousse, flash, puis
   * transition différée vers l'écran de fin.
   */
  private onBombSliced(bomb: Bomb): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    const bx = bomb.x;
    const by = bomb.y;
    bomb.kill();
    this.spawnManager.stop();
    // Tous les gestes en cours sont interrompus
    for (const gesture of this.gestures) {
      gesture.pointerId = null;
      gesture.trail.clear();
    }

    sfx.explosion();

    // Gerbe au point d'impact : fumée sombre + pluie d'étincelles
    this.juiceEmitter.setParticleTint(0x2a2a33);
    this.juiceEmitter.emitParticleAt(bx, by, JUICE_PARTICLE_COUNT * 2);
    this.fuseEmitter.emitParticleAt(bx, by, 26);

    // Bullet-time : la physique ralentit, les fruits en vol figent le temps
    this.physics.world.timeScale = BOMB_PHYSICS_SLOWMO;

    // Zoom caméra (centré → punch-in) + secousse + flash plein écran
    this.cameras.main.shake(450, 0.022);
    this.cameras.main.zoomTo(BOMB_ZOOM, BOMB_ZOOM_MS, 'Sine.easeInOut');
    this.flashRect.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.flashRect,
      alpha: 0,
      duration: BOMB_GAMEOVER_DELAY_MS,
      onComplete: () => this.flashRect.setVisible(false),
    });

    // Fin différée, un peu allongée pour savourer le ralenti et le zoom
    this.time.delayedCall(BOMB_GAMEOVER_DELAY_MS + 350, () => this.endGame('bomb'));
  }

  /**
   * Remplace le fruit par deux moitiés qui s'écartent PERPENDICULAIREMENT
   * au geste (comme dans Fruit Ninja : on coupe selon l'angle du swipe).
   *
   * Géométrie : la face de coupe des textures est verticale ; une rotation
   * de (angle + 90°) l'aligne sur la direction du geste. La normale à la
   * coupe est n = (-sin a, cos a) : la moitié "gauche" (face de coupe à
   * droite de sa texture) part côté -n, la droite côté +n.
   */
  private spawnHalves(fruit: Fruit, sliceAngle: number): void {
    const variety = fruit.getVariety();
    if (variety === null) {
      return; // impossible pour un fruit lancé, garde-fou de typage
    }
    const textures = halfTextureKeys(variety);
    const fruitBody = fruit.body as Phaser.Physics.Arcade.Body;
    const normalX = -Math.sin(sliceAngle);
    const normalY = Math.cos(sliceAngle);
    const sides: Array<{ texture: string; direction: number }> = [
      { texture: textures.left, direction: -1 },
      { texture: textures.right, direction: 1 },
    ];

    for (const side of sides) {
      const half = this.halves.get(fruit.x, fruit.y) as Phaser.Physics.Arcade.Sprite | null;
      if (half === null) {
        continue; // pool plein : on saute l'effet plutôt que d'allouer
      }
      half.setTexture(side.texture);
      half.enableBody(true, fruit.x, fruit.y, true, true);
      half.setAlpha(1);
      half.setDepth(DEPTH_HALF);
      half.setRotation(sliceAngle + Math.PI / 2);
      // Impulsion de séparation le long de la normale à la coupe,
      // ajoutée à une fraction de l'élan du fruit.
      const separation = Phaser.Math.Between(110, 210);
      half.setVelocity(
        fruitBody.velocity.x * 0.35 + side.direction * normalX * separation,
        fruitBody.velocity.y * 0.35 + side.direction * normalY * separation - Phaser.Math.Between(20, 80)
      );
      half.setAngularVelocity(side.direction * Phaser.Math.Between(140, 300));

      // Le tween (une allocation par coupe, pas par frame) gère le fondu
      // puis rend la moitié au pool.
      this.tweens.add({
        targets: half,
        alpha: 0,
        duration: HALF_LIFETIME_MS,
        onComplete: () => {
          half.disableBody(true, true);
        },
      });
    }
  }

  private onScoreChanged(score: number): void {
    this.scoreText.setText(`Score : ${score}`);
  }

  private onLivesChanged(lives: number): void {
    if (this.mode !== 'classic') {
      return;
    }
    // Allume la croix correspondant au strike qui vient de tomber
    const filled = STARTING_LIVES - Math.max(lives, 0);
    const cross = this.lifeCrosses[filled - 1];
    if (cross === undefined) {
      return;
    }
    cross.setColor('#ff3b3b').setAlpha(1).setScale(1.8);
    this.tweens.add({
      targets: cross,
      scale: 1,
      duration: 350,
      ease: 'Back.easeOut', // rebond franc : le strike "claque"
    });
  }

  private onFruitMissed(fruit: Fruit): void {
    // En mode Chrono, un fruit manqué est sans conséquence ;
    // un combava manqué non plus (c'était un cadeau, pas une obligation).
    if (this.gameEnded || this.mode === 'chrono' || fruit.isBonus) {
      return;
    }
    sfx.lifeLost();
    this.scoreManager.loseLife();
  }

  /** Événement 'game-over' du ScoreManager : plus de vies (mode Classique). */
  private onLivesDepleted(): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    this.spawnManager.stop();
    // Court délai pour que le joueur voie son dernier cœur disparaître
    this.time.delayedCall(400, () => this.endGame('lives'));
  }

  private endGame(reason: GameOverReason): void {
    this.scene.start('GameOverScene', {
      score: this.scoreManager.getScore(),
      mode: this.mode,
      reason,
      fruitsSliced: this.fruitsSliced,
      bestCombo: this.bestGestureCombo,
    });
  }
}
