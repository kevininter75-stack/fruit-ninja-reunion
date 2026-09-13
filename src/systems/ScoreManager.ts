import Phaser from 'phaser';
import {
  STARTING_LIVES,
  EXTRA_LIFE_SCORE_STEP,
  EXTRA_LIFE_FALLBACK_POINTS,
} from '../utils/constants';

/**
 * Gère le score, les vies et le multiplicateur temporaire (combava doré).
 * Émet des événements de scène pour que l'UI se mette à jour sans couplage direct :
 * - 'score-changed' (score: number)
 * - 'lives-changed' (lives: number)
 * - 'life-gained' () — un palier de score a effacé une croix de strike
 * - 'game-over' (score: number)
 */
/** Avancement d'une partie, transportable à travers une rotation d'écran. */
export interface ScoreSnapshot {
  score: number;
  lives: number;
  nextExtraLifeAt: number;
}

export class ScoreManager {
  private score = 0;
  private lives = STARTING_LIVES;
  private multiplier = 1;
  private multiplierUntil = 0;
  /** Prochain palier de score qui accordera une vie. */
  private nextExtraLifeAt = EXTRA_LIFE_SCORE_STEP;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Photographie de l'avancement, pour survivre à une rotation d'écran.
   *
   * Le multiplicateur n'en fait PAS partie, volontairement : il est lié à une
   * date d'expiration, donc le transporter demanderait de reporter une durée
   * restante à travers la reconstruction de la scène. Il dure cinq secondes ;
   * on le laisse tomber, et c'est tout.
   */
  snapshot(): ScoreSnapshot {
    return { score: this.score, lives: this.lives, nextExtraLifeAt: this.nextExtraLifeAt };
  }

  /** Restaure l'avancement photographié avant une rotation. */
  restore(etat: ScoreSnapshot): void {
    this.score = etat.score;
    this.lives = etat.lives;
    this.nextExtraLifeAt = etat.nextExtraLifeAt;
    this.scene.events.emit('score-changed', this.score);
    this.scene.events.emit('lives-changed', this.lives);
  }

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
    this.checkExtraLife();
    return awarded;
  }

  /**
   * Récompense de palier, façon « vie supplémentaire tous les 100 points »
   * de Fruit Ninja : on efface une croix de strike. Si les trois vies sont
   * intactes, le palier est converti en points — un bonus ne doit jamais
   * tomber à plat. La boucle `while` couvre le cas d'un gros combo qui
   * franchit deux paliers d'un coup.
   */
  private checkExtraLife(): void {
    while (this.score >= this.nextExtraLifeAt) {
      this.nextExtraLifeAt += EXTRA_LIFE_SCORE_STEP;
      if (this.lives < STARTING_LIVES) {
        this.lives += 1;
        this.scene.events.emit('lives-changed', this.lives);
        this.scene.events.emit('life-gained');
      } else {
        // Crédit direct : pas de récursion possible, checkExtraLife n'est
        // appelé que depuis addScore et le palier a déjà été avancé.
        this.score += EXTRA_LIFE_FALLBACK_POINTS;
        this.scene.events.emit('score-changed', this.score);
      }
    }
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
