import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { ScoreManager } from './ScoreManager';
import { sfx } from './SfxManager';
import {
  FRUIT_RADIUS,
  GRAVITY_Y,
  APEX_FRACTION_MIN,
  APEX_FRACTION_MAX,
  LAUNCH_VX_FACTOR,
  SPAWN_INTERVAL_START_MS,
  SPAWN_INTERVAL_MIN_MS,
  SPAWN_SCORE_STEP,
  SPAWN_INTERVAL_DECREMENT_MS,
  SPAWN_MAX_FRUITS_PER_WAVE_CAP,
  SPAWN_STAGGER_MIN_MS,
  SPAWN_STAGGER_MAX_MS,
  SPAWN_GENTLE_WAVES,
  SPAWN_WARMUP_WAVES,
  BOMB_SAFE_WAVES,
  BOMB_CHANCE_BASE,
  BOMB_CHANCE_PER_TIER,
  BOMB_CHANCE_CAP,
  BOMB_SAFE_TIME_MS,
  BONUS_CHANCE,
  BONUS_SAFE_TIME_MS,
} from '../utils/constants';
import { pickRandomVariety, BONUS_VARIETY } from '../utils/fruitCatalog';

/** Paramètres de lancement calculés une fois par spawn (objet réutilisé). */
interface LaunchParams {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

/**
 * Orchestration du spawn des fruits et bombes, avec le pacing de Fruit Ninja.
 *
 * Physique : les projectiles partent du bas de l'écran avec une vélocité
 * verticale forte — la gravité (volontairement douce) leur donne un vrai
 * temps de suspension à l'apex, fenêtre de tir confortable.
 *
 * Courbe d'introduction (par index de vague, indépendante du score) :
 * - vagues 1 à SPAWN_GENTLE_WAVES : un seul fruit, intervalle rallongé ;
 * - jusqu'à SPAWN_WARMUP_WAVES : 1 à 2 fruits ;
 * - ensuite : salves de 2 à N fruits (N croît avec le score par paliers
 *   de SPAWN_SCORE_STEP points, plafonné) ;
 * - aucune bombe avant la vague BOMB_SAFE_WAVES + garde temporelle.
 *
 * Les lancers d'une même salve sont échelonnés de 80 à 150 ms : jamais
 * simultanés, chaque départ a son "whoosh" — c'est l'anticipation qui
 * fait lever les yeux du joueur.
 */
export class SpawnManager {
  private timer: Phaser.Time.TimerEvent | null = null;
  private running = false;
  private startTime = 0;
  private waveIndex = 0;
  private readonly launchParams: LaunchParams = { x: 0, y: 0, velocityX: 0, velocityY: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fruits: Phaser.Physics.Arcade.Group,
    private readonly bombs: Phaser.Physics.Arcade.Group,
    private readonly scoreManager: ScoreManager
  ) {}

  start(): void {
    this.running = true;
    this.startTime = this.scene.time.now;
    this.waveIndex = 0;
    this.scheduleNextWave();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.timer.remove();
      this.timer = null;
    }
  }

  /** Palier de difficulté courant, dérivé du score. */
  private getDifficultyTier(): number {
    return Math.floor(this.scoreManager.getScore() / SPAWN_SCORE_STEP);
  }

  private getSpawnInterval(): number {
    const base = Math.max(
      SPAWN_INTERVAL_MIN_MS,
      SPAWN_INTERVAL_START_MS - this.getDifficultyTier() * SPAWN_INTERVAL_DECREMENT_MS
    );
    // Découverte : les toutes premières vagues laissent respirer
    return this.waveIndex < SPAWN_GENTLE_WAVES ? base + 250 : base;
  }

  /** Taille de la salve selon la phase d'introduction puis le score. */
  private getWaveSize(): number {
    if (this.waveIndex <= SPAWN_GENTLE_WAVES) {
      return 1;
    }
    if (this.waveIndex <= SPAWN_WARMUP_WAVES) {
      return Phaser.Math.Between(1, 2);
    }
    const maxPerWave = Math.min(SPAWN_MAX_FRUITS_PER_WAVE_CAP, 2 + Math.floor(this.getDifficultyTier() / 2));
    return Phaser.Math.Between(2, maxPerWave);
  }

