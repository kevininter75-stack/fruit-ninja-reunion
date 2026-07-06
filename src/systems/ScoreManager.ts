import Phaser from 'phaser';
import { STARTING_LIVES } from '../utils/constants';

/**
 * Gère le score, les vies et le multiplicateur temporaire (combava doré).
 * Émet des événements de scène pour que l'UI se mette à jour sans couplage direct :
 * - 'score-changed' (score: number)
 * - 'lives-changed' (lives: number)
 * - 'game-over' (score: number)
 */
export class ScoreManager {
  private score = 0;
  private lives = STARTING_LIVES;
  private multiplier = 1;
  private multiplierUntil = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  getScore(): number {
    return this.score;
  }

  getLives(): number {
    return this.lives;
  }

  /** Multiplicateur courant — retombe à 1 tout seul à expiration. */
  getMultiplier(): number {
    if (this.scene.time.now > this.multiplierUntil) {
      this.multiplier = 1;
    }
    return this.multiplier;
  }

  /** Active un multiplicateur de score pour une durée donnée (fruit bonus). */
  activateMultiplier(factor: number, durationMs: number): void {
    this.multiplier = factor;
    this.multiplierUntil = this.scene.time.now + durationMs;
  }

  /**
   * Ajoute des points (multiplicateur appliqué) et renvoie le montant
   * réellement crédité — c'est lui qu'affichent les popups.
   */
  addScore(points: number): number {
    const awarded = points * this.getMultiplier();
    this.score += awarded;
    this.scene.events.emit('score-changed', this.score);
    return awarded;
  }

  loseLife(): void {
    if (this.lives <= 0) {
      return;
    }
    this.lives -= 1;
    this.scene.events.emit('lives-changed', this.lives);
    if (this.lives === 0) {
      this.scene.events.emit('game-over', this.score);
    }
  }
}
