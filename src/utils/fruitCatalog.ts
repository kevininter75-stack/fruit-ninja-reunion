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
  { key: 'litchi', displayName: 'Letchi', radius: 60, skinColor: 0xd93b52, juiceColor: 0xf2b8c6, fleshColor: 0xfbe6d4, weight: 16 },
  // Petit, rapide, il rapporte plus. Et « la saison des goyaviers » est la
  // référence fruitière la plus partagée de l'île.
  // Mesuré : teinte 11°, dominante #9C4935, pointe #E57862.
  { key: 'goyavier', displayName: 'Goyavier', radius: 44, skinColor: 0xc0442e, juiceColor: 0xef8a6a, fleshColor: 0xf7e8dd, weight: 14 },
  { key: 'ananas_victoria', displayName: 'Ananas Victoria', radius: 79, skinColor: 0xe8a417, juiceColor: 0xffd75e, fleshColor: 0xffe07a, weight: 10 },
  { key: 'mangue_jose', displayName: 'Mangue José', radius: 77, skinColor: 0xf08a20, juiceColor: 0xffb347, fleshColor: 0xffc35e, weight: 12 },
  { key: 'fruit_de_la_passion', displayName: 'Fruit de la passion', radius: 64, skinColor: 0x6b3576, juiceColor: 0xffc93c, fleshColor: 0xffc93c, weight: 12 },
  // La coupe la plus spectaculaire du catalogue : chair blanche mouchetée de
  // noir sur une peau fuchsia. Mesuré : teinte 350°, dominante #8F3D4A.
  { key: 'pitaya', displayName: 'Pitaya', radius: 82, skinColor: 0xd93b6e, juiceColor: 0xf7c8da, fleshColor: 0xf7f5f5, weight: 9 },
  { key: 'corossol', displayName: 'Corossol', radius: 77, skinColor: 0x74a94e, juiceColor: 0xf5f0e6, fleshColor: 0xf7f3ea, weight: 8 },
  { key: 'carambole', displayName: 'Carambole', radius: 72, skinColor: 0xf2cf3f, juiceColor: 0xfdf0a0, fleshColor: 0xfdf6c9, weight: 12 },
];

/** Fruit bonus : le combava doré déclenche un score x2 temporaire. */
export const BONUS_VARIETY: FruitVariety = {
  key: 'combava_bonus',
  displayName: 'Combava doré',
  radius: 66,
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
  radius: 70,
  skinColor: 0xb5243b,
  juiceColor: 0xd63b52,
  fleshColor: 0xe8455f,
  weight: 0, // jamais tirée au poids : spawn dédié dans le SpawnManager
};

export function wholeTextureKey(variety: FruitVariety): string {
  return `${variety.key}_whole`;
}

export function halfTextureKeys(variety: FruitVariety): { left: string; right: string } {
  return { left: `${variety.key}_half_left`, right: `${variety.key}_half_right` };
}

// Somme des poids précalculée pour le tirage pondéré
const TOTAL_WEIGHT = FRUIT_VARIETIES.reduce((sum, v) => sum + v.weight, 0);

/** Tirage pondéré d'une variété (les petits fruits communs sortent plus souvent). */
export function pickRandomVariety(): FruitVariety {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const variety of FRUIT_VARIETIES) {
    roll -= variety.weight;
    if (roll <= 0) {
      return variety;
    }
  }
  return FRUIT_VARIETIES[0]; // garde-fou arithmétique flottante
}
