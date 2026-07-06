import Phaser from 'phaser';
import {
  SLICE_BUFFER_SIZE,
  SLICE_POINT_MAX_AGE_MS,
  TRAIL_MAX_HALF_WIDTH,
  COLOR_TRAIL,
} from '../utils/constants';

/** Point de traînée réutilisable (jamais réalloué → pas de pression GC). */
interface TrailPoint {
  x: number;
  y: number;
  time: number;
  used: boolean;
}

// Taille max du chemin rééchantillonné : 3 échantillons par segment + le point final
const MAX_SAMPLES = (SLICE_BUFFER_SIZE - 1) * 3 + 1;

/** Interpolation Catmull-Rom scalaire (courbe passant par p1 et p2). */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Traînée de lame façon Fruit Ninja : un ruban lisse, effilé en pointe à
 * l'arrière, le plus large sous le doigt, terminé par une pointe avant.
 *
 * Rendu en trois passes concentriques (halo translucide, cœur, éclat
 * central) pour un aspect brillant de lame, sur une courbe Catmull-Rom
 * qui gomme les angles de la polyligne brute du pointeur.
 *
 * Implémentation sans allocation dans la boucle de rendu : ring buffer de
 * points pré-alloués + tampons de rééchantillonnage en Float32Array
 * réutilisés à chaque frame, tracé via beginPath/lineTo (pas de tableaux
 * intermédiaires).
 */
export class SliceTrail {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly points: TrailPoint[];
  private head = 0; // index du prochain point à écrire

  // Tampons réutilisés à chaque frame (points valides puis courbe lissée)
  private readonly rawX = new Float32Array(SLICE_BUFFER_SIZE);
  private readonly rawY = new Float32Array(SLICE_BUFFER_SIZE);
  private readonly rawFresh = new Float32Array(SLICE_BUFFER_SIZE);
  private readonly curveX = new Float32Array(MAX_SAMPLES);
  private readonly curveY = new Float32Array(MAX_SAMPLES);
  private readonly halfWidth = new Float32Array(MAX_SAMPLES);
  private readonly normalX = new Float32Array(MAX_SAMPLES);
  private readonly normalY = new Float32Array(MAX_SAMPLES);

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

  /** Efface immédiatement la traînée (fin de geste, bombe). */
  clear(): void {
    for (const p of this.points) {
      p.used = false;
    }
    this.graphics.clear();
  }

  /** Redessine le ruban à partir des points encore frais. */
  update(now: number): void {
    this.graphics.clear();

    const n = this.collectValidPoints(now);
    if (n < 2) {
      return;
    }
    const m = this.resampleCurve(n);
    this.computeWidthsAndNormals(n, m);

    // Trois passes : halo doux, cœur de lame, éclat central
    this.drawRibbon(m, 2.3, COLOR_TRAIL, 0.14);
    this.drawRibbon(m, 1.0, COLOR_TRAIL, 0.85);
    this.drawRibbon(m, 0.42, 0xfffbe8, 1);
  }

  /**
   * Rassemble les points frais du ring buffer (du plus ancien au plus
   * récent) dans rawX/rawY, en sautant les points quasi confondus qui
   * rendraient les normales instables. Renvoie le nombre de points gardés.
   */
  private collectValidPoints(now: number): number {
    let n = 0;
    for (let i = 0; i < SLICE_BUFFER_SIZE; i++) {
      const p = this.points[(this.head + i) % SLICE_BUFFER_SIZE];
      if (!p.used) {
        continue;
      }
      const age = now - p.time;
      if (age > SLICE_POINT_MAX_AGE_MS) {
        p.used = false; // point expiré : la queue du ruban raccourcit
        continue;
      }
      if (n > 0) {
        const dx = p.x - this.rawX[n - 1];
        const dy = p.y - this.rawY[n - 1];
        if (dx * dx + dy * dy < 9) {
          continue; // < 3 px du point précédent
        }
      }
      this.rawX[n] = p.x;
      this.rawY[n] = p.y;
      this.rawFresh[n] = 1 - age / SLICE_POINT_MAX_AGE_MS;
      n++;
    }
    return n;
  }

  /**
   * Rééchantillonne la polyligne brute en courbe lissée (Catmull-Rom,
   * 3 échantillons par segment). Renvoie le nombre d'échantillons.
   */
  private resampleCurve(n: number): number {
    let m = 0;
    for (let i = 0; i < n - 1; i++) {
      // Indices bornés pour les points de contrôle aux extrémités
      const i0 = Math.max(i - 1, 0);
      const i3 = Math.min(i + 2, n - 1);
      for (let s = 0; s < 3; s++) {
        const t = s / 3;
        this.curveX[m] = catmullRom(this.rawX[i0], this.rawX[i], this.rawX[i + 1], this.rawX[i3], t);
        this.curveY[m] = catmullRom(this.rawY[i0], this.rawY[i], this.rawY[i + 1], this.rawY[i3], t);
        m++;
      }
    }
    this.curveX[m] = this.rawX[n - 1];
    this.curveY[m] = this.rawY[n - 1];
    m++;
    return m;
  }

  /**
   * Largeur du ruban et normale en chaque échantillon.
   * Profil : pointe fine à la queue → largeur max sous le doigt,
   * modulé par la fraîcheur pour que la queue s'évanouisse.
   */
  private computeWidthsAndNormals(n: number, m: number): void {
    for (let i = 0; i < m; i++) {
      // Direction locale par différence centrale
      const prev = Math.max(i - 1, 0);
      const next = Math.min(i + 1, m - 1);
      let dx = this.curveX[next] - this.curveX[prev];
      let dy = this.curveY[next] - this.curveY[prev];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      this.normalX[i] = -dy;
      this.normalY[i] = dx;

      const along = i / (m - 1); // 0 = queue, 1 = doigt
      // Fraîcheur interpolée depuis les points bruts
      const rawPos = (along * (n - 1)) | 0;
      const fresh = this.rawFresh[Math.min(rawPos, n - 1)];
      this.halfWidth[i] = TRAIL_MAX_HALF_WIDTH * (0.1 + 0.9 * Math.pow(along, 0.7)) * (0.35 + 0.65 * fresh);
    }
  }

  /** Trace le polygone du ruban (aller côté gauche, retour côté droit). */
  private drawRibbon(m: number, widthScale: number, color: number, alpha: number): void {
    const g = this.graphics;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(
      this.curveX[0] + this.normalX[0] * this.halfWidth[0] * widthScale,
      this.curveY[0] + this.normalY[0] * this.halfWidth[0] * widthScale
    );
    for (let i = 1; i < m; i++) {
      g.lineTo(
        this.curveX[i] + this.normalX[i] * this.halfWidth[i] * widthScale,
        this.curveY[i] + this.normalY[i] * this.halfWidth[i] * widthScale
      );
    }
    // Pointe avant de la lame, dans le prolongement du geste
    // (tangente = (normalY, -normalX) puisque normale = (-dy, dx))
    const tip = m - 1;
    g.lineTo(
      this.curveX[tip] + this.normalY[tip] * this.halfWidth[tip] * widthScale * 1.8,
      this.curveY[tip] - this.normalX[tip] * this.halfWidth[tip] * widthScale * 1.8
    );
    for (let i = m - 1; i >= 0; i--) {
      g.lineTo(
        this.curveX[i] - this.normalX[i] * this.halfWidth[i] * widthScale,
        this.curveY[i] - this.normalY[i] * this.halfWidth[i] * widthScale
      );
    }
    g.closePath();
    g.fillPath();
  }
}
