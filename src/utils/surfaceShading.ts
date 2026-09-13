/**
 * Un moteur d'éclairage miniature pour les sprites de fruits.
 *
 * POURQUOI. Jusqu'ici les fruits étaient PEINTS : trois dégradés radiaux qui
 * imitent une sphère, plus une ellipse blanche en guise de reflet. C'est propre,
 * mais aucune lumière ne rencontre jamais de surface — d'où l'aspect de
 * vignette plate. Le prototype Unity paraissait réel pour une seule raison :
 * une vraie lumière y frappait de vraies normales.
 *
 * On peut faire la même chose ici. Les sprites sont générés EN CODE, une seule
 * fois au chargement : on peut donc se permettre un calcul par pixel que jamais
 * on ne s'autoriserait à l'exécution. Une fois la texture produite, le coût en
 * partie est exactement nul.
 *
 * CE QUI EST CALCULÉ, par pixel :
 *   normale de sphère, déformée par le relief de la peau
 *   diffus d'une lumière chaude en haut à gauche
 *   remplissage froid venant de l'autre côté (sinon l'ombre est un trou noir)
 *   spéculaire de Blinn-Phong pour le verni
 *   liseré de contre-jour sur le pourtour
 *   occlusion au fond des sillons
 *
 * C'est le modèle du shader Unity, transposé — mêmes termes, mêmes raisons.
 */

export interface SurfaceMaterial {
  /** Couleur de la peau, en 0-255. */
  albedo: [number, number, number];
  /** Couleur au fond des sillons : plus sombre et souvent plus saturée. */
  groove: [number, number, number];
  /** Couleur du liseré de contre-jour. */
  rim: [number, number, number];
  /** 0 = mat, 1 = verni. Commande l'intensité et la dureté du spéculaire. */
  smoothness: number;
  /** Force de la déformation de normale par le relief de peau. */
  bump: number;
}

/** Lumière d'un couchant réunionnais : chaude et rasante. */
const KEY = normalize(-0.46, -0.58, 0.67);
const KEY_COLOR: [number, number, number] = [1.0, 0.9, 0.78];
/** Remplissage froid venant du ciel opposé : sans lui, l'ombre est un trou. */
const FILL = normalize(0.52, 0.34, 0.45);
const FILL_COLOR: [number, number, number] = [0.44, 0.56, 0.78];
const AMBIENT = 0.36;

