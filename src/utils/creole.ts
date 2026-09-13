import { GESTURE_HUGE_MIN } from './constants';

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

/** Quatre ou cinq fruits d'un seul geste. */
export const COMBO_PETIT = 'Woulala !';

/** Six ou sept fruits : le grand geste. */
export const COMBO_GRAND = 'Totoche !';

/**
 * Huit fruits ou plus : le geste dont on parle après la partie.
 *
 * Seule exclamation de ce fichier que Kevin n'a pas donnée spontanément : je
 * l'ai proposée, il l'a validée le 13/09/2026. Elle n'est pas inventée pour
 * autant — c'est l'une des trois interjections que le Wiktionnaire recense en
 * créole réunionnais, et la seule qui marque l'étonnement.
 *
 * La règle du fichier tient toujours : on ne comble pas un trou tout seul, on
 * propose et on attend le feu vert.
 */
export const COMBO_ENORME = 'Oté !';

/** La grenade éclate au bout de sa frénésie. */
export const FRENESIE = 'I pète fort !';

/** Nouveau record personnel. */
export const RECORD = 'Lé doss !';

/** Bombe tranchée : la partie s'arrête net. */
export const BOMBE = 'La plané';

/**
 * L'exclamation qui convient à un combo de <paramref>fruits</paramref> fruits.
 *
 * TROIS PALIERS, et ils coïncident avec les trois paliers de présence : au
 * dernier, le mot change ET la bannière grossit. C'est la gradation de Fruit
 * Ninja, qui fait monter les noms et les tambours ensemble.
 *
 * LE SEUIL A CHANGÉ, et pour une raison mesurée. Il était à cinq, et trois
 * fruits suffisaient à déclencher une bannière : sur 22 gestes relevés à
 * intensité maximale, les combos se répartissaient en x1 45 %, x2 27 %,
 * x3 18 %, x6 9 % — et RIEN entre quatre et cinq. Le seuil tombait donc dans
 * un trou de la distribution, et deux bannières sur trois étaient des x3
 * disant tous « Woulala ». Le mot s'usait à force de servir.
 *
 * Désormais un x3 ne crie plus du tout (cf. GESTURE_BANNER_MIN) : il se paie
 * et se voit, mais discrètement. L'exclamation est réservée à quatre fruits
 * et plus, et le grand mot à six.
 *
 * DEUX MOTS RESTENT PEU pour couvrir de quatre à douze fruits. Fruit Ninja en
 * gradue six (Combo, Great, Awesome, Super, Hyper, Unbelievable). Il en
 * manque ici, et c'est une question à poser à Kevin, pas un trou à combler.
 */
export function exclamationCombo(fruits: number): string {
  if (fruits >= GESTURE_HUGE_MIN) {
    return COMBO_ENORME;
  }
  return fruits >= 6 ? COMBO_GRAND : COMBO_PETIT;
}
