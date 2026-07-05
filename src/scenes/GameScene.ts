import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { SliceTrail } from '../entities/SliceTrail';
import { SliceDetector } from '../systems/SliceDetector';
import { ScoreManager } from '../systems/ScoreManager';
import { ComboManager } from '../systems/ComboManager';
import { SpawnManager } from '../systems/SpawnManager';
import {
  GAME_WIDTH,
  FRUIT_POOL_SIZE,
  HALF_POOL_SIZE,
  HALF_LIFETIME_MS,
  SCORE_PER_FRUIT,
  SLICE_MIN_SPEED,
  STARTING_LIVES,
  TEX_FRUIT_WHOLE,
  TEX_FRUIT_HALF_LEFT,
  TEX_FRUIT_HALF_RIGHT,
} from '../utils/constants';

/**
 * Scène de jeu principale : boucle spawn → swipe → coupe → score.
 *
 * Architecture : la scène orchestre des systèmes découplés
 * (SpawnManager, SliceDetector, ScoreManager, ComboManager) qui
 * communiquent via les événements de scène quand c'est pertinent.
 */
export class GameScene extends Phaser.Scene {
  private fruits!: Phaser.Physics.Arcade.Group;
  private halves!: Phaser.Physics.Arcade.Group;
  private sliceTrail!: SliceTrail;
  private sliceDetector!: SliceDetector;
  private scoreManager!: ScoreManager;
  private comboManager!: ComboManager;
  private spawnManager!: SpawnManager;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  // État du geste en cours (position/temps du dernier point enregistré)
  private slicing = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastPointerTime = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);

    // Pools de sprites : les fruits et moitiés sont recyclés, jamais détruits,
    // pour éviter les allocations/GC en cours de partie (objectif 60 FPS mobile).
    this.fruits = this.physics.add.group({
      classType: Fruit,
      defaultKey: TEX_FRUIT_WHOLE,
      maxSize: FRUIT_POOL_SIZE,
    });
    this.halves = this.physics.add.group({
      defaultKey: TEX_FRUIT_HALF_LEFT,
      maxSize: HALF_POOL_SIZE,
    });

    this.scoreManager = new ScoreManager(this);
    this.comboManager = new ComboManager();
    this.sliceDetector = new SliceDetector();
    this.sliceTrail = new SliceTrail(this);
    this.spawnManager = new SpawnManager(this, this.fruits, this.scoreManager);

    this.createUi();
    this.registerGameEvents();
    this.registerPointerEvents();

    this.spawnManager.start();
  }

  update(): void {
    this.sliceTrail.update(this.time.now);
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

    this.livesText = this.add
      .text(GAME_WIDTH - 24, 20, '♥'.repeat(STARTING_LIVES), {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '44px',
        color: '#ff5252',
        stroke: '#2d3a4a',
        strokeThickness: 6,
      })
      .setOrigin(1, 0)
      .setDepth(50);
  }

  private registerGameEvents(): void {
    this.events.on('score-changed', this.onScoreChanged, this);
    this.events.on('lives-changed', this.onLivesChanged, this);
    this.events.on('fruit-missed', this.onFruitMissed, this);
    this.events.on('game-over', this.onGameOver, this);

    // Les listeners de this.events survivent au restart de la scène :
    // on les retire explicitement au shutdown pour éviter les doublons.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('score-changed', this.onScoreChanged, this);
      this.events.off('lives-changed', this.onLivesChanged, this);
      this.events.off('fruit-missed', this.onFruitMissed, this);
      this.events.off('game-over', this.onGameOver, this);
    });
  }

  private registerPointerEvents(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.slicing = true;
      this.sliceTrail.clear();
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.lastPointerTime = this.time.now;
      this.sliceTrail.addPoint(pointer.x, pointer.y, this.time.now);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.slicing || !pointer.isDown) {
        return;
      }
      this.handleSliceMove(pointer);
    });

    const endSlice = (): void => {
      this.slicing = false;
    };
    this.input.on('pointerup', endSlice);
    this.input.on('pointerupoutside', endSlice);
  }

  /**
   * À chaque déplacement du pointeur pendant un geste :
   * 1. on ajoute le point à la traînée visuelle,
   * 2. on teste le segment [dernier point → point courant] contre les fruits,
   *    mais seulement si le geste est assez rapide — un doigt posé immobile
   *    sur l'écran ne doit pas couper.
   */
  private handleSliceMove(pointer: Phaser.Input.Pointer): void {
    const now = this.time.now;
    const distance = Phaser.Math.Distance.Between(
      this.lastPointerX,
      this.lastPointerY,
      pointer.x,
      pointer.y
    );
    const elapsed = Math.max(now - this.lastPointerTime, 1);
    const speed = distance / elapsed; // px par ms

    this.sliceTrail.addPoint(pointer.x, pointer.y, now);

    if (speed >= SLICE_MIN_SPEED) {
      this.sliceDetector.checkSegment(
        this.lastPointerX,
        this.lastPointerY,
        pointer.x,
        pointer.y,
        this.fruits,
        (fruit) => this.onFruitSliced(fruit, now)
      );
    }

    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.lastPointerTime = now;
  }

  /** Un fruit vient d'être tranché : score, combo, et les deux moitiés. */
  private onFruitSliced(fruit: Fruit, now: number): void {
    this.comboManager.registerSlice(now); // comptage seulement en Phase 1
    this.scoreManager.addScore(SCORE_PER_FRUIT);
    this.spawnHalves(fruit);
    fruit.kill();
  }

  /**
   * Remplace le fruit par deux moitiés qui partent chacune de leur côté
   * avec rotation, puis s'estompent avant de retourner au pool.
   */
  private spawnHalves(fruit: Fruit): void {
    const fruitBody = fruit.body as Phaser.Physics.Arcade.Body;
    const sides: Array<{ texture: string; direction: number }> = [
      { texture: TEX_FRUIT_HALF_LEFT, direction: -1 },
      { texture: TEX_FRUIT_HALF_RIGHT, direction: 1 },
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
    this.livesText.setText('♥'.repeat(Math.max(lives, 0)));
  }

  private onFruitMissed(): void {
    this.scoreManager.loseLife();
  }

  private onGameOver(score: number): void {
    this.spawnManager.stop();
    this.scene.start('GameOverScene', { score });
  }
}
