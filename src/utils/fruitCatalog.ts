import { rnd } from './rng';
import { px } from './constants';
/**
 * Catalogue des fruits réunionnais.
 *
 * Toutes les données de gameplay et de rendu par variété sont ici :
 * le PreloadScene génère les textures procédurales à partir de ces
 * définitions, le SpawnManager tire une variété au poids, et la
 * GameScene lit couleur de jus / clés de textures sur le fruit tranché.
 * Quand les vrais sprites arriveront (public/assets/fruits/), seules
 * les générations de textures changeront — pas ce catalogue.
 */
export interface FruitVariety {
  /** Clé technique, base des noms de textures ([key]_whole, [key]_half_left…). */
  key: string;
  /** Nom affiché (créole/local quand il diffère du français). */
  displayName: string;
  /** Rayon du cercle de collision et base du dessin. */
  radius: number;
  /** Couleur dominante de la peau (base du dégradé de volume). */
  skinColor: number;
  /** Couleur des particules de jus. */
  juiceColor: number;
  /** Couleur de la chair visible sur la tranche des moitiés. */
  fleshColor: number;
  /** Poids relatif de spawn (plus haut = plus fréquent). */
  weight: number;
}

export const FRUIT_VARIETIES: FruitVariety[] = [
  // Huit variétés, et pas onze. Longane, papaye et jacque ont été retirées :
  // à la vitesse où un fruit traverse l'écran, longane et letchi, papaye et
  // mangue, jacque et corossol se confondent. Deux fruits qu'on ne distingue
  // pas en un dixième de seconde n'apportent pas de variété — ils diluent la
  // lecture. Leurs routines de dessin restent dans fruitArt.ts : les remettre
  // au catalogue est une ligne.
  //
  // Les couleurs de peau ont été confrontées à une mesure sur photos
  // (423 000 pixels, six espèces, Wikimedia) : cinq des six tombaient déjà à
  // moins de 6° de teinte de la mesure. Seul le corossol s'écartait de 10°.
  // Elles sont donc conservées telles quelles.
  { key: 'litchi', displayName: 'Letchi', radius: px(60), skinColor: 0xd93b52, juiceColor: 0xf2b8c6, fleshColor: 0xfbe6d4, weight: 16 },
  // Petit, rapide, il rapporte plus. Et « la saison des goyaviers » est la
  // référence fruitière la plus partagée de l'île.
  // Mesuré : teinte 11°, dominante #9C4935, pointe #E57862.
  { key: 'goyavier', displayName: 'Goyavier', radius: px(44), skinColor: 0xc0442e, juiceColor: 0xef8a6a, fleshColor: 0xf7e8dd, weight: 14 },
  { key: 'ananas_victoria', displayName: 'Ananas Victoria', radius: px(79), skinColor: 0xe8a417, juiceColor: 0xffd75e, fleshColor: 0xffe07a, weight: 10 },
  { key: 'mangue_jose', displayName: 'Mangue José', radius: px(77), skinColor: 0xf08a20, juiceColor: 0xffb347, fleshColor: 0xffc35e, weight: 12 },
  { key: 'fruit_de_la_passion', displayName: 'Fruit de la passion', radius: px(64), skinColor: 0x6b3576, juiceColor: 0xffc93c, fleshColor: 0xffc93c, weight: 12 },
  // La coupe la plus spectaculaire du catalogue : chair blanche mouchetée de
  // noir sur une peau fuchsia. Mesuré : teinte 350°, dominante #8F3D4A.
  { key: 'pitaya', displayName: 'Pitaya', radius: px(82), skinColor: 0xd93b6e, juiceColor: 0xf7c8da, fleshColor: 0xf7f5f5, weight: 9 },
  { key: 'corossol', displayName: 'Corossol', radius: px(77), skinColor: 0x74a94e, juiceColor: 0xf5f0e6, fleshColor: 0xf7f3ea, weight: 8 },
  { key: 'carambole', displayName: 'Carambole', radius: px(72), skinColor: 0xf2cf3f, juiceColor: 0xfdf0a0, fleshColor: 0xfdf6c9, weight: 12 },
];

/** Fruit bonus : le combava doré déclenche un score x2 temporaire. */
export const BONUS_VARIETY: FruitVariety = {
  key: 'combava_bonus',
  displayName: 'Combava doré',
  radius: px(66),
  skinColor: 0xf5c518,
  juiceColor: 0xffe680,
  fleshColor: 0xfff2b3,
  weight: 0, // jamais tiré au poids : spawn dédié dans le SpawnManager
};

/**
 * Grenade : fruit rare de « frénésie ». Elle ne se coupe pas en deux du
 * premier coup — on la tranche en boucle pendant quelques secondes avant
 * qu'elle n'éclate (cf. FRENZY_* dans constants.ts).
 */
