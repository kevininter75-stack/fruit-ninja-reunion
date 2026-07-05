import type { GameMode } from './constants';

/**
 * Persistance du meilleur score par mode via localStorage.
 * Tous les accès sont enveloppés de try/catch : si le stockage est
 * indisponible (navigation privée stricte, etc.), le jeu fonctionne
 * simplement sans records.
 */

function storageKey(mode: GameMode): string {
  return `fruit-ninja-reunion-best-${mode}`;
}

export function getBestScore(mode: GameMode): number {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    return raw === null ? 0 : Number(raw) || 0;
  } catch {
    return 0;
  }
}

/** Enregistre le score s'il bat le record du mode. Renvoie true si nouveau record. */
export function saveBestScore(mode: GameMode, score: number): boolean {
  if (score <= getBestScore(mode)) {
    return false;
  }
  try {
    localStorage.setItem(storageKey(mode), String(score));
  } catch {
    // stockage indisponible : record non persisté mais quand même annoncé
  }
  return true;
}
