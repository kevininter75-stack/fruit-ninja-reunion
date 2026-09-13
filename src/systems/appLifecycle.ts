import { suspendAudio, resumeAudio } from '../utils/audioContext';
import { music } from './MusicManager';

/**
 * Ce qui doit s'arrêter quand le joueur quitte l'application.
 *
 * LE DÉFAUT. Téléphone verrouillé, application quittée, le séga continuait de
 * jouer. Trois raisons emboîtées, et il fallait les traiter toutes les trois :
 *
 *   L'ordonnanceur de la musique est un setInterval du NAVIGATEUR. Phaser
 *     n'y peut rien, et lui-même ne fait pas ce qu'on croit : Game.onHidden
 *     appelle loop.pause(), mais TimeStep.pause() se contente d'enregistrer
 *     l'instant pour rattraper le delta au retour — il n'arrête RIEN. Ce qui
 *     arrête la boucle de jeu en arrière-plan, c'est le système, qui suspend
 *     requestAnimationFrame. Les minuteurs du navigateur, eux, survivent : le
 *     séga continuait donc de se programmer.
 *
 *   getAudioContext() réveillait le contexte à CHAQUE accès, y compris en
 *     arrière-plan : le moindre son programmé par un minuteur encore vivant
 *     suffisait à tout relancer.
 *
 *   Personne ne suspendait le contexte audio lui-même. Baisser le volume
 *     n'aurait pas suffi : les sons déjà programmés seraient sortis quand
 *     même, et le processeur audio serait resté éveillé.
 *
 * POURQUOI visibilitychange ET PAS UN PLUGIN NATIF. Sur Android, la WebView de
 * Capacitor déclenche visibilitychange quand l'activité passe en arrière-plan
 * et au verrouillage de l'écran — c'est donc suffisant, sans ajouter de
 * dépendance ni resynchroniser le projet natif. Si un appareil s'y dérobait,
 * le recours serait @capacitor/app et son évènement appStateChange.
 *
 * `pagehide` et `freeze` doublent la mise : certains systèmes passent par eux
 * sans passer par visibilitychange. Chacun a son symétrique, et tous les
 * réveils sont idempotents — c'est délibéré : mieux vaut réveiller deux fois
 * que de laisser l'application endormie pour de bon.
 *
 * CE QUI N'EST PAS FAIT, ET POURQUOI. On pourrait arrêter franchement la
 * boucle de jeu (TimeStep.sleep, qui coupe vraiment requestAnimationFrame).
 * On s'en abstient : le système la suspend déjà quand l'application passe en
 * arrière-plan, le gain serait donc marginal, alors qu'un réveil manqué
 * laisserait le jeu figé pour de bon. L'audio, lui, n'avait pas ce filet :
 * c'est là qu'il fallait agir.
 */
export function installAppLifecycle(): void {
  const endormir = (): void => {
    // L'ordre compte : couper l'ordonnanceur AVANT de suspendre le contexte.
    // L'inverse laisserait un tour de minuteur programmer des notes contre une
    // horloge déjà figée.
    music.suspend();
    suspendAudio();
  };

  const reveiller = (): void => {
    resumeAudio();
    music.wake();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endormir();
    } else {
      reveiller();
    }
  });

  window.addEventListener('pagehide', endormir);
  window.addEventListener('pageshow', reveiller);

  // `freeze` : le système met l'onglet en veille profonde pour économiser la
  // batterie. Il peut survenir sans visibilitychange sur certains navigateurs.
  document.addEventListener('freeze', endormir);
  document.addEventListener('resume', reveiller);
}
