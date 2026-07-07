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
  /** Couleur des particules de jus. */
  juiceColor: number;
  /** Couleur de la chair visible sur la tranche des moitiés. */
  fleshColor: number;
  /** Poids relatif de spawn (plus haut = plus fréquent). */
  weight: number;
}

export const FRUIT_VARIETIES: FruitVariety[] = [
  { key: 'litchi', displayName: 'Letchi', radius: 50, juiceColor: 0xf2b8c6, fleshColor: 0xfbe6d4, weight: 16 },
  { key: 'ananas_victoria', displayName: 'Ananas Victoria', radius: 66, juiceColor: 0xffd75e, fleshColor: 0xfff0b3, weight: 10 },
  { key: 'mangue_jose', displayName: 'Mangue José', radius: 64, juiceColor: 0xffb347, fleshColor: 0xffd08a, weight: 12 },
  { key: 'fruit_de_la_passion', displayName: 'Fruit de la passion', radius: 53, juiceColor: 0xffc93c, fleshColor: 0xffc93c, weight: 12 },
  { key: 'papaye', displayName: 'Papaye', radius: 66, juiceColor: 0xff8c42, fleshColor: 0xff9e5e, weight: 10 },
  { key: 'corossol', displayName: 'Corossol', radius: 64, juiceColor: 0xf5f0e6, fleshColor: 0xf7f3ea, weight: 8 },
  { key: 'longane', displayName: 'Longane', radius: 44, juiceColor: 0xf0e6d2, fleshColor: 0xf5eedd, weight: 12 },
  { key: 'jacque', displayName: 'Jacque', radius: 70, juiceColor: 0xffd75e, fleshColor: 0xf7e08a, weight: 6 },
  { key: 'carambole', displayName: 'Carambole', radius: 60, juiceColor: 0xfdf0a0, fleshColor: 0xfdf6c9, weight: 12 },
];

/** Fruit bonus : le combava doré déclenche un score x2 temporaire. */
export const BONUS_VARIETY: FruitVariety = {
  key: 'combava_bonus',
  displayName: 'Combava doré',
  radius: 55,
  juiceColor: 0xffe680,
  fleshColor: 0xfff2b3,
  weight: 0, // jamais tiré au poids : spawn dédié dans le SpawnManager
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
