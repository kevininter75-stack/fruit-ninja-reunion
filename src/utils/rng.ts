/**
 * Source unique de hasard pour le déroulé d'une partie.
 *
 * Raison d'être : le Défi du jour doit servir EXACTEMENT la même séquence de
 * fruits à tout le monde. Tant que le spawner appelle Math.random() en dix-neuf
 * endroits, c'est impossible — il suffit d'un tirage oublié pour que deux
 * joueurs ne jouent plus la même partie, et le défaut ne se voit qu'en
 * comparant deux parties côte à côte, donc jamais.
 *
 * Tout passe donc par ici. En mode libre, on retombe sur Math.random() et rien
 * ne change ; en mode semé, la suite est entièrement déterminée par la graine.
 *
 * ATTENTION : seuls les tirages qui influencent le DÉROULÉ doivent passer par
 * ce module. Un effet purement visuel — l'angle d'une éclaboussure, la teinte
 * d'une particule — doit garder Math.random(), sinon il consomme des valeurs
 * de la suite et décale la partie de tous ceux dont la machine n'affiche pas
 * exactement les mêmes effets.
 */

let source: () => number = Math.random;
let seeded = false;

/**
 * Générateur mulberry32 : rapide, sans état externe, et surtout stable —
 * une même graine donne la même suite sur toutes les machines et tous les
 * navigateurs, ce qui est la seule chose qui compte ici.
 */
function mulberry32(a: number): () => number {
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage de chaîne vers un entier 32 bits (FNV-1a). */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Passe en mode semé : la partie devient reproductible. */
export function seedRandom(seed: string): void {
  source = mulberry32(hashString(seed));
  seeded = true;
}

/** Repasse au hasard libre (parties Classique et Chrono). */
export function clearSeed(): void {
  source = Math.random;
  seeded = false;
}

export function isSeeded(): boolean {
  return seeded;
}

/** Flottant dans [0, 1). Remplace Math.random() dans la logique de jeu. */
export function rnd(): number {
  return source();
}

/** Flottant dans [min, max). Remplace Phaser.Math.FloatBetween. */
export function rndFloat(min: number, max: number): number {
  return min + source() * (max - min);
}

/** Entier dans [min, max], bornes comprises. Remplace Phaser.Math.Between. */
export function rndBetween(min: number, max: number): number {
  return Math.floor(min + source() * (max - min + 1));
}
