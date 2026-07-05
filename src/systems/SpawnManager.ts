import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
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
} from '../utils/constants';

/**
 * Orchestration du spawn des fruits avec difficulté progressive.
 *
 * Fonctionnement : les fruits partent du bas de l'écran (sous le bord visible)
 * avec une vélocité verticale forte (vers le haut) et une composante horizontale
 * orientée vers le centre — la gravité Arcade fait le reste (parabole).
 *
 * Difficulté : à chaque palier de SPAWN_SCORE_STEP points,
 * - l'intervalle entre les salves diminue (plancher SPAWN_INTERVAL_MIN_MS),
 * - le nombre max de fruits par salve augmente (plafond SPAWN_MAX_FRUITS_PER_WAVE_CAP).
 *
 * TODO Phase 2 : spawn de bombes avec ratio croissant, fruit bonus "combava doré".
 */
export class SpawnManager {
  private timer: Phaser.Time.TimerEvent | null = null;
  private running = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fruits: Phaser.Physics.Arcade.Group,
    private readonly scoreManager: ScoreManager
  ) {}

  start(): void {
    this.running = true;
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
    // Un fruit de plus par tranche de 2 paliers (500 pts → 1000 pts → ...)
    return Math.min(
      SPAWN_MAX_FRUITS_PER_WAVE_CAP,
      SPAWN_MAX_FRUITS_PER_WAVE_START + Math.floor(this.getDifficultyTier() / 2)
    );
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
    for (let i = 0; i < count; i++) {
      this.spawnFruit();
    }
  }

  private spawnFruit(): void {
    // get() récupère un fruit inactif du pool (ou en crée un si le pool n'est pas plein)
    const fruit = this.fruits.get() as Fruit | null;
    if (fruit === null) {
      return; // pool épuisé : on saute ce spawn plutôt que d'allouer
    }

    const x = Phaser.Math.Between(FRUIT_RADIUS * 2, GAME_WIDTH - FRUIT_RADIUS * 2);
    const y = GAME_HEIGHT + FRUIT_RADIUS; // juste sous le bord visible

    // Vélocité horizontale orientée vers le centre pour que la parabole
    // reste dans l'écran (un fruit lancé du bord gauche part vers la droite).
    const towardCenter = x < GAME_WIDTH / 2 ? 1 : -1;
    const velocityX = towardCenter * Phaser.Math.Between(20, LAUNCH_VELOCITY_X_MAX);
    const velocityY = Phaser.Math.Between(LAUNCH_VELOCITY_Y_MAX, LAUNCH_VELOCITY_Y_MIN);

    fruit.launch(x, y, velocityX, velocityY);
  }
}
