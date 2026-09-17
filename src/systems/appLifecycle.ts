import { suspendAudio, resumeAudio, contexteActif } from '../utils/audioContext';
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
  deverrouillerAudioAuPremierGeste();

  /** Sommeil différé, pour ne pas couper le son sur un clic hors fenêtre. */
  let minuteurSommeil: number | null = null;
  const annulerSommeil = (): void => {
    if (minuteurSommeil !== null) {
      window.clearTimeout(minuteurSommeil);
      minuteurSommeil = null;
    }
  };

  const endormir = (): void => {
    annulerSommeil();
    // L'ordre compte : couper l'ordonnanceur AVANT de suspendre le contexte.
    // L'inverse laisserait un tour de minuteur programmer des notes contre une
    // horloge déjà figée.
    music.suspend();
    suspendAudio();
  };

  const reveiller = (): void => {
    annulerSommeil();
    resumeAudio();
    music.wake();
  };

  /**
   * SUR UN ORDINATEUR, UNE FENÊTRE CACHÉE N'EST PAS « HIDDEN ».
   *
   * C'est le défaut que Kevin a constaté : le séga tournait en boucle derrière
   * ses autres fenêtres. `document.hidden` ne passe à vrai qu'à la réduction de
   * la fenêtre ou au changement d'onglet — une fenêtre simplement passée
   * DERRIÈRE une autre reste « visible » pour le navigateur. Un jeu ouvert dans
   * un coin de l'écran continuait donc de jouer sa musique indéfiniment.
   *
   * La perte de focus comble ce trou. Mais elle se déclenche aussi pour des
   * riens — un clic dans la barre d'adresse, un raccourci système — d'où le
   * délai : si le focus revient dans la demi-seconde, on n'a rien coupé du
   * tout. Sans lui, le moindre aller-retour hacherait la musique.
   */
  window.addEventListener('blur', () => {
    annulerSommeil();
    minuteurSommeil = window.setTimeout(endormir, DELAI_PERTE_FOCUS_MS);
  });
  window.addEventListener('focus', reveiller);

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

/**
 * Déverrouille l'audio au tout premier contact, quel qu'il soit.
 *
 * LE MENU ÉTAIT MUET, et ce n'était pas un problème de mixage. Les navigateurs
 * refusent de faire sonner quoi que ce soit avant un geste du joueur :
 * l'AudioContext naît SUSPENDU, et tant qu'il l'est, il ne sort rien du tout.
 * Mesuré : crête 0 avec le contexte suspendu, 0,14 dès qu'il reprend.
 *
 * Or rien ne le réveillait sur l'écran d'accueil. Le contexte ne reprenait
 * qu'à l'occasion d'un son joué — et le seul geste qui produit un son au menu
 * est le coup de sabre qui choisit un mode, lequel lance aussitôt la partie.
 * Le joueur n'entendait donc JAMAIS la musique du menu : elle tournait dans
 * le vide, et redevenait audible seulement au retour d'une partie.
 *
 * Un simple effleurement suffit désormais, où qu'il tombe. On écoute six
 * sortes de gestes plutôt qu'une : les navigateurs ne s'accordent pas sur ce
 * qui vaut autorisation, et il n'en coûte rien d'être large.
 */
function deverrouillerAudioAuPremierGeste(): void {
  const reveiller = (): void => {
    // Rien à faire tant que tout va bien : le coût d'un toucher est une
    // comparaison de chaîne.
    if (contexteActif()) {
      return;
    }
    resumeAudio();
    music.wake();
  };
  for (const evenement of GESTES) {
    // En phase de CAPTURE : on passe avant Phaser, qui appelle stopPropagation
    // sur certains touchers (les boutons du HUD le font explicitement).
    //
    // Et ON NE SE RETIRE JAMAIS. C'était le défaut de la version précédente :
    // elle écoutait `{ once: true }`, donc elle ne tentait le déverrouillage
    // qu'UNE SEULE FOIS. Or `resume()` échoue silencieusement dans plusieurs
    // cas ordinaires — contexte créé la milliseconde d'avant, page pas encore
    // au premier plan, moteur audio encore en train de s'initialiser. Après
    // cet échec unique, plus rien ne réessayait et le menu restait muet POUR
    // TOUJOURS. En jeu le défaut ne se voyait pas : `getAudioContext()`
    // réveille le contexte à chaque son joué, et une partie en joue sans
    // arrêt. Le menu, lui, n'en joue aucun — d'où un jeu qui a du son et un
    // accueil silencieux.
    //
    // Les garder à demeure rattrape aussi toute suspension ultérieure qui
    // aurait échappé aux évènements de cycle de vie : le toucher suivant
    // remet le son, quoi qu'il se soit passé.
    window.addEventListener(evenement, reveiller, true);
  }
}

/**
 * Délai avant d'endormir le son sur une perte de focus.
 *
 * Assez long pour absorber un clic dans la barre d'adresse ou un raccourci
 * système, assez court pour qu'on n'entende pas le jeu depuis une autre
 * fenêtre.
 */
const DELAI_PERTE_FOCUS_MS = 500;

/** Les gestes que les navigateurs acceptent comme autorisation de jouer du son. */
const GESTES = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'click'];