function normalize(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/**
 * Éclaire une surface sphérique et la dessine dans le contexte courant.
 *
 * <paramref name="height"/> donne le relief de la peau dans [0, 1] : 0 au fond
 * d'un sillon, 1 au sommet d'une écaille. Passer null donne une peau lisse.
 *
 * Le champ de relief est échantillonné UNE fois dans un tableau, puis les
 * pentes s'en déduisent par différences avec les pixels voisins. Le calculer à
 * nouveau pour chaque pente coûterait cinq fois plus cher pour un résultat
 * identique.
 */
/**
 * Mémoire des surfaces déjà calculées.
 *
 * Chaque fruit est peint TROIS fois — entier, moitié gauche, moitié droite —
 * et les trois partagent exactement la même surface : seul le découpage
 * change. Sans cette mémoire, on payait le calcul trois fois pour un résultat
 * identique. Mesuré : 35,6 ms par sprite, soit plus d'une seconde de
 * chargement pour dix variétés.
 */
const surfaceCache = new Map<string, HTMLCanvasElement>();

export function shadeSphericalSurface(
  ctx: CanvasRenderingContext2D,
  size: number,
  radius: number,
  material: SurfaceMaterial,
  height: ((x: number, y: number) => number) | null,
  cacheKey?: string
): void {

  // Facteur de suréchantillonnage lu sur la transformation du contexte. Le
  // générateur de textures peint à 3x puis réduit : sans cette lecture, on
  // calculerait une image basse résolution étirée, et tout le bénéfice du
  // suréchantillonnage serait perdu exactement là où il compte — sur le relief.
  const ss = Math.max(1, Math.round(ctx.getTransform().a));

  // La clé inclut le suréchantillonnage : deux facteurs différents ne peuvent
  // évidemment pas partager la même surface.
  const cle = cacheKey ? `${cacheKey}|x${ss}` : null;
  if (cle) {
    const cached = surfaceCache.get(cle);
    if (cached) {
      ctx.drawImage(cached, 0, 0, size, size);
      return;
    }
  }

  const px = Math.round(size * ss);
  const c = px / 2;
  const radiusPx = radius * ss;
  const field = new Float32Array(px * px);

  // Le relief n'est calculé que DANS le fruit, avec une marge d'un pixel pour
  // que les pentes du bord restent justes. Au-delà, la silhouette découpe de
  // toute façon : c'était un tiers du travail jeté.
  const portee = Math.ceil(radiusPx) + 2;
  const xMin = Math.max(0, Math.floor(c - portee));
  const xMax = Math.min(px, Math.ceil(c + portee));
  const yMin = Math.max(0, Math.floor(c - portee));
  const yMax = Math.min(px, Math.ceil(c + portee));

  if (height) {
    for (let y = yMin; y < yMax; y++) {
      for (let x = xMin; x < xMax; x++) {
        // La fonction de relief raisonne en coordonnées LOGIQUES : on lui
        // repasse donc la position divisée par le suréchantillonnage, sinon
        // les écailles rétréciraient d'autant.
        field[y * px + x] = height(x / ss, y / ss);
      }
    }
  }

  const image = ctx.createImageData(px, px);
  const data = image.data;
  const shininess = 8 + material.smoothness * 90;

  for (let py = yMin; py < yMax; py++) {
    for (let pxi = xMin; pxi < xMax; pxi++) {
      const i = py * px + pxi;

      // Normale de sphère. Au-delà du rayon on rabat la normale vers le
      // tranchant : c'est la zone du contour, celle que le liseré allume.
      const dx = (pxi - c) / radiusPx;
      const dy = (py - c) / radiusPx;
      const d2 = dx * dx + dy * dy;
      const nzBase = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));

      let nx = dx;
      let ny = dy;
      let nz = nzBase;

      const h = height ? field[i] : 1;

      if (height) {
        // Pente du relief, par différences centrées. Aux bords du sprite on
        // retombe sur le pixel courant plutôt que de sortir du tableau.
        const xm = pxi > 0 ? field[i - 1] : h;
        const xp = pxi < px - 1 ? field[i + 1] : h;
        const ym = py > 0 ? field[i - px] : h;
        const yp = py < px - 1 ? field[i + px] : h;
        nx -= (xp - xm) * material.bump * ss;
        ny -= (yp - ym) * material.bump * ss;
      }

      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const diffuse = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      const fill = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);

      // Blinn-Phong : le vecteur à mi-chemin entre la lumière et l'œil. Moins
      // cher qu'un vrai reflet, et impossible à distinguer sur une sphère.
      const hx = KEY[0];
      const hy = KEY[1];
      const hz = KEY[2] + 1;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
      const specular = Math.pow(ndh, shininess) * material.smoothness;

      // Contre-jour : ce qui rase le bord du fruit s'allume. C'est ce terme
      // qui détache la silhouette du décor sans ajouter de contour dessiné.
      const rim = Math.pow(1 - nzBase, 3.2);

      // Les sillons reçoivent moins de lumière ambiante que les sommets.
      const occlusion = height ? 0.66 + 0.34 * h : 1;

      // La couleur de base vire vers celle des sillons dans les creux.
      // Le mélange part de 0,38 et non de 0 : au fond d'un sillon la peau reste
      // de la peau, simplement plus sombre. À zéro, le fruit entier prenait la
      // teinte des sillons et virait au bordeaux.
      const mix = height ? Math.min(1, 0.38 + h * 0.85) : 1;
      const ar = material.groove[0] + (material.albedo[0] - material.groove[0]) * mix;
      const ag = material.groove[1] + (material.albedo[1] - material.groove[1]) * mix;
      const ab = material.groove[2] + (material.albedo[2] - material.groove[2]) * mix;

      const lightR = AMBIENT + diffuse * KEY_COLOR[0] + fill * 0.5 * FILL_COLOR[0];
      const lightG = AMBIENT + diffuse * KEY_COLOR[1] + fill * 0.5 * FILL_COLOR[1];
      const lightB = AMBIENT + diffuse * KEY_COLOR[2] + fill * 0.5 * FILL_COLOR[2];

      const specAmount = specular * 235;
      const rimAmount = rim * 0.55;

      const o = i * 4;
      data[o] = clamp255(ar * lightR * occlusion + specAmount + material.rim[0] * rimAmount);
      data[o + 1] = clamp255(ag * lightG * occlusion + specAmount + material.rim[1] * rimAmount);
      data[o + 2] = clamp255(ab * lightB * occlusion + specAmount + material.rim[2] * rimAmount);
      data[o + 3] = 255;
    }
  }

  // Passage par un canevas intermédiaire : putImageData ignore le clip, et la
  // surface déborderait de la silhouette du fruit.
  const buffer = document.createElement('canvas');
  buffer.width = px;
  buffer.height = px;
  buffer.getContext('2d')!.putImageData(image, 0, 0);
  // Dessiné en coordonnées logiques : la transformation du contexte remet
  // l'image à l'échelle, et le suréchantillonnage se fait à la réduction.
  ctx.drawImage(buffer, 0, 0, size, size);

  if (cle) {
    surfaceCache.set(cle, buffer);
  }
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
