import Phaser from 'phaser';
import { estTactile } from '../utils/viewport';

/**
 * Le paysage, imposé pour de bon.
 *
 * CE QUI EXISTAIT DÉJÀ, et pourquoi ça ne suffisait pas. Le manifeste PWA
 * déclare `"orientation": "landscape"` et le manifeste Android
 * `screenOrientation="sensorLandscape"`. Ces deux-là marchent — dans
 * l'application INSTALLÉE. Mais le jeu s'ouvre aussi depuis un lien, dans un
 * onglet ordinaire, et là c'est l'API navigateur qui décide : elle refuse
 * `screen.orientation.lock()` tant que la page n'est pas en plein écran, et
 * le plein écran exige un geste de l'utilisateur.
 *
 * D'où les deux temps de ce fichier :
 *
 *   1. AU PREMIER TOUCHER, on demande le plein écran puis le verrouillage en
 *      paysage. C'est le seul moment où le navigateur accepte. Le premier
 *      toucher arrive de toute façon (il faut bien appuyer sur « Jouer »),
 *      donc le joueur ne voit aucune étape supplémentaire.
 *
 *   2. SI ÇA ÉCHOUE QUAND MÊME — iOS ne verrouille rien, certains navigateurs
 *      refusent le plein écran — on affiche un voile « tourne ton téléphone »
 *      et on ENDORT la boucle de jeu. C'est ce qui permet de ne plus avoir à
 *      entretenir deux mises en page : le portrait n'est plus un mode de jeu,
 *      c'est un état transitoire d'une seconde.
 *
 * LE PORTRAIT N'EST PAS SUPPRIMÉ POUR AUTANT. Sur un appareil sans écran
 * tactile — un portfolio ouvert sur un ordinateur, une fenêtre étroite — le
 * voile ne s'affiche pas et l'ancien comportement s'applique : le jeu se
 * réagence en portrait comme avant. Personne ne peut « tourner » un écran de
 * bureau, lui demander serait absurde.
 *
 * POURQUOI ENDORMIR LA BOUCLE plutôt que reconstruire la scène. Une rotation
 * vers le portrait reconstruisait toute la scène active. Endormie, la partie
 * est simplement SUSPENDUE : `TimeStep.sleep()` coupe vraiment
 * requestAnimationFrame, donc `time.now` cesse d'avancer, donc les minuteurs
 * de spawn, la minuterie de la grenade et le chrono se figent d'eux-mêmes.
 * On retrouve la partie exactement où on l'avait laissée — y compris les
 * fruits en vol, que la reconstruction perdait.
 *
 * Le réveil est déclenché par PLUSIEURS sources indépendantes (les mesures
 * échelonnées de la rotation, le retour au premier plan, et un toucher sur le
 * voile lui-même). C'est délibéré : une boucle endormie qu'on oublierait de
 * réveiller laisserait le jeu figé pour de bon, et ce risque-là ne se rattrape
 * pas. Réveiller deux fois ne coûte rien.
 */

function estPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * Demande le plein écran puis le paysage. Les deux peuvent échouer, et c'est
 * prévu : le voile prend alors le relais. Aucune erreur n'est propagée — un
 * refus d'orientation ne doit jamais empêcher de jouer.
 */
async function verrouillerPaysage(): Promise<void> {
  const racine = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (document.fullscreenElement === null) {
      await (racine.requestFullscreen?.() ?? racine.webkitRequestFullscreen?.());
    }
  } catch {
    // Plein écran refusé : le verrouillage échouera sans doute aussi, on tente.
  }
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (o: string) => Promise<void>;
  };
  try {
    await orientation?.lock?.('landscape');
  } catch {
    // Refus attendu sur iOS et dans un onglet non plein écran : le voile suit.
  }
}