export const FRENZY_VARIETY: FruitVariety = {
  key: 'grenade',
  displayName: 'Grenade',
  radius: px(70),
  skinColor: 0xb5243b,
  juiceColor: 0xd63b52,
  fleshColor: 0xe8455f,
  weight: 0, // jamais tirée au poids : spawn dédié dans le SpawnManager
};

/**
 * Papaye cyclone : le fruit qui déclenche la frénésie d'un seul coup de sabre.
 *
 * TROIS SIGNAUX QUI DISENT LA MÊME CHOSE, parce qu'un seul ne suffit pas
 * quand un fruit traverse l'écran en deux secondes.
 *
 *   LA SILHOUETTE. Une poire, celle de la papaye — une forme que le catalogue
 *   ordinaire n'utilise pas. Elle est aussi la plus grosse du jeu (88 px de
 *   rayon), pour être repérable au bord de l'écran.
 *
 *   LA COULEUR, et c'est la SEULE INVENTÉE DU CATALOGUE. Toutes les autres
 *   variétés ont été calées sur des photos réelles ; celle-ci ne le peut pas.
 *   Son métier est d'être reconnue en un dixième de seconde, or le catalogue
 *   occupe déjà le rouge, l'orange, le jaune, le vert, le violet et le
 *   magenta. Il ne restait que le bleu : indigo d'orage, chair turquoise.
 *
 *   LE MOTIF. Une spirale logarithmique à trois bras avec son œil au centre :
 *   un cyclone vu du ciel. Aucun autre fruit du jeu n'a de motif tournant.
 *
 * Le dessin de la papaye ORDINAIRE reste intact dans fruitArt.ts, sous sa
 * propre clé : si elle revient un jour au catalogue, rien n'est à défaire.
 */
export const CYCLONE_VARIETY: FruitVariety = {
  key: 'papaye_cyclone',
  displayName: 'Papaye cyclone',
  radius: px(88),
  skinColor: 0x2e2a78,
  juiceColor: 0x4ae8de,
  fleshColor: 0x8ff2ea,
  weight: 0, // jamais tirée au poids : spawn dédié dans le SpawnManager
};

export function wholeTextureKey(variety: FruitVariety): string {
  return `${variety.key}_whole`;
}

export function halfTextureKeys(variety: FruitVariety): { left: string; right: string } {
  return { left: `${variety.key}_half_left`, right: `${variety.key}_half_right` };
}

// ------------------------------------------------------------------
// Saisons réunionnaises
// ------------------------------------------------------------------

/**
 * Mois de pleine saison de chaque variété, à La Réunion — hémisphère sud,
 * donc l'été va de novembre à mars.
 *
 * Ce n'est pas de la décoration : un letchi en décembre et un goyavier en juin
 * sont des repères que tout le monde a ici. Le catalogue qui suit le vrai
 * calendrier donne au jeu une texture que personne ne peut copier depuis
 * ailleurs — et une raison de plus d'y revenir à un autre moment de l'année.
 */
const PEAK_MONTHS: Record<string, number[]> = {
  litchi: [11, 12, 1],
  goyavier: [5, 6, 7],
  mangue_jose: [11, 12, 1, 2],
  ananas_victoria: [9, 10, 11, 12],
  fruit_de_la_passion: [5, 6, 7, 8],
  corossol: [2, 3, 4, 5, 6],
  carambole: [4, 5, 6, 7, 8],
  pitaya: [12, 1, 2, 3],
};

/** En pleine saison, un fruit sort bien plus souvent. */
const PEAK_MULTIPLIER = 2.4;
/** Hors saison il se raréfie, mais ne disparaît jamais : un catalogue amputé
 *  se remarquerait plus qu'il ne plairait. */
const OFF_MULTIPLIER = 0.55;

/** Multiplicateur de poids d'une variété pour un mois donné (1 = janvier). */
export function seasonalMultiplier(key: string, month: number): number {
  const peak = PEAK_MONTHS[key];
  if (!peak) {
    return 1;
  }
  return peak.includes(month) ? PEAK_MULTIPLIER : OFF_MULTIPLIER;
}

/**
 * Tirage pondéré d'une variété : les petits fruits communs sortent plus
 * souvent, et la saison en cours pèse par-dessus.
 *
 * Le mois est passé en paramètre plutôt que lu ici : le Défi du jour doit
 * pouvoir servir exactement la même partie à tout le monde, or deux joueurs
 * peuvent être à cheval sur un changement de mois.
 */
export function pickRandomVariety(month = new Date().getMonth() + 1): FruitVariety {
  let total = 0;
  for (const variety of FRUIT_VARIETIES) {
    total += variety.weight * seasonalMultiplier(variety.key, month);
  }

  let roll = rnd() * total;
  for (const variety of FRUIT_VARIETIES) {
    roll -= variety.weight * seasonalMultiplier(variety.key, month);
    if (roll <= 0) {
      return variety;
    }
  }
  return FRUIT_VARIETIES[0]; // garde-fou arithmétique flottante
}
