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
export function computeViewport(): ViewportSize {
  const isPortrait = window.innerHeight >= window.innerWidth;
  return isPortrait
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, isPortrait: true }
    : { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT, isPortrait: false };
}

/** Clé de texture du décor adaptée à l'orientation d'une scène. */
export function backgroundKey(scene: Phaser.Scene): string {
  return scene.scale.height > scene.scale.width ? 'background_portrait' : 'background_landscape';
}
