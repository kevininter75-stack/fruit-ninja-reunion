import { COMBO_WINDOW_MS } from '../utils/constants';

/**
 * Suivi des combos : deux coupes espacées de moins de COMBO_WINDOW_MS
 * s'enchaînent dans un même combo.
 *
 * Phase 1 : seul le comptage est en place (architecture figée).
 * TODO Phase 2 : bonus de score multiplicateur, affichage "Combo xN !",
 * son dédié.
 */
export class ComboManager {
  private comboCount = 0;
  private lastSliceTime = -Infinity;

  /** À appeler à chaque coupe réussie. Renvoie la taille du combo courant. */
  registerSlice(time: number): number {
    if (time - this.lastSliceTime <= COMBO_WINDOW_MS) {
      this.comboCount += 1;
    } else {
      this.comboCount = 1;
    }
    this.lastSliceTime = time;
    return this.comboCount;
  }

  reset(): void {
    this.comboCount = 0;
    this.lastSliceTime = -Infinity;
  }
}
