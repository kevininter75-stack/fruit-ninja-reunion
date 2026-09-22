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

/** Trois fruits d'un seul geste : la réussite ordinaire. */
export const COMBO_PETIT = 'Woulala !';

/** Quatre à six fruits : le grand geste. */
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

/**
 * Le piment cabri éclate au bout de sa frénésie.
 *
 * Mot de Kevin, donné le 14/09/2026. Il remplace « I pète fort ! », que Kevin
 * avait donné lui aussi, du temps où ce fruit était une grenade.
 *
 * L'échange vaut mieux que l'ancien, et pas seulement parce que le fruit a
 * changé : « pète » parlait de l'explosion, donc d'une chose que le joueur
 * VOIT déjà — la gerbe, la secousse, l'onde de choc le disent trois fois.
 * « Poik » parle du PIMENT, c'est-à-dire de la seule chose que l'image ne peut
 * pas dire. Le texte ajoute enfin quelque chose au lieu de doubler le reste.
 *
 * Graphie reprise telle qu'il l'a écrite. Seule l'espace avant le point
 * d'exclamation a été ajoutée, pour l'aligner sur les autres entrées du
 * fichier : c'est de la typographie française, pas du créole.
 *
 * « I pète fort ! » n'est pas perdu pour autant — il est consigné ici, et
 * disponible si un autre moment du jeu vient à manquer de voix.
 */
export const FRENESIE = 'I poik fort !';

/** Nouveau record personnel. */
export const RECORD = 'Lé doss !';

/** Pétard tranché : la partie s'arrête net. */
export const BOMBE = 'La plané';

/**
 * La papaye cyclone est tranchée : le déluge commence.
 *
 * Mot de Kevin, donné le 14/09/2026 (« par exemple : cyclone y débarque »).
 * Il est repris tel qu'il l'a écrit, sans être « corrigé » vers une graphie
 * créole plus académique — c'est lui qui parle la langue, et la règle en tête
 * de ce fichier vaut dans les deux sens : on n'invente pas, et on ne récrit
 * pas non plus.
 *
 * Le cyclone est d'ailleurs la seule métaphore juste ici. À La Réunion, c'est
 * ce qui arrive d'un coup, remplit tout le ciel et repart — exactement ce que
 * fait le déluge de fruits.
 */
export const CYCLONE = 'Cyclone y débarque !';

/**
 * Le longani givré est tranché : le chrono s'arrête.
 *
 * Mot de Kevin, donné le 22/09/2026 (« la frais y kok! »). Repris tel qu'il
 * l'a écrit, sans être « corrigé » vers une graphie plus académique — même
 * règle que pour le cyclone : on n'invente pas, et on ne récrit pas non plus.
 *
 * Seules la majuscule initiale et l'espace avant le point d'exclamation ont
 * été ajoutées, pour suivre la mise en forme des autres exclamations du
 * fichier. Si même ça dénature la formule, c'est à lui de le dire.
 */
export const GEL = 'La frais y kok !';

/**
 * L'exclamation qui convient à un combo de <paramref>fruits</paramref> fruits.
 *
 * TROIS MOTS, TROIS PALIERS, ET C'EST LE MOT QUI CHANGE — pas la fréquence.
 *
 * L'histoire de ce seuil vaut d'être gardée, parce qu'elle s'est trompée de
 * levier une fois. Kevin avait signalé que « Woulala » revenait trop souvent
 * et disait la même chose pour un x3 comme pour un x4, et proposait deux
 * remèdes : « soit faire moins apparaître, soit s'adapter ». La première voie
 * a été prise — seuil relevé à quatre fruits — et elle a échoué, pour une
 * raison que la mesure montrait déjà : sur 22 gestes relevés à intensité
 * maximale, la répartition était x1 45 %, x2 27 %, x3 18 %, x6 9 %, et RIEN
 * entre quatre et cinq. Le seuil tombait dans un trou de la distribution. Il
 * n'a donc pas rendu l'exclamation rare : il l'a fait disparaître. En jeu, on
 * ne lisait plus un seul nom de combo en dehors du fruit spécial.
 *
 * C'est la SECONDE voie qui était la bonne. Un x3 dit « Woulala », un x4 dit
 * « Totoche », un x7 dit « Oté » : deux combos voisins ne disent plus jamais
 * la même chose, ce qui était tout le reproche — et le jeu retrouve sa voix.
 *
 * Les paliers suivent la distribution réelle plutôt qu'une graduation
 * régulière : trois est le combo courant, sept est le geste dont on parle
 * après la partie, et l'espace entre les deux revient au mot du milieu.
 */
export function exclamationCombo(fruits: number): string {
  if (fruits >= GESTURE_HUGE_MIN) {
    return COMBO_ENORME;
  }
  return fruits >= 4 ? COMBO_GRAND : COMBO_PETIT;
}
