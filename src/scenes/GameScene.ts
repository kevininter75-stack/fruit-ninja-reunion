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
import {
  GAME_WIDTH,
  GAME_HEIGHT,
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
  COMBO_BONUS_PER_STEP,
  CHRONO_DURATION_MS,
  POPUP_POOL_SIZE,
  BONUS_X2_FACTOR,
  BONUS_X2_DURATION_MS,
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
  private flashRect!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text; // vies (classique) ou compte à rebours (chrono)
  private multiplierBanner!: Phaser.GameObjects.Text;
  private multiplierTimer: Phaser.Time.TimerEvent | null = null;
  private popupPool: Phaser.GameObjects.Text[] = [];

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
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);
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
      .setDepth(40);

    // Flash blanc plein écran (bombe) — créé une fois, réactivé au besoin
    this.flashRect = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1)
      .setOrigin(0)
      .setDepth(200)
      .setVisible(false)
      .setAlpha(0);

    this.createUi();
    this.createPopupPool();
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
    if (this.mode === 'chrono' && !this.gameEnded) {
      this.updateChrono();
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

    const infoContent = this.mode === 'classic' ? '♥'.repeat(STARTING_LIVES) : '60 s';
    const infoColor = this.mode === 'classic' ? '#ff5252' : '#ffffff';
    this.infoText = this.add
      .text(GAME_WIDTH - 24, 20, infoContent, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: infoColor,
        stroke: '#2d3a4a',
        strokeThickness: 6,
      })
      .setOrigin(1, 0)
      .setDepth(50);

    createMuteButton(this, 52, GAME_HEIGHT - 52);
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

    // Doigt levé : le slot redevient libre, la traînée s'éteint d'elle-même
    const endSlice = (pointer: Phaser.Input.Pointer): void => {
      const gesture = this.findGesture(pointer.id);
      if (gesture !== undefined) {
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
      this.sliceDetector.checkSegment<Fruit>(
        gesture.lastX,
        gesture.lastY,
        pointer.x,
        pointer.y,
        this.fruits,
        (fruit) => this.onFruitSliced(fruit, now)
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

  /** Un fruit vient d'être tranché : score, combo, jus, son et moitiés. */
  private onFruitSliced(fruit: Fruit, now: number): void {
    if (this.gameEnded) {
      return;
    }

    // Le combava doré active le multiplicateur AVANT le crédit des points :
    // sa propre coupe profite déjà du x2.
    if (fruit.isBonus) {
      this.activateBonus(fruit);
    }

    const combo = this.comboManager.registerSlice(now);
    const bonus = (combo - 1) * COMBO_BONUS_PER_STEP;
    const awarded = this.scoreManager.addScore(SCORE_PER_FRUIT + bonus);

    // Jus au point d'impact, teinté à la couleur du fruit
    this.juiceEmitter.setParticleTint(fruit.juiceColor);
    this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT);

    this.showPopup(fruit.x, fruit.y - 20, `+${awarded}`, '#ffffff', 40);
    if (combo >= 2) {
      this.showPopup(fruit.x, fruit.y - 100, `Combo x${combo} !`, '#ffe066', 54);
      sfx.combo(combo);
    }
    sfx.slice();

    this.spawnHalves(fruit);
    fruit.kill();
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

  /** Bombe tranchée : flash, secousse, explosion, fin de partie différée. */
  private onBombSliced(bomb: Bomb): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    bomb.kill();
    this.spawnManager.stop();
    // Tous les gestes en cours sont interrompus
    for (const gesture of this.gestures) {
      gesture.pointerId = null;
      gesture.trail.clear();
    }

    sfx.explosion();
    this.cameras.main.shake(400, 0.02);
    this.flashRect.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.flashRect,
      alpha: 0,
      duration: BOMB_GAMEOVER_DELAY_MS - 100,
      onComplete: () => this.flashRect.setVisible(false),
    });

    // Petit délai pour laisser le flash et la secousse se lire avant l'écran de fin
    this.time.delayedCall(BOMB_GAMEOVER_DELAY_MS, () => this.endGame('bomb'));
  }

  /**
   * Remplace le fruit par deux moitiés de sa variété qui partent chacune
   * de leur côté avec rotation, puis s'estompent avant de retourner au pool.
   */
  private spawnHalves(fruit: Fruit): void {
    const variety = fruit.getVariety();
    if (variety === null) {
      return; // impossible pour un fruit lancé, garde-fou de typage
    }
    const textures = halfTextureKeys(variety);
    const fruitBody = fruit.body as Phaser.Physics.Arcade.Body;
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
      // Chaque moitié hérite d'une partie de la vélocité du fruit et
      // part latéralement de son côté, avec une rotation opposée.
      half.setVelocity(
        side.direction * Phaser.Math.Between(90, 200),
        fruitBody.velocity.y * 0.4 - Phaser.Math.Between(40, 140)
      );
      half.setAngularVelocity(side.direction * Phaser.Math.Between(160, 320));

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
    if (this.mode === 'classic') {
      this.infoText.setText('♥'.repeat(Math.max(lives, 0)));
    }
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
    });
  }
}
