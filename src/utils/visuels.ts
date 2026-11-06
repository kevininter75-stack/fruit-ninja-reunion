import Phaser from 'phaser';
import { type FruitVariety, wholeTextureKey, halfTextureKeys } from './fruitCatalog';

/** Images de production : les clés publiques du jeu et ses rayons restent identiques. */
export const DECOR_ILLUSTRE = 'decor_lagon_illustre';
export const EFFETS_JUS = 'planche_jus_illustree';
export const FICHIERS_FRUITS: Readonly<Record<string, string>> = {
  litchi: 'letchi',
  goyavier: 'goyavier',
  ananas_victoria: 'ananas',
  mangue_jose: 'mangue',
  fruit_de_la_passion: 'passion',
  pitaya: 'pitaya',
  corossol: 'corossol',
  carambole: 'carambole',
  combava_bonus: 'combava',
  piment_cabri: 'piment',
  papaye_cyclone: 'cyclone',
  longane_givre: 'longani',
};

const texturesIllustrees = new Set<string>();

export function clePlancheFruit(cle: string): string {
  return `planche_illustree_${cle}`;
}

export function estFruitIllustre(cleTexture: string): boolean {
  return texturesIllustrees.has(cleTexture);
}

/** Quatre cellules : une goutte et trois taches, sans modifier les émetteurs. */
export function creerTextureEffet(scene: Phaser.Scene, cellule: number, cle: string, taille: number): boolean {
  if (!scene.textures.exists(EFFETS_JUS)) {
    return false;
  }
  const source = scene.textures.get(EFFETS_JUS).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas(cle, taille, taille);
  if (texture === null) {
    return false;
  }
  const contexte = texture.getContext();
  contexte.imageSmoothingEnabled = true;
  contexte.imageSmoothingQuality = 'high';
  contexte.drawImage(source, (cellule % 2) * source.width / 2, Math.floor(cellule / 2) * source.height / 2,
    source.width / 2, source.height / 2, 0, 0, taille, taille);
  texture.refresh();
  return true;
}

/**
 * Chaque planche contient entier / moitié gauche / moitié droite sur fond transparent.
 * Les trois cadres ont exactement la taille des anciennes textures : ni les corps
 * physiques, ni les cibles de coupe, ni les animations de pool n'ont à changer.
 */
export function creerTexturesIllustrees(scene: Phaser.Scene, fruit: FruitVariety, taille: number): boolean {
  const sourceCle = clePlancheFruit(fruit.key);
  if (!scene.textures.exists(sourceCle)) {
    return false;
  }
  const source = scene.textures.get(sourceCle).getSourceImage() as HTMLImageElement;
  const largeurCase = source.width / 3;
  const moities = halfTextureKeys(fruit);
  const cles = [wholeTextureKey(fruit), moities.left, moities.right];
  for (let i = 0; i < cles.length; i++) {
    const texture = scene.textures.createCanvas(cles[i], taille, taille);
    if (texture === null) {
      return false;
    }
    const contexte = texture.getContext();
    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = 'high';
    contexte.drawImage(source, i * largeurCase, 0, largeurCase, source.height, 0, 0, taille, taille);
    texture.refresh();
    texturesIllustrees.add(cles[i]);
  }
  // Les sources haute définition ne restent pas en double sur le GPU après préparation.
  scene.textures.remove(sourceCle);
  return true;
}