/** Le voile de rotation, construit une seule fois et réutilisé. */
function creerVoile(): HTMLElement {
  const style = document.createElement('style');
  style.textContent = [
    '#rotation-voile{position:fixed;inset:0;z-index:9999;display:none;',
    'flex-direction:column;align-items:center;justify-content:center;gap:22px;',
    'background:#0b2a3a;color:#eef3f7;text-align:center;padding:24px;',
    "font-family:'Fredoka','Trebuchet MS',sans-serif;}",
    '#rotation-voile.visible{display:flex;}',
    '#rotation-voile svg{animation:rotation-pivote 2.2s ease-in-out infinite;}',
    '#rotation-voile p{margin:0;font-size:26px;font-weight:600;}',
    '#rotation-voile small{opacity:.68;font-size:17px;}',
    '@keyframes rotation-pivote{0%,28%{transform:rotate(0)}',
    '58%,100%{transform:rotate(-90deg)}}',
  ].join('');
  document.head.appendChild(style);

  const voile = document.createElement('div');
  voile.id = 'rotation-voile';
  voile.innerHTML = [
    '<svg width="86" height="86" viewBox="0 0 24 24" fill="none"',
    ' stroke="#ffd166" stroke-width="1.6" stroke-linejoin="round">',
    '<rect x="7" y="2" width="10" height="20" rx="2.4"/>',
    '<line x1="10.6" y1="19.4" x2="13.4" y2="19.4" stroke-linecap="round"/>',
    '</svg>',
    '<p>Tourne ton téléphone</p>',
    "<small>Kout Sab' se joue à l'horizontale</small>",
  ].join('');
  document.body.appendChild(voile);
  return voile;
}

export interface PorteDuPaysage {
  /**
   * Vrai quand le jeu est retenu en paysage derrière le voile. La mise en
   * page ne doit alors PAS basculer en portrait : c'est tout l'intérêt.
   */
  estBloque: () => boolean;
  /** À rappeler à chaque mesure d'orientation. */
  rafraichir: () => void;
}

export function installLandscapeGate(game: Phaser.Game): PorteDuPaysage {
  const voile = creerVoile();
  let bloque = false;

  /**
   * Volontairement IDEMPOTENTE, et non « seulement sur transition ».
   *
   * Le premier appel a lieu avant que Phaser n'ait fini de démarrer : le jeu
   * se construit en plusieurs temps (DOM prêt, textures, puis `game.start()`),
   * et ce `start()` relance la boucle par-dessus notre endormissement. Mesuré :
   * voile affiché, et `loop.running` toujours à vrai. Une version qui ne
   * réagissait qu'aux changements ne rattrapait jamais cet écart, puisque son
   * état interne disait déjà « bloqué ».
   *
   * En comparant à l'état RÉEL de la boucle à chaque appel, la porte se
   * rattrape d'elle-même, quel que soit l'ordre de démarrage.
   */
  const rafraichir = (): void => {
    bloque = estTactile() && estPortrait();
    voile.classList.toggle('visible', bloque);
    if (bloque && game.loop.running) {
      game.loop.sleep();
    } else if (!bloque && !game.loop.running) {
      // `true` remet le compteur de delta à zéro : sans ça, la première image
      // après le réveil porterait tout le temps passé derrière le voile, et
      // les fruits feraient un bond.
      game.loop.wake(true);
    }
  };

  // Le verrouillage ne peut être demandé qu'à partir d'un geste : on prend le
  // tout premier, et une seule fois.
  const auPremierToucher = (): void => {
    void verrouillerPaysage().then(rafraichir);
  };
  window.addEventListener('pointerdown', auPremierToucher, { once: true });

  // Filets de réveil indépendants (cf. l'en-tête du fichier).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      rafraichir();
    }
  });
  voile.addEventListener('pointerdown', () => {
    void verrouillerPaysage().then(rafraichir);
  });

  // Endormir une boucle qui n'a pas encore démarré ne sert à rien : Phaser la
  // relance ensuite par-dessus. Or READY arrive AVANT `loop.start()` — vérifié
  // dans les sources, et mesuré : voile affiché, boucle toujours en marche.
  // Le premier POST_STEP, lui, ne peut pas mentir : s'il a lieu, la boucle
  // tourne. On garde les deux points d'accroche, la fonction étant idempotente.
  game.events.once(Phaser.Core.Events.READY, rafraichir);
  game.events.once(Phaser.Core.Events.POST_STEP, rafraichir);
  rafraichir();
  return { estBloque: () => bloque, rafraichir };
}
