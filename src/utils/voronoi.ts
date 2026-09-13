/**
 * Champ de Voronoï 2D — les écailles des fruits à peau granuleuse.
 *
 * Construit sur F2 - F1, l'écart entre les deux germes les plus proches, et NON
 * sur la distance au germe le plus proche. F1 seul produit des dômes ronds,
 * isolés sur une surface lisse : des boutons posés sur une bille. F2 - F1
 * s'annule exactement sur les frontières entre cellules, ce qui produit des
 * PLAQUES JOINTIVES séparées de sillons fins — la peau d'un letchi.
 *
 * C'est l'enseignement le plus transposable du prototype Unity : la même erreur
 * y avait été commise, et le même changement de fonction l'avait corrigée.
 */

/** Hachage 2D déterministe : même graine, même peau à chaque chargement. */
function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2f) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Hauteur du champ dans [0, 1] : 0 au fond d'un sillon, 1 au sommet d'une
 * écaille bombée.
 *
 * Les écailles sont BOMBÉES et non des plateaux plats. Avec un plateau, le
 * relief ne varie qu'au droit des sillons — trop fins pour que l'éclairage y
 * lise autre chose qu'un trait — et le motif redevient un dessin posé sur une
 * bille au lieu d'une surface.
 */
export function voronoiHeight(
  x: number,
  y: number,
  scale: number,
  grooveWidth: number,
  seed: number
): number {
  const fx = x * scale;
  const fy = y * scale;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);

  let f1 = 8;
  let f2 = 8;

  // Voisinage 3x3 : en 2x2 on rate le germe le plus proche quand il est dans
  // une cellule diagonale, et le motif se fend de coutures droites.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx;
      const gy = cy + dy;
      const sx = gx + hash2(gx, gy, seed) - fx;
      const sy = gy + hash2(gx, gy, seed ^ 0x9e3779b9) - fy;
      const d = Math.sqrt(sx * sx + sy * sy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  const edge = Math.min(1, (f2 - f1) / grooveWidth);
  const plate = edge * edge * (3 - 2 * edge);
  // La distance au germe le plus proche vaut typiquement 0,3 à 0,5 dans une
  // cellule unité : un facteur trop fort écrase tout le champ vers zéro, et la
  // couleur des sillons finit par recouvrir la totalité du fruit.
  const mound = Math.max(0, 1 - f1 * 1.25);

  return plate * (0.48 + 0.52 * mound);
}
