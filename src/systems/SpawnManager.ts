import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { ScoreManager } from './ScoreManager';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FRUIT_RADIUS,
  LAUNCH_VELOCITY_Y_MIN,
  LAUNCH_VELOCITY_Y_MAX,
  LAUNCH_VELOCITY_X_MAX,
  SPAWN_INTERVAL_START_MS,
  SPAWN_INTERVAL_MIN_MS,
  SPAWN_SCORE_STEP,
  SPAWN_INTERVAL_DECREMENT_MS,
  SPAWN_MAX_FRUITS_PER_WAVE_START,
  SPAWN_MAX_FRUITS_PER_WAVE_CAP,
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
  velocityX: number;
  velocityY: number;
}

/**
 * Orchestration du spawn des fruits et bombes avec difficulté progressive.
 *
 * Fonctionnement : les projectiles partent du bas de l'écran (sous le bord
 * visible) avec une vélocité verticale forte (vers le haut) et une composante
 * horizontale orientée vers le centre — la gravité Arcade fait le reste.
 *
 * Difficulté : à chaque palier de SPAWN_SCORE_STEP points,
 * - l'intervalle entre les salves diminue (plancher SPAWN_INTERVAL_MIN_MS),
 * - le nombre max de projectiles par salve augmente (plafond _CAP),
 * - le ratio de bombes augmente légèrement (plafonné pour rester juste).
 * Aucune bombe pendant les BOMB_SAFE_TIME_MS premières millisecondes.
 *
 * Variétés : chaque fruit spawné tire une variété au poids dans le
 * catalogue réunionnais. Le combava doré (bonus score x2) a un spawn
 * dédié : rare, jamais en début de partie, un seul à l'écran à la fois.
 */
export class SpawnManager {
  private timer: Phaser.Time.TimerEvent | null = null;
  private running = false;
  private startTime = 0;
  private readonly launchParams: LaunchParams = { x: 0, velocityX: 0, velocityY: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fruits: Phaser.Physics.Arcade.Group,
    private readonly bombs: Phaser.Physics.Arcade.Group,
    private readonly scoreManager: ScoreManager
  ) {}

  start(): void {
    this.running = true;
    this.startTime = this.scene.time.now;
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
    return Math.max(
      SPAWN_INTERVAL_MIN_MS,
      SPAWN_INTERVAL_START_MS - this.getDifficultyTier() * SPAWN_INTERVAL_DECREMENT_MS
    );
  }

  private getMaxFruitsPerWave(): number {
    // Un projectile de plus par tranche de 2 paliers (500 pts → 1000 pts → ...)
    return Math.min(
      SPAWN_MAX_FRUITS_PER_WAVE_CAP,
      SPAWN_MAX_FRUITS_PER_WAVE_START + Math.floor(this.getDifficultyTier() / 2)
    );
  }

  /** Probabilité qu'un spawn soit une bombe plutôt qu'un fruit. */
  private getBombChance(): number {
    if (this.scene.time.now - this.startTime < BOMB_SAFE_TIME_MS) {
      return 0; // début de partie : le joueur prend ses marques
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

  private spawnWave(): void {
    const count = Phaser.Math.Between(1, this.getMaxFruitsPerWave());
    const bombChance = this.getBombChance();
    for (let i = 0; i < count; i++) {
      if (Math.random() < bombChance) {
        this.spawnBomb();
      } else {
        this.spawnFruit();
      }
    }
    this.maybeSpawnBonus();
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
    bonus.launchAs(BONUS_VARIETY, true, p.x, GAME_HEIGHT + FRUIT_RADIUS, p.velocityX, p.velocityY);
  }

  /**
   * Calcule position et vélocités de lancement dans un objet réutilisé.
   * Vélocité horizontale orientée vers le centre pour que la parabole
   * reste dans l'écran (un projectile lancé du bord gauche part vers la droite).
   */
  private computeLaunch(): LaunchParams {
    const p = this.launchParams;
    p.x = Phaser.Math.Between(FRUIT_RADIUS * 2, GAME_WIDTH - FRUIT_RADIUS * 2);
    const towardCenter = p.x < GAME_WIDTH / 2 ? 1 : -1;
    p.velocityX = towardCenter * Phaser.Math.Between(20, LAUNCH_VELOCITY_X_MAX);
    p.velocityY = Phaser.Math.Between(LAUNCH_VELOCITY_Y_MAX, LAUNCH_VELOCITY_Y_MIN);
    return p;
  }

  private spawnFruit(): void {
    // get() récupère un objet inactif du pool (ou en crée un si le pool n'est pas plein)
    const fruit = this.fruits.get() as Fruit | null;
    if (fruit === null) {
      return; // pool épuisé : on saute ce spawn plutôt que d'allouer
    }
    const p = this.computeLaunch();
    fruit.launchAs(pickRandomVariety(), false, p.x, GAME_HEIGHT + FRUIT_RADIUS, p.velocityX, p.velocityY);
  }

  private spawnBomb(): void {
    const bomb = this.bombs.get() as Bomb | null;
    if (bomb === null) {
      return;
    }
    const p = this.computeLaunch();
    bomb.launch(p.x, GAME_HEIGHT + FRUIT_RADIUS, p.velocityX, p.velocityY);
  }
}