  /** Probabilité qu'un lancer soit une bombe plutôt qu'un fruit. */
  private getBombChance(): number {
    if (
      this.waveIndex <= BOMB_SAFE_WAVES ||
      this.scene.time.now - this.startTime < BOMB_SAFE_TIME_MS
    ) {
      return 0; // introduction : le joueur prend ses marques sans menace
    }
    return Math.min(BOMB_CHANCE_CAP, BOMB_CHANCE_BASE + this.getDifficultyTier() * BOMB_CHANCE_PER_TIER);
  }

  /**
   * Planifie la prochaine salve. On re-planifie après chaque salve (plutôt
   * qu'un timer en boucle) pour que l'intervalle suive la difficulté en direct.
   */
  private scheduleNextWave(): void {
    if (!this.running) {
      return;
    }
    this.timer = this.scene.time.delayedCall(this.getSpawnInterval(), () => {
      this.spawnWave();
      this.scheduleNextWave();
    });
  }

  /**
   * Une salve : la composition (fruit/bombe) est tirée immédiatement mais
   * les départs sont échelonnés — chaque callback revérifie `running`
   * pour qu'un game over annule les lancers encore en attente.
   */
  private spawnWave(): void {
    this.waveIndex += 1;
    const count = this.getWaveSize();
    const bombChance = this.getBombChance();

    let delay = 0;
    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < bombChance;
      if (i === 0) {
        this.spawnOne(isBomb);
      } else {
        delay += Phaser.Math.Between(SPAWN_STAGGER_MIN_MS, SPAWN_STAGGER_MAX_MS);
        this.scene.time.delayedCall(delay, () => {
          if (this.running) {
            this.spawnOne(isBomb);
          }
        });
      }
    }
    this.maybeSpawnBonus();
  }

  private spawnOne(isBomb: boolean): void {
    if (isBomb) {
      this.spawnBomb();
    } else {
      this.spawnFruit();
    }
  }

  /** Tente un combava doré : rare, pas en début de partie, unique à l'écran. */
  private maybeSpawnBonus(): void {
    if (this.scene.time.now - this.startTime < BONUS_SAFE_TIME_MS) {
      return;
    }
    if (Math.random() >= BONUS_CHANCE) {
      return;
    }
    // Un seul combava actif à la fois pour préserver sa rareté
    const children = this.fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const fruit = children[i] as Fruit;
      if (fruit.active && fruit.isBonus) {
        return;
      }
    }
    const bonus = this.fruits.get() as Fruit | null;
    if (bonus === null) {
      return;
    }
    const p = this.computeLaunch();
    bonus.launchAs(BONUS_VARIETY, true, p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }

  /**
   * Calcule position et vélocités de lancement dans un objet réutilisé,
   * à partir de la taille COURANTE de l'écran (responsive) :
   * - départ juste sous le bord bas ;
   * - vélocité verticale telle que l'apex atteigne une fraction de la hauteur
   *   (v = √(2·g·apex)) — les arcs remplissent l'écran en portrait comme en
   *   paysage sans jamais sortir par le haut ;
   * - vélocité horizontale orientée vers le centre, proportionnelle à la
   *   largeur, pour que la parabole reste dans l'écran.
   */
  private computeLaunch(): LaunchParams {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const p = this.launchParams;

    p.x = Phaser.Math.Between(FRUIT_RADIUS * 2, width - FRUIT_RADIUS * 2);
    p.y = height + FRUIT_RADIUS;

    const apex = Phaser.Math.FloatBetween(APEX_FRACTION_MIN, APEX_FRACTION_MAX) * height;
    p.velocityY = -Math.sqrt(2 * GRAVITY_Y * apex);

    const towardCenter = p.x < width / 2 ? 1 : -1;
    p.velocityX = towardCenter * Phaser.Math.Between(20, Math.round(width * LAUNCH_VX_FACTOR));
    return p;
  }

  private spawnFruit(): void {
    // get() récupère un objet inactif du pool (ou en crée un si le pool n'est pas plein)
    const fruit = this.fruits.get() as Fruit | null;
    if (fruit === null) {
      return; // pool épuisé : on saute ce spawn plutôt que d'allouer
    }
    const p = this.computeLaunch();
    fruit.launchAs(pickRandomVariety(), false, p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }

  private spawnBomb(): void {
    const bomb = this.bombs.get() as Bomb | null;
    if (bomb === null) {
      return;
    }
    const p = this.computeLaunch();
    bomb.launch(p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }
}
