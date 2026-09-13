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

// ------------------------------------------------------------------
// Qualité graphique
// ------------------------------------------------------------------

/**
 * La résolution de rendu est le seul réglage dont le coût est QUADRATIQUE :
 * passer de 1,5× à 2× ne coûte pas un tiers de plus mais 78 % de plus en
 * pixels. Mesuré dans le navigateur de développement, sur la même scène :
 *
 *   1,0× — 1280 × 720  (0,92 Mpx) — 60 FPS
 *   1,5× — 1920 × 1080 (2,07 Mpx) — 57 FPS
 *   2,0× — 2560 × 1440 (3,69 Mpx) — 39 FPS
 *
 * D'où le choix : l'automatique s'arrête à 1,5×, ce qui est déjà plus du
 * double de pixels de l'ancienne version fixe et reste net sur une dalle de
 * téléphone. « Haute » lève le plafond à 2× — la définition native d'une
 * dalle QHD+, donc la netteté maximale possible — pour les appareils qui
 * l'encaissent.
 *
 * Le réglage est proposé plutôt que deviné. Rien dans le navigateur ne dit
 * de quoi un GPU est capable, et un mauvais pari se paie soit en flou sur un
 * téléphone haut de gamme, soit en saccades sur un milieu de gamme. Le seul
 * juge fiable est celui qui regarde l'écran.
 *
 * Changer ce réglage recharge la page : toutes les textures sont générées en
 * code à la résolution choisie, il faut donc les refaire.
 */
export type QualityPreference = 'auto' | 'high';

const QUALITY_KEY = 'fruit-ninja-reunion-quality';
let qualityCache: QualityPreference | null = null;

export function getQualityPreference(): QualityPreference {
  if (qualityCache === null) {
    try {
      qualityCache = localStorage.getItem(QUALITY_KEY) === 'high' ? 'high' : 'auto';
    } catch {
      qualityCache = 'auto';
    }
  }
  return qualityCache;
}

export function setQualityPreference(preference: QualityPreference): void {
  qualityCache = preference;
  try {
    localStorage.setItem(QUALITY_KEY, preference);
  } catch {
    // stockage indisponible : le réglage vaut pour la session en cours
  }
}

/** Plafond de résolution de rendu correspondant au réglage courant. */
export function qualityCap(): number {
  return getQualityPreference() === 'high' ? 2 : 1.5;
}
