/**
 * Réglages utilisateur persistés (localStorage) avec cache mémoire :
 * isMuted() est appelé à chaque son, on ne relit pas le stockage à chaque fois.
 */
const MUTED_KEY = 'fruit-ninja-reunion-muted';

let mutedCache: boolean | null = null;

export function isMuted(): boolean {
  if (mutedCache === null) {
    try {
      mutedCache = localStorage.getItem(MUTED_KEY) === '1';
    } catch {
      mutedCache = false;
    }
  }
  return mutedCache;
}

export function setMuted(muted: boolean): void {
  mutedCache = muted;
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // stockage indisponible : le réglage vaut pour la session en cours
  }
}
