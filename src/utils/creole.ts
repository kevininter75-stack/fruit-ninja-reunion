/**
 * Les exclamations du jeu, en créole réunionnais.
 *
 * TOUTES ces formules ont été données par Kevin, natif de l'île. Elles ne sont
 * pas traduites depuis le français et ne doivent pas l'être : une expression
 * créole approximative se remarque immédiatement, et ferait exactement
 * l'inverse de l'effet recherché dans un jeu qui revendique son terroir.
 *
 * Ne pas en inventer de nouvelles. Si un moment de jeu manque de voix, c'est
 * une question à lui poser, pas un trou à combler.
 */

/** Trois ou quatre fruits d'un seul geste. */
export const COMBO_PETIT = 'Woulala !';

/** Cinq fruits ou plus : le grand geste. */
export const COMBO_GRAND = 'Totoche !';

/** La grenade éclate au bout de sa frénésie. */
export const FRENESIE = 'I pète fort !';

/** Nouveau record personnel. */
export const RECORD = 'Lé doss !';

/** Bombe tranchée : la partie s'arrête net. */
export const BOMBE = 'La plané';

/**
 * L'exclamation qui convient à un combo de <paramref>fruits</paramref> fruits.
 * Le seuil est à cinq, là où le geste cesse d'être une réussite ordinaire.
 */
export function exclamationCombo(fruits: number): string {
  return fruits >= 5 ? COMBO_GRAND : COMBO_PETIT;
}
