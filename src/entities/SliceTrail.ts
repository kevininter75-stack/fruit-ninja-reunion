import Phaser from 'phaser';
import {
  SLICE_BUFFER_SIZE,
  SLICE_POINT_MAX_AGE_MS,
  COLOR_TRAIL,
} from '../utils/constants';

/** Point de traînée réutilisable (jamais réalloué → pas de pression GC). */
interface TrailPoint {
  x: number;
  y: number;
  time: number;
  used: boolean;
}

/**
 * Traînée visuelle du geste de coupe.
 *
 * Implémentée comme un ring buffer de points pré-alloués : addPoint()
 * écrase le point le plus ancien, update() redessine les segments avec
 * un alpha et une épaisseur décroissants selon l'âge du point.
 * Aucune allocation dans la boucle de rendu.
 */
export class SliceTrail {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly points: TrailPoint[];
  private head = 0; // index du prochain point à écrire

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100); // toujours au-dessus des fruits
    this.points = [];
    for (let i = 0; i < SLICE_BUFFER_SIZE; i++) {
      this.points.push({ x: 0, y: 0, time: 0, used: false });
    }
  }

  /** Enregistre un nouveau point du geste (écrase le plus ancien si plein). */
  addPoint(x: number, y: number, time: number): void {
    const p = this.points[this.head];
    p.x = x;
    p.y = y;
    p.time = time;
    p.used = true;
    this.head = (this.head + 1) % SLICE_BUFFER_SIZE;
  }

  /** Efface immédiatement la traînée (fin de geste). */
  clear(): void {
    for (const p of this.points) {
      p.used = false;
    }
    this.graphics.clear();
  }

  /**
   * Redessine la traînée : on parcourt les points du plus ancien au plus
   * récent (ordre du ring buffer) et on trace les segments consécutifs
   * avec un fondu basé sur l'âge.
   */
  update(now: number): void {
    this.graphics.clear();

    let prev: TrailPoint | null = null;
    for (let i = 0; i < SLICE_BUFFER_SIZE; i++) {
      const p = this.points[(this.head + i) % SLICE_BUFFER_SIZE];
      if (!p.used) {
        continue;
      }
      const age = now - p.time;
      if (age > SLICE_POINT_MAX_AGE_MS) {
        p.used = false; // point expiré, il sortira du rendu
        prev = null;
        continue;
      }
      if (prev !== null) {
        // Alpha et épaisseur proportionnels à la fraîcheur du point
        const freshness = 1 - age / SLICE_POINT_MAX_AGE_MS;
        this.graphics.lineStyle(2 + freshness * 8, COLOR_TRAIL, 0.15 + freshness * 0.85);
        this.graphics.lineBetween(prev.x, prev.y, p.x, p.y);
      }
      prev = p;
    }
  }
}
