import Phaser from 'phaser';
import { STARTING_LIVES } from '../utils/constants';

/**
 * Gère le score et les vies de la partie en cours.
 * Émet des événements de scène pour que l'UI se mette à jour sans couplage direct :
 * - 'score-changed' (score: number)
 * - 'lives-changed' (lives: number)
 * - 'game-over' (score: number)
 */
export class ScoreManager {
  private score = 0;
  private lives = STARTING_LIVES;

  constructor(private readonly scene: Phaser.Scene) {}

  getScore(): number {
    return this.score;
  }

  getLives(): number {
    return this.lives;
  }

  addScore(points: number): void {
    this.score += points;
    this.scene.events.emit('score-changed', this.score);
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
