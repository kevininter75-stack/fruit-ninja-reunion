import {
  PORTRAIT_WIDTH,
  PORTRAIT_HEIGHT,
  LANDSCAPE_WIDTH,
  LANDSCAPE_HEIGHT,
} from './constants';

/** Taille logique choisie selon l'orientation physique de la fenêtre. */
export interface ViewportSize {
  width: number;
  height: number;
  isPortrait: boolean;
}

/**
 * Détermine la résolution logique à utiliser d'après l'orientation courante.
 * Le jeu suit le device : format vertical quand le téléphone est tenu droit,
 * horizontal quand il est tourné. Chaque orientation garde une résolution
 * logique fixe (720×1280 ou 1280×720), ce qui rend le rendu et la physique
 * prévisibles dans les deux cas ; Scale.FIT gère la mise à l'échelle réelle.
 */
/**
 * Écran tactile ou non — mesuré UNE SEULE FOIS, au chargement.
 *
 * Un téléphone ne devient pas une souris en cours de route : la question n'a
 * qu'une réponse pour toute la session. La mettre en cache n'est pourtant pas
 * qu'une économie, c'est une correction. Relue à chaque redimensionnement, la
 * valeur peut arriver en retard d'un événement — constaté en émulation, où le
 * tactile s'éteint puis se rallume au moment précis de la rotation. Ce
 * décalage d'une frame suffisait à faire basculer la mise en page en portrait
 * et donc à reconstruire la scène : partie perdue, exactement le défaut qu'on
 * cherchait à supprimer.
 *
 * Une valeur figée ne peut pas se contredire elle-même.
 */
const TACTILE =
  typeof window !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);

export function estTactile(): boolean {
  return TACTILE;
}

export function computeViewport(): ViewportSize {
  // SUR TÉLÉPHONE, LE JEU EST TOUJOURS EN PAYSAGE. Ce n'est pas un repli, c'est
  // la règle : Kout Sab' se tient à l'horizontale, comme Fruit Ninja. Un
  // appareil tactile tenu droit ne bascule donc plus la mise en page — il voit
  // le voile « tourne ton téléphone » (cf. systems/orientation.ts) pendant la
  // seconde que dure la rotation.
  //
  // Conséquence heureuse : sur téléphone, la scène n'est PLUS JAMAIS
  // reconstruite pour cause de rotation. Le seul cas qui l'exigeait a disparu,
  // et avec lui tout ce qu'une reconstruction perdait au passage.
  //
  // Le portrait reste servi tel quel partout ailleurs : sur un ordinateur,
  // « tourne ton écran » n'aurait aucun sens.
  if (estTactile()) {
    return { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT, isPortrait: false };
  }
  const isPortrait = window.innerHeight >= window.innerWidth;
  return isPortrait
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, isPortrait: true }
    : { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT, isPortrait: false };
}

/** Clé de texture du décor adaptée à l'orientation d'une scène. */
export function backgroundKey(scene: Phaser.Scene): string {
  return scene.scale.height > scene.scale.width ? 'background_portrait' : 'background_landscape';
}
