/**
 * AudioContext partagé entre les SFX et la musique.
 *
 * Les navigateurs limitent le nombre de contextes par page : un seul, créé
 * paresseusement. La politique d'autoplay fait qu'il ne démarre réellement
 * qu'après le premier geste utilisateur.
 */
let sharedContext: AudioContext | null = null;

/**
 * Vrai quand l'application est passée en arrière-plan.
 *
 * C'est la pièce qui manquait. getAudioContext() réveillait le contexte à
 * CHAQUE accès, y compris à téléphone verrouillé : le moindre son programmé
 * par un minuteur encore vivant suffisait à relancer tout l'audio. Tant que ce
 * drapeau est levé, plus rien ne réveille le contexte.
 */
let enArrierePlan = false;

export function getAudioContext(): AudioContext | null {
  if (sharedContext === null) {
    try {
      sharedContext = new AudioContext();
    } catch {
      return null; // Web Audio indisponible : le jeu reste muet mais fonctionnel
    }
  }
  if (sharedContext.state === 'suspended' && !enArrierePlan) {
    void sharedContext.resume();
  }
  return sharedContext;
}

/**
 * Endort l'audio. Suspendre le CONTEXTE, et pas seulement baisser le volume :
 * un contexte suspendu arrête son horloge, donc les sons déjà programmés ne
 * sortent pas non plus, et le processeur audio se met au repos.
 */
export function suspendAudio(): void {
  enArrierePlan = true;
  if (sharedContext !== null && sharedContext.state === 'running') {
    void sharedContext.suspend();
  }
}

/**
 * Vrai quand le contexte existe ET joue réellement.
 *
 * C'est la seule preuve qui vaille que le déverrouillage a abouti : un
 * contexte peut exister, avoir reçu un `resume()`, et rester suspendu.
 */
export function contexteActif(): boolean {
  return sharedContext !== null && sharedContext.state === 'running';
}

/** Rend l'audio au premier plan. Sans effet si le joueur n'a jamais joué de son. */
export function resumeAudio(): void {
  enArrierePlan = false;
  if (sharedContext !== null && sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }
}
