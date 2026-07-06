/**
 * AudioContext partagé entre les SFX et la musique.
 * Les navigateurs limitent le nombre de contextes par page : un seul,
 * créé paresseusement, repris à chaque accès (politique d'autoplay —
 * il ne démarre réellement qu'après le premier geste utilisateur).
 */
let sharedContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (sharedContext === null) {
    try {
      sharedContext = new AudioContext();
    } catch {
      return null; // Web Audio indisponible : le jeu reste muet mais fonctionnel
    }
  }
  if (sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }
  return sharedContext;
}
