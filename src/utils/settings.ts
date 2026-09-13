/**
 * Réglages utilisateur persistés (localStorage) avec cache mémoire :
 * isMuted() est appelé à chaque son, on ne relit pas le stockage à chaque fois.
 */
const MUTED_KEY = 'fruit-ninja-reunion-muted';
const MOTION_KEY = 'fruit-ninja-reunion-motion';

let mutedCache: boolean | null = null;
let motionCache: 'auto' | 'reduced' | 'full' | null = null;

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

// ------------------------------------------------------------------
// Mouvement réduit
// ------------------------------------------------------------------

/**
 * Un jeu de fruit-slicer secoue la caméra, zoome et lance des confettis.
 * Pour une personne sujette au mal des transports vestibulaire, aux migraines
 * ou aux crises photosensibles, ces mouvements ne sont pas un détail de
 * confort : ils rendent le jeu injouable, voire douloureux.
 *
 * Trois états plutôt que deux. « auto » suit le réglage système du joueur,
 * qu'il a déjà pris la peine de définir une fois pour toutes ses applications
 * — le respecter par défaut évite de lui redemander. Les deux autres
 * permettent de forcer, parce qu'un réglage système sert mal les cas où l'on
 * veut désactiver les secousses pour CE jeu seulement.
 */
export type MotionPreference = 'auto' | 'reduced' | 'full';

export function getMotionPreference(): MotionPreference {
  if (motionCache === null) {
    try {
      const stored = localStorage.getItem(MOTION_KEY);
      motionCache = stored === 'reduced' || stored === 'full' ? stored : 'auto';
    } catch {
      motionCache = 'auto';
    }
  }
  return motionCache;
}

export function setMotionPreference(preference: MotionPreference): void {
  motionCache = preference;
  try {
    localStorage.setItem(MOTION_KEY, preference);
  } catch {
    // stockage indisponible : le réglage vaut pour la session en cours
  }
}

/** Vrai si les secousses, zooms et confettis doivent être supprimés. */
export function prefersReducedMotion(): boolean {
  const preference = getMotionPreference();
  if (preference !== 'auto') {
    return preference === 'reduced';
  }

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // matchMedia absent (très vieux navigateur) : on ne suppose rien.
    return false;
  }
}

/**
 * Facteur à appliquer à une amplitude de mouvement. Renvoie 0 en mouvement
 * réduit, 1 sinon — ce qui permet d'écrire `shake(d, a * motionScale())` sans
 * disperser des `if` dans tout le code de jeu.
 */
export function motionScale(): number {
  return prefersReducedMotion() ? 0 : 1;
}
