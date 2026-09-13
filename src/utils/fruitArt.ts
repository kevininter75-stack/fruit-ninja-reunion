/**
 * Rendu graphique des fruits (canvas 2D).
 *
 * Trois principes rendent un fruit reconnaissable en un coup d'œil, même
 * petit et en mouvement — ce module les applique à chaque variété :
 *  1. la SILHOUETTE porte l'identité (l'ananas est un tonneau couronné, la
 *     carambole une étoile, le corossol un ovale hérissé) ;
 *  2. un CONTOUR sombre détache la forme du décor, façon dessin animé ;
 *  3. la CHAIR à la coupe achève l'identification (pépins noirs du fruit de
 *     la passion, gros noyau plat de la mangue, quartiers du combava).
 *
 * Le tracé de chaque silhouette est isolé dans une fonction `trace*` : on
 * le réutilise tel quel pour le corps, pour le clipping des détails, pour le
 * contour, et — rétréci vers le centre — pour la chair des moitiés. Une
 * seule définition de forme par fruit, donc aucun risque de désynchronisation
 * entre l'entier et ses moitiés.
 *
 * Tout est procédural : aucun fichier image requis. Quand de vrais sprites
 * arriveront, seul PreloadScene changera — les clés de texture sont stables.
 */
import type { FruitVariety } from './fruitCatalog';
import { shadeSphericalSurface, type SurfaceMaterial } from './surfaceShading';
import { voronoiHeight } from './voronoi';

const TAU = Math.PI * 2;

/** Épaisseur du contour cartoon (constante quelle que soit la taille du fruit). */
const OUTLINE_WIDTH = 4;

/** Part du rayon conservée en peau sur une moitié : le reste est de la chair. */
const FLESH_SHRINK = 0.84;

// ------------------------------------------------------------------
// Utilitaires couleur et lumière
// ------------------------------------------------------------------

/** Convertit une couleur hex numérique en chaîne CSS (#rrggbb). */
export function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Éclaircit (amt > 0) ou assombrit (amt < 0, jusqu'à -1) une couleur hex. */
export function shade(color: number, amt: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (ch: number): number =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? ch + (255 - ch) * amt : ch * (1 + amt))));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Même chose mais avec transparence, pour les voiles et ombres teintées. */
function shadeAlpha(color: number, amt: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (ch: number): number =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? ch + (255 - ch) * amt : ch * (1 + amt))));
  return `rgba(${f(r)}, ${f(g)}, ${f(b)}, ${alpha})`;
}

/**
 * Dégradé "sphère éclairée" : source lumineuse en haut-gauche, ombre au
 * bord opposé → donne du volume 3D à un aplat.
 */
export function sphereGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  base: number
): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.35, r * 0.1, cx, cy, r * 1.08);
  g.addColorStop(0, shade(base, 0.46));
  g.addColorStop(0.55, shade(base, 0.04));
  g.addColorStop(1, shade(base, -0.44));
  return g;
}

/** Reflet brillant (spéculaire) en haut-gauche, pour l'aspect verni. */
export function addGloss(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const gx = cx - r * 0.34;
  const gy = cy - r * 0.4;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.46);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(gx, gy, r * 0.44, r * 0.34, -0.5, 0, TAU);
  ctx.fill();
}

// ------------------------------------------------------------------
// Tracés de silhouettes — l'identité visuelle du fruit
// ------------------------------------------------------------------

/**
 * Contour "lobé" : une ellipse dont le rayon ondule, ce qui produit des
 * bosses SUR LE CONTOUR (letchi granuleux, jacque à picots). C'est la
 * déformation du contour — pas les motifs internes — qui fait lire la
 * texture d'un fruit à petite taille.
 */
function traceLobed(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lobes: number,
  amp: number,
  rot = 0
): void {
  const STEPS = 168;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * TAU;
    const k = 1 + amp * Math.cos(lobes * t);
    const x = Math.cos(t) * rx * k;
    const y = Math.sin(t) * ry * k;
    const px = cx + x * cosR - y * sinR;
    const py = cy + x * sinR + y * cosR;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

/** Ovoïde hérissé du corossol : pointes molles orientées vers l'extérieur. */
function traceSoursop(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const STEPS = 200;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * TAU;
    // Les pointes ne sortent que vers l'extérieur (max(0, cos)) : ailleurs
    // le contour reste lisse, sinon la silhouette devient une étoile.
    const spikes = 1 + 0.085 * Math.max(0, Math.cos(11 * t));
    // Corps effilé vers le haut (côté pédoncule), renflé en bas.
    const taper = 1 - 0.16 * Math.max(0, -Math.sin(t));
    const px = cx + Math.cos(t) * r * 0.8 * spikes * taper;
    const py = cy + Math.sin(t) * r * 0.95 * spikes;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

/** Silhouette en rein de la mangue : lobe renflé, bec effilé. */
function traceMango(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const w = r * 0.95;
  const h = r * 0.7;
  ctx.moveTo(cx - w, cy + h * 0.1);
  ctx.bezierCurveTo(cx - w * 0.98, cy - h * 0.9, cx - w * 0.15, cy - h * 1.2, cx + w * 0.55, cy - h * 0.8);
  ctx.bezierCurveTo(cx + w * 1.08, cy - h * 0.55, cx + w * 1.05, cy + h * 0.3, cx + w * 0.45, cy + h * 0.8);
  ctx.bezierCurveTo(cx - w * 0.1, cy + h * 1.2, cx - w * 0.82, cy + h, cx - w, cy + h * 0.1);
  ctx.closePath();
}

/** Silhouette en poire allongée de la papaye. */
function tracePear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const rx = r * 0.6;
  const ry = r * 0.95;
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * 0.6, cy - ry * 0.98, cx + rx * 0.84, cy - ry * 0.32, cx + rx * 0.9, cy + ry * 0.12);
  ctx.bezierCurveTo(cx + rx * 0.96, cy + ry * 0.74, cx + rx * 0.52, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * 0.52, cy + ry, cx - rx * 0.96, cy + ry * 0.74, cx - rx * 0.9, cy + ry * 0.12);
  ctx.bezierCurveTo(cx - rx * 0.84, cy - ry * 0.32, cx - rx * 0.6, cy - ry * 0.98, cx, cy - ry);
  ctx.closePath();
}

/** Corps en tonneau de l'ananas (épaules marquées, base arrondie). */
function traceBarrel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): void {
  ctx.moveTo(cx - rx, cy - ry * 0.5);
  ctx.bezierCurveTo(cx - rx * 0.95, cy - ry * 1.05, cx + rx * 0.95, cy - ry * 1.05, cx + rx, cy - ry * 0.5);
  ctx.bezierCurveTo(cx + rx * 1.06, cy + ry * 0.32, cx + rx * 0.72, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * 0.72, cy + ry, cx - rx * 1.06, cy + ry * 0.32, cx - rx, cy - ry * 0.5);
  ctx.closePath();
}

/** Étoile à 5 branches aux creux incurvés — la carambole vue en coupe. */
function traceStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rOut: number,
  rIn: number
): void {
  const POINTS = 5;
  for (let i = 0; i < POINTS; i++) {
    const aTip = (i / POINTS) * TAU - Math.PI / 2;
    const aValley = ((i + 0.5) / POINTS) * TAU - Math.PI / 2;
    const aNext = ((i + 1) / POINTS) * TAU - Math.PI / 2;
    const tipX = cx + Math.cos(aTip) * rOut;
    const tipY = cy + Math.sin(aTip) * rOut;
    if (i === 0) {
      ctx.moveTo(tipX, tipY);
    }
    // Le creux sert de point de contrôle : les flancs des branches
    // se creusent, comme les arêtes d'une vraie carambole.
    ctx.quadraticCurveTo(
      cx + Math.cos(aValley) * rIn,
      cy + Math.sin(aValley) * rIn,
      cx + Math.cos(aNext) * rOut,
      cy + Math.sin(aNext) * rOut
    );
  }
  ctx.closePath();
}

/** Trace la silhouette d'une variété dans le repère de sa texture. */
function traceSilhouette(ctx: CanvasRenderingContext2D, variety: FruitVariety, size: number): void {
  const c = size / 2;
  const r = variety.radius;

  switch (variety.key) {
    case 'litchi':
      traceLobed(ctx, c, c, r * 0.96, r, 11, 0.05);
      break;
    case 'longane':
      traceLobed(ctx, c, c, r, r * 0.97, 1, 0);
      break;
    case 'combava_bonus':
      traceLobed(ctx, c, c, r * 0.94, r * 0.9, 12, 0.055);
      break;
    case 'fruit_de_la_passion':
      traceLobed(ctx, c, c, r * 0.98, r, 1, 0);
      break;
    case 'ananas_victoria':
      traceBarrel(ctx, c, c + r * 0.12, r * 0.66, r * 0.84);
      break;
    case 'mangue_jose':
      traceMango(ctx, c, c, r);
      break;
    case 'papaye':
      tracePear(ctx, c, c, r);
      break;
    case 'corossol':
      traceSoursop(ctx, c, c, r);
      break;
    case 'jacque':
      traceLobed(ctx, c, c, r * 0.78, r * 0.94, 15, 0.05, -0.14);
      break;
    case 'carambole':
      traceStar(ctx, c, c, r, r * 0.44);
      break;
    case 'goyavier':
      // Presque sphérique, à peine bosselé : un goyavier est une petite bille.
      traceLobed(ctx, c, c, r * 0.99, r, 3, 0.022);
      break;
    case 'pitaya':
      // Ovoïde franc, nettement plus haut que large. Les bractées sont
      // peintes par-dessus et ne font PAS partie de la silhouette : elles
      // dépassent du corps, et les inclure dans le tracé de découpe donnerait
      // des moitiés aux contours en dents de scie.
      traceLobed(ctx, c, c, r * 0.68, r, 1, 0);
      break;
    case 'grenade':
      // Sphère légèrement aplatie et un peu anguleuse, comme une vraie grenade
      traceLobed(ctx, c, c, r * 0.97, r * 0.94, 6, 0.025);
      break;
    default:
      traceLobed(ctx, c, c, r, r, 1, 0);
  }
}

/**
 * Installe la silhouette comme chemin courant, éventuellement rétrécie vers
 * le centre. La transformation est appliquée pendant la CONSTRUCTION du
 * chemin puis annulée : le fill/stroke qui suit travaille en coordonnées
 * réelles, donc l'épaisseur du contour reste constante.
 */
function buildPath(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number,
  shrink = 1
): void {
  const c = size / 2;
  ctx.beginPath();
  if (shrink === 1) {
    traceSilhouette(ctx, variety, size);
    return;
  }
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(shrink, shrink);
  ctx.translate(-c, -c);
  traceSilhouette(ctx, variety, size);
  ctx.restore();
}

// ------------------------------------------------------------------
// Éléments décoratifs partagés (pédoncules, feuilles)
// ------------------------------------------------------------------

/** Pédoncule : petite tige brune, signal fort que l'objet est un fruit. */
function drawStem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  tilt: number,
  color = '#7a5230'
): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, length * 0.28);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + tilt * length * 0.3, y - length * 0.6, x + tilt * length * 0.8, y - length);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Feuille lancéolée avec nervure, orientée par `angle`. */
function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  angle: number,
  color = 0x3f8f45
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const halfW = length * 0.32;
  ctx.fillStyle = shade(color, 0.05);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.45, -halfW, length, 0);
  ctx.quadraticCurveTo(length * 0.45, halfW, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Nervure centrale
  ctx.beginPath();
  ctx.moveTo(length * 0.08, 0);
  ctx.lineTo(length * 0.9, 0);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------
// Peinture du corps : volume, motifs, contour
// ------------------------------------------------------------------

/**
 * Peint un corps de fruit complet : dégradé de volume, motifs internes
 * confinés à la silhouette, ombre interne côté opposé à la lumière,
 * contour sombre puis reflet verni.
 *
 * L'ombre portée (shadowBlur du contexte) n'est appliquée qu'au premier
 * remplissage : sinon chaque détail interne traînerait son propre halo et
 * le fruit deviendrait sale.
 */
function paintBody(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number,
  base: number,
  details?: () => void
): void {
  const c = size / 2;
  const r = variety.radius;

  // 1. Corps : volume par dégradé sphérique (porte l'ombre portée)
  buildPath(ctx, variety, size);
  ctx.fillStyle = sphereGradient(ctx, c, c, r, base);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // 2. Motifs internes, confinés à la silhouette
  if (details !== undefined) {
    ctx.save();
    buildPath(ctx, variety, size);
    ctx.clip();
    details();
    ctx.restore();
  }

  // 3. Ombre interne au bord : assoit le volume après les motifs
  ctx.save();
  buildPath(ctx, variety, size);
  ctx.clip();
  const inner = ctx.createRadialGradient(c - r * 0.3, c - r * 0.34, r * 0.2, c, c, r * 1.06);
  inner.addColorStop(0, 'rgba(0, 0, 0, 0)');
  inner.addColorStop(0.68, 'rgba(0, 0, 0, 0)');
  inner.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 4. Contour sombre : c'est lui qui rend la forme lisible sur le décor
  buildPath(ctx, variety, size);
  ctx.strokeStyle = shade(base, -0.66);
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 5. Reflet verni, borné à la silhouette
  ctx.save();
  buildPath(ctx, variety, size);
  ctx.clip();
  addGloss(ctx, c, c, r);
  ctx.restore();
}

/** Semis de petits points sombres/clairs — grain de peau (letchi, longane). */
// ------------------------------------------------------------------
// Corps éclairé
// ------------------------------------------------------------------

/** Décompose une couleur 0xRRGGBB en trois composantes 0-255. */
function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

/** Assombrit une couleur, en composantes 0-255. */
function darken(color: number, amount: number): [number, number, number] {
  const k = 1 - amount;
  return [((color >> 16) & 255) * k, ((color >> 8) & 255) * k, (color & 255) * k];
}

/**
 * Matériau dérivé de la couleur de peau de la variété.
 *
 * La couleur des sillons n'est pas choisie à part : c'est la peau assombrie.
 * Un sillon reste de la peau — lui donner une teinte indépendante produit des
 * fruits qui semblent peints en deux couches, ce qu'aucun fruit n'est.
 */
function skinMaterial(
  skin: number,
  grooveAmount: number,
  smoothness: number,
  bump: number,
  rimColor: [number, number, number]
): SurfaceMaterial {
  return {
    albedo: rgb(skin),
    groove: darken(skin, grooveAmount),
    rim: rimColor,
    smoothness,
    bump,
  };
}

/**
 * Peint un corps de fruit RÉELLEMENT ÉCLAIRÉ, au lieu de l'imiter par des
 * dégradés radiaux.
 *
 * Remplace paintBody pour les fruits dont la peau a du relief. La différence
 * tient en une phrase : paintBody peint ce à quoi ressemble un fruit éclairé,
 * celui-ci éclaire une surface. Le reflet se déplace donc correctement sur les
 * écailles, les sillons s'assombrissent d'eux-mêmes, et le contre-jour détache
 * la silhouette sans qu'on ait à dessiner un contour.
 *
 * Le coût est payé UNE FOIS, à la génération de la texture. En partie, rien.
 */
function paintShadedBody(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number,
  material: SurfaceMaterial,
  height: ((x: number, y: number) => number) | null,
  details?: () => void
): void {
  const c = size / 2;
  const r = variety.radius;

  // L'ombre portée doit être posée AVANT la surface éclairée : elle se peint
  // sur un premier remplissage plat, sinon chaque pixel de la surface
  // traînerait son propre halo.
  buildPath(ctx, variety, size);
  ctx.fillStyle = shade(variety.skinColor, -0.5);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.save();
  buildPath(ctx, variety, size);
  ctx.clip();
  // La clé mêle la variété et la taille : deux tailles différentes ne
  // peuvent pas partager la même surface.
  shadeSphericalSurface(ctx, size, r, material, height, `${variety.key}|${size}`);
  if (details !== undefined) {
    details();
  }
  ctx.restore();

  // Contour sombre, plus fin que sur un corps peint : le contre-jour fait déjà
  // une partie du travail de détachement.
  buildPath(ctx, variety, size);
  ctx.strokeStyle = shade(variety.skinColor, -0.72);
  ctx.lineWidth = OUTLINE_WIDTH * 0.7;
  ctx.lineJoin = 'round';
  ctx.stroke();

  void c;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  count: number,
  color: string,
  dotRadius: number
): void {
  ctx.fillStyle = color;
  // Spirale de Vogel : répartition régulière sans amas, et déterministe.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const rad = r * 0.96 * Math.sqrt(i / count);
    const angle = i * golden;
    ctx.beginPath();
    ctx.arc(c + Math.cos(angle) * rad, c + Math.sin(angle) * rad, dotRadius, 0, TAU);
    ctx.fill();
  }
}

/**
 * Dessine un fruit entier (silhouette + motifs + accessoires).
 *
 * Le corps est peint SOUS PLEINE LUMIÈRE, sans le galbe de la sphère :
 * celui-ci est posé à l'affichage par la teinte du sprite, calculée en espace
 * écran, et c'est ce qui l'empêche de tourner avec le fruit. Entiers et
 * moitiés sont donc peints à l'identique — et partagent la même surface en
 * cache, ce qui divise par deux le temps de génération.
 */
export function paintWhole(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number
): void {
  const c = size / 2;
  const r = variety.radius;
  const skin = variety.skinColor;

  switch (variety.key) {
    case 'litchi': {
      // Écailles polygonales éclairées : la lumière rase les plaques, les
      // sillons s'assombrissent d'eux-mêmes, et le reflet se déplace sur le
      // relief au lieu d'être une ellipse blanche collée par-dessus.
      paintShadedBody(
        ctx,
        variety,
        size,
        {
          albedo: rgb(skin),
          groove: [86, 16, 34],
          rim: [255, 150, 120],
          smoothness: 0.34,
          bump: 26,
        },
        (x, y) => voronoiHeight(x, y, 19 / size, 0.2, 0x5ab3)
      );
      drawStem(ctx, c + r * 0.1, c - r * 0.92, r * 0.32, 0.6);
      break;
    }

    case 'ananas_victoria': {
      const bodyCy = c + r * 0.12;
      const bodyRy = r * 0.84;
      const bodyRx = r * 0.66;

      // Couronne dessinée AVANT le corps : les feuilles partent de derrière
      // et le corps recouvre proprement leur base.
      const crownBase = bodyCy - bodyRy * 0.86;
      for (const [dx, tipDx, tipDy, tone] of [
        [-0.85, -1.5, -0.6, -0.32],
        [0.85, 1.5, -0.56, -0.32],
        [-0.5, -1.05, -0.95, -0.2],
        [0.52, 1.08, -0.92, -0.2],
        [-0.24, -0.5, -1.25, -0.05],
        [0.26, 0.54, -1.22, -0.05],
        [-0.06, -0.1, -1.45, 0.12],
        [0.1, 0.18, -1.4, 0.12],
      ] as const) {
        ctx.fillStyle = shade(0x3d8b3f, tone);
        ctx.strokeStyle = shade(0x3d8b3f, -0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c + dx * r * 0.4 - r * 0.17, crownBase);
        // Feuille en pointe, légèrement incurvée : silhouette dentelée
        ctx.quadraticCurveTo(
          c + tipDx * r * 0.3,
          crownBase + tipDy * r * 0.3,
          c + tipDx * r * 0.42,
          crownBase + tipDy * r * 0.44
        );
        ctx.quadraticCurveTo(
          c + tipDx * r * 0.14,
          crownBase + tipDy * r * 0.24,
          c + dx * r * 0.4 + r * 0.17,
          crownBase
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.5, 0.3, 20, [255, 214, 150]), (x, y) => voronoiHeight(x, y, 11 / size, 0.26, 0x1a77), () => {
        // Quadrillage en losanges + "œil" brun au centre de chaque écaille :
        // c'est ce motif, plus que la couleur, qui dit « ananas ».
        const step = r * 0.29;
        ctx.strokeStyle = shadeAlpha(skin, -0.5, 0.8);
        ctx.lineWidth = 2;
        for (let d = -size; d < size * 2; d += step) {
          ctx.beginPath();
          ctx.moveTo(d, 0);
          ctx.lineTo(d + size, size);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(d + size, 0);
          ctx.lineTo(d, size);
          ctx.stroke();
        }
        for (let row = -4; row <= 4; row++) {
          for (let col = -4; col <= 4; col++) {
            const px = c + col * step + (row % 2 === 0 ? 0 : step / 2);
            const py = bodyCy + row * step;
            ctx.fillStyle = shadeAlpha(skin, -0.55, 0.85);
            ctx.beginPath();
            ctx.arc(px, py, step * 0.16, 0, TAU);
            ctx.fill();
            ctx.fillStyle = shadeAlpha(skin, 0.45, 0.6);
            ctx.beginPath();
            ctx.arc(px - step * 0.1, py - step * 0.12, step * 0.1, 0, TAU);
            ctx.fill();
          }
        }
      });
      // Rappel du volume cylindrique : bord droit assombri
      ctx.save();
      buildPath(ctx, variety, size);
      ctx.clip();
      const side = ctx.createLinearGradient(c - bodyRx, 0, c + bodyRx, 0);
      side.addColorStop(0, 'rgba(0,0,0,0.18)');
      side.addColorStop(0.4, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
      break;
    }

    case 'mangue_jose': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.45, 0.62, 0, [255, 186, 120]), null, () => {
        // Joue rouge du côté exposé au soleil — signature de la mangue José.
        // Placée à DROITE : le reflet verni occupe le haut-gauche et
        // effacerait complètement un dégradé rouge posé au même endroit.
        const blush = ctx.createRadialGradient(
          c + r * 0.55,
          c + r * 0.1,
          r * 0.05,
          c + r * 0.45,
          c + r * 0.08,
          r * 1.1
        );
        blush.addColorStop(0, 'rgba(206, 34, 30, 0.95)');
        blush.addColorStop(0.45, 'rgba(224, 72, 34, 0.7)');
        blush.addColorStop(1, 'rgba(230, 120, 40, 0)');
        ctx.fillStyle = blush;
        ctx.fillRect(0, 0, size, size);
        // Épaule verte côté pédoncule : le contraste vert/rouge/orange est
        // ce qui distingue une mangue d'un abricot géant.
        const shoulder = ctx.createRadialGradient(
          c - r * 0.75,
          c - r * 0.1,
          r * 0.05,
          c - r * 0.7,
          c - r * 0.1,
          r * 0.7
        );
        shoulder.addColorStop(0, 'rgba(150, 176, 48, 0.75)');
        shoulder.addColorStop(1, 'rgba(190, 190, 60, 0)');
        ctx.fillStyle = shoulder;
        ctx.fillRect(0, 0, size, size);
        // Lenticelles : fines mouchetures claires typiques de la peau
        speckle(ctx, c, r * 0.75, 34, 'rgba(255, 240, 190, 0.5)', 1.6);
      });
      drawStem(ctx, c - r * 0.78, c - r * 0.3, r * 0.3, -0.8, '#5f7d34');
      break;
    }

    case 'fruit_de_la_passion': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.4, 0.3, 0, [200, 150, 220]), null, () => {
        // Peau mate et légèrement ridée : arcs sombres concentriques
        ctx.strokeStyle = shadeAlpha(skin, -0.35, 0.5);
        ctx.lineWidth = 2;
        for (let i = 1; i <= 4; i++) {
          ctx.beginPath();
          ctx.ellipse(c, c, r * (0.28 + i * 0.17), r * (0.34 + i * 0.16), 0.3, 0, TAU);
          ctx.stroke();
        }
        speckle(ctx, c, r * 0.9, 40, shadeAlpha(skin, 0.35, 0.35), 1.7);
      });
      // Petite cupule verte + pédoncule au sommet
      ctx.fillStyle = '#4c7c3a';
      ctx.beginPath();
      ctx.ellipse(c + r * 0.06, c - r * 0.9, r * 0.17, r * 0.1, 0, 0, TAU);
      ctx.fill();
      drawStem(ctx, c + r * 0.06, c - r * 0.94, r * 0.26, 0.2, '#4c7c3a');
      break;
    }

    case 'papaye': {
      paintBody(ctx, variety, size, skin, () => {
        // Dégradé de maturité : vert au pédoncule → orange à la base.
        // C'est ce bicolore vertical qui distingue la papaye d'une mangue.
        const ripen = ctx.createLinearGradient(0, c - r * 0.95, 0, c + r * 0.95);
        ripen.addColorStop(0, 'rgba(122, 168, 62, 0.9)');
        ripen.addColorStop(0.42, 'rgba(214, 174, 60, 0.35)');
        ripen.addColorStop(1, 'rgba(240, 138, 44, 0)');
        ctx.fillStyle = ripen;
        ctx.fillRect(0, 0, size, size);
        // Côtes verticales douces
        ctx.strokeStyle = 'rgba(120, 70, 20, 0.18)';
        ctx.lineWidth = 4;
        for (const dx of [-0.34, 0, 0.34]) {
          ctx.beginPath();
          ctx.moveTo(c + dx * r * 0.6, c - r * 0.85);
          ctx.quadraticCurveTo(c + dx * r * 0.95, c, c + dx * r * 0.6, c + r * 0.85);
          ctx.stroke();
        }
      });
      drawStem(ctx, c, c - r * 0.93, r * 0.26, 0.3, '#5f7d34');
      break;
    }

    case 'corossol': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.5, 0.16, 24, [190, 230, 140]), (x, y) => voronoiHeight(x, y, 8 / size, 0.3, 0x2c19), () => {
        // Écailles à pointe recourbée : chaque bosse du contour a sa base
        ctx.strokeStyle = 'rgba(40, 78, 32, 0.6)';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * TAU;
          for (const ring of [0.42, 0.72]) {
            const px = c + Math.cos(a + ring) * r * ring * 0.9;
            const py = c + Math.sin(a + ring) * r * ring;
            ctx.beginPath();
            ctx.moveTo(px - r * 0.11, py + r * 0.06);
            ctx.quadraticCurveTo(px, py - r * 0.1, px + r * 0.11, py + r * 0.06);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(210, 235, 170, 0.35)';
        speckle(ctx, c, r * 0.7, 18, 'rgba(215, 240, 175, 0.4)', 2.4);
      });
      drawStem(ctx, c, c - r * 0.9, r * 0.28, -0.4, '#4d6b32');
      break;
    }

    case 'longane': {
      paintBody(ctx, variety, size, skin, () => {
        // Peau lisse et mate, très légèrement grenue
        speckle(ctx, c, r * 0.92, 46, shadeAlpha(skin, -0.28, 0.35), 1.9);
        // Cicatrice pâle au sommet (attache du pédoncule)
        ctx.fillStyle = shadeAlpha(skin, 0.35, 0.55);
        ctx.beginPath();
        ctx.ellipse(c + r * 0.05, c - r * 0.62, r * 0.16, r * 0.1, 0.2, 0, TAU);
        ctx.fill();
      });
      drawStem(ctx, c + r * 0.05, c - r * 0.9, r * 0.3, 0.5);
      break;
    }

    case 'jacque': {
      paintBody(ctx, variety, size, skin, () => {
        // Nid d'abeille : les alvéoles hexagonales du jacquier
        ctx.strokeStyle = 'rgba(78, 92, 30, 0.75)';
        ctx.lineWidth = 2;
        const step = r * 0.24;
        for (let row = -5; row <= 5; row++) {
          for (let col = -5; col <= 5; col++) {
            const px = c + col * step + (row % 2 === 0 ? 0 : step / 2);
            const py = c + row * step * 0.86;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * TAU + Math.PI / 6;
              const hx = px + Math.cos(a) * step * 0.48;
              const hy = py + Math.sin(a) * step * 0.48;
              if (k === 0) {
                ctx.moveTo(hx, hy);
              } else {
                ctx.lineTo(hx, hy);
              }
            }
            ctx.closePath();
            ctx.stroke();
            // Picot sombre au centre de l'alvéole
            ctx.fillStyle = 'rgba(96, 112, 36, 0.8)';
            ctx.beginPath();
            ctx.arc(px, py, step * 0.13, 0, TAU);
            ctx.fill();
          }
        }
      });
      drawStem(ctx, c - r * 0.1, c - r * 0.88, r * 0.26, -0.4);
      break;
    }

    case 'carambole': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.45, 0.5, 0, [255, 240, 150]), null, () => {
        // Arêtes : une nervure du centre vers chaque pointe, plus une
        // facette claire par branche → la lecture "fruit à 5 côtes".
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU - Math.PI / 2;
          ctx.strokeStyle = 'rgba(150, 118, 20, 0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(c, c);
          ctx.lineTo(c + Math.cos(a) * r * 0.94, c + Math.sin(a) * r * 0.94);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255, 250, 200, 0.45)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2);
          ctx.lineTo(c + Math.cos(a) * r * 0.8, c + Math.sin(a) * r * 0.8);
          ctx.stroke();
        }
        // Bord des branches légèrement bruni, comme sur le fruit mûr
        ctx.strokeStyle = 'rgba(140, 100, 30, 0.35)';
        ctx.lineWidth = 6;
        buildPath(ctx, variety, size, 0.96);
        ctx.stroke();
      });
      break;
    }

    case 'combava_bonus': {
      // Halo doré : le bonus doit se repérer instantanément dans la mêlée
      // Auréole dorée serrée : elle doit signaler le bonus sans noyer le
      // fruit — un halo trop large transformait le combava en tache floue.
      const glow = ctx.createRadialGradient(c, c, r * 0.86, c, c, r * 1.2);
      glow.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
      glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c, c, r * 1.2, 0, TAU);
      ctx.fill();

      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.5, 0.42, 18, [255, 240, 170]), (x, y) => voronoiHeight(x, y, 26 / size, 0.17, 0x9f31), () => {
        // Peau bosselée du combava : cratères sombres et crêtes claires
        speckle(ctx, c, r * 0.85, 30, shadeAlpha(skin, -0.42, 0.6), 3);
        speckle(ctx, c, r * 0.7, 22, shadeAlpha(skin, 0.5, 0.45), 2);
      });
      // Double feuille du combava (kaffir lime) : très identifiable
      drawLeaf(ctx, c + r * 0.1, c - r * 0.78, r * 0.72, -0.9, 0x2a6e30);
      drawLeaf(ctx, c - r * 0.1, c - r * 0.78, r * 0.6, -2.25, 0x2a6e30);
      break;
    }

    case 'goyavier': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.45, 0.55, 0, [255, 170, 140]), null, () => {
        // Peau lisse et cireuse : aucune écaille, juste une joue plus mûre
        // d'un côté et un semis de pores clairs.
        ctx.fillStyle = shadeAlpha(skin, 0.4, 0.3);
        ctx.beginPath();
        ctx.ellipse(c - r * 0.26, c - r * 0.2, r * 0.52, r * 0.46, -0.4, 0, TAU);
        ctx.fill();
        speckle(ctx, c, r, 34, shadeAlpha(skin, 0.5, 0.34), 1.2);
      });

      // Le calice : la petite couronne sèche à l'OPPOSÉ de la tige. C'est elle
      // qui distingue un goyavier d'une cerise au premier coup d'œil.
      ctx.strokeStyle = 'rgba(96, 68, 42, 0.85)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.moveTo(c, c + r * 0.82);
        ctx.lineTo(c + Math.cos(a) * r * 0.19, c + r * 0.82 + Math.sin(a) * r * 0.12);
        ctx.stroke();
      }
      drawStem(ctx, c, c - r * 0.9, r * 0.24, 0.25);
      break;
    }

    case 'pitaya': {
      // Bractées : les grandes écailles qui débordent du corps. Dessinées
      // AVANT lui pour qu'il en recouvre la base — peintes après, elles
      // auraient l'air collées sur la peau.
      // Une bractée : grande écaille charnue qui part de la peau et déborde
      // largement. Sur un vrai fruit du dragon elles font près de la moitié de
      // sa longueur — courtes, elles ressemblent à des flèches collées dessus.
      const rx = r * 0.68;
      const ry = r;
      const bract = (angle: number, longueur: number, largeur: number): void => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const bx = c + cos * rx * 0.82;
        const by = c + sin * ry * 0.82;
        const tx = c + cos * rx * (0.82 + longueur * 1.6);
        const ty = c + sin * ry * (0.82 + longueur);
        // Décalage latéral : la pointe se couche sur le côté, elle ne part pas
        // droit dans l'axe. C'est ce qui donne le mouvement des écailles.
        const nx = -sin * r * largeur;
        const ny = cos * r * largeur;

        const grad = ctx.createLinearGradient(bx, by, tx, ty);
        grad.addColorStop(0, shade(skin, -0.18));
        grad.addColorStop(0.45, shade(skin, 0.05));
        grad.addColorStop(0.78, '#8fbf4a');
        grad.addColorStop(1, '#d8e87a');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(bx + nx, by + ny);
        ctx.quadraticCurveTo(
          bx + nx * 1.15 + (tx - bx) * 0.45,
          by + ny * 1.15 + (ty - by) * 0.45,
          tx,
          ty
        );
        ctx.quadraticCurveTo(
          bx - nx * 1.15 + (tx - bx) * 0.45,
          by - ny * 1.15 + (ty - by) * 0.45,
          bx - nx,
          by - ny
        );
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(64, 88, 26, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      };

      // Cinq écailles DERRIÈRE le corps, réparties sur tout le pourtour.
      for (let i = 0; i < 5; i++) {
        bract((i / 5) * TAU + 0.3, 0.5, 0.2);
      }
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.45, 0.38, 0, [255, 150, 190]), null, () => {
        // Le corps lui-même n'est pas uniforme : des nervures verticales plus
        // sombres suivent l'ovoïde, comme sur un vrai fruit du dragon.
        ctx.strokeStyle = shadeAlpha(skin, -0.3, 0.4);
        ctx.lineWidth = 3;
        for (let i = -2; i <= 2; i++) {
          const x = c + i * r * 0.22;
          ctx.beginPath();
          ctx.moveTo(x, c - r * 0.88);
          ctx.quadraticCurveTo(x + i * r * 0.06, c, x, c + r * 0.88);
          ctx.stroke();
        }
      });

      // Trois bractées de plus PAR-DESSUS le corps : elles se chevauchent, ce
      // qui donne au fruit son épaisseur.
      // Quatre écailles PAR-DESSUS, décalées d'un demi-pas : le chevauchement
      // avec celles du dessous est ce qui donne son épaisseur au fruit.
      for (let i = 0; i < 4; i++) {
        bract((i / 4) * TAU + 0.3 + TAU / 10, 0.42, 0.17);
      }
      break;
    }

    case 'grenade': {
      paintShadedBody(ctx, variety, size, skinMaterial(skin, 0.5, 0.3, 0, [255, 140, 140]), null, () => {
        // Peau bicolore rouge/ocre et quelques méplats : la grenade n'est
        // jamais uniforme, c'est ce qui l'empêche de passer pour une pomme.
        const patina = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
        patina.addColorStop(0, 'rgba(228, 128, 60, 0.45)');
        patina.addColorStop(0.5, 'rgba(190, 40, 55, 0)');
        patina.addColorStop(1, 'rgba(120, 18, 40, 0.5)');
        ctx.fillStyle = patina;
        ctx.fillRect(0, 0, size, size);
        speckle(ctx, c, r * 0.8, 26, shadeAlpha(skin, -0.35, 0.3), 2.4);
      });
      // Couronne (calice) : les sépales pointus au sommet, signature absolue
      // de la grenade — sans eux, c'est une pomme rouge.
      ctx.fillStyle = shade(skin, -0.3);
      ctx.strokeStyle = shade(skin, -0.62);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const crownY = c - r * 0.86;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.2, crownY + r * 0.12);
      for (const [dx, dy] of [
        [-0.16, -0.28],
        [-0.07, -0.12],
        [0, -0.34],
        [0.08, -0.12],
        [0.17, -0.3],
        [0.21, -0.05],
      ] as const) {
        ctx.lineTo(c + dx * r, crownY + dy * r);
      }
      ctx.lineTo(c + r * 0.2, crownY + r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    default: {
      paintBody(ctx, variety, size, skin);
    }
  }
}

// ------------------------------------------------------------------
// Chair : ce que l'on voit dans une moitié tranchée
// ------------------------------------------------------------------

/**
 * Détails internes de la chair, dessinés dans le repère de la texture et
 * déjà clippés à la surface de chair par l'appelant.
 */
function paintFleshDetails(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number
): void {
  const c = size / 2;
  const r = variety.radius;

  switch (variety.key) {
    case 'litchi':
    case 'longane': {
      // Chair nacrée translucide + gros noyau brun luisant
      const seedR = r * (variety.key === 'litchi' ? 0.36 : 0.4);
      ctx.fillStyle = '#4a2c18';
      ctx.beginPath();
      ctx.ellipse(c, c + r * 0.05, seedR * 0.85, seedR, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(c - seedR * 0.3, c - seedR * 0.25, seedR * 0.3, seedR * 0.2, -0.5, 0, TAU);
      ctx.fill();
      break;
    }

    case 'ananas_victoria': {
      // Anneaux fibreux + cœur pâle central
      ctx.strokeStyle = 'rgba(214, 158, 30, 0.45)';
      ctx.lineWidth = 3;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.16 * i, r * 0.2 * i, 0, 0, TAU);
        ctx.stroke();
      }
      // Fibres radiales
      ctx.strokeStyle = 'rgba(230, 180, 60, 0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r * 0.22, c + Math.sin(a) * r * 0.22);
        ctx.lineTo(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.9);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 246, 200, 0.9)';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.18, r * 0.2, 0, 0, TAU);
      ctx.fill();
      break;
    }

    case 'mangue_jose': {
      // Gros noyau plat crème, bordé de fibres — la coupe typique du manguier
      ctx.fillStyle = '#efe0b8';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.45, r * 0.3, -0.35, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190, 160, 90, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 150, 40, 0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r * 0.5, c + Math.sin(a) * r * 0.36);
        ctx.lineTo(c + Math.cos(a) * r * 0.85, c + Math.sin(a) * r * 0.62);
        ctx.stroke();
      }
      break;
    }

    case 'fruit_de_la_passion': {
      // Épaisse écorce blanche + pulpe dorée bourrée de pépins noirs :
      // c'est LA coupe la plus reconnaissable du catalogue.
      ctx.fillStyle = '#f6f1e2';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.98, r, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc21f';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.72, r * 0.74, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 168, 20, 0.6)';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.72, r * 0.74, 0, 0, TAU);
      ctx.fill();
      // Pépins noirs répartis en spirale, chacun avec un reflet de gelée
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 22; i++) {
        const rad = r * 0.62 * Math.sqrt((i + 0.5) / 22);
        const a = i * golden;
        const px = c + Math.cos(a) * rad;
        const py = c + Math.sin(a) * rad;
        ctx.fillStyle = '#241a12';
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.075, r * 0.055, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(px - r * 0.02, py - r * 0.02, r * 0.02, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'papaye': {
      // Cavité centrale noire de graines, entourée de chair saumon
      ctx.fillStyle = 'rgba(255, 140, 66, 0.5)';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.5, r * 0.72, 0, 0, TAU);
      ctx.fill();
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 26; i++) {
        const t = (i + 0.5) / 26;
        const rad = Math.sqrt(t);
        const a = i * golden;
        const px = c + Math.cos(a) * rad * r * 0.34;
        const py = c + Math.sin(a) * rad * r * 0.55;
        ctx.fillStyle = '#1e1a18';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.06, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(px - r * 0.02, py - r * 0.02, r * 0.018, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'corossol': {
      // Chair blanche en quartiers charnus avec quelques gros pépins noirs.
      // Séparations INCURVÉES : des rayons droits donnaient un rendu de
      // camembert géométrique au lieu d'une pulpe.
      ctx.strokeStyle = 'rgba(206, 200, 178, 0.75)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.quadraticCurveTo(
          c + Math.cos(a + 0.35) * r * 0.5,
          c + Math.sin(a + 0.35) * r * 0.5,
          c + Math.cos(a) * r * 0.9,
          c + Math.sin(a) * r * 0.9
        );
        ctx.stroke();
      }
      for (const [ax, ay] of [
        [0.3, -0.4],
        [-0.36, -0.1],
        [0.12, 0.45],
        [0.42, 0.12],
        [-0.2, 0.3],
      ] as const) {
        ctx.fillStyle = '#23201c';
        ctx.beginPath();
        ctx.ellipse(c + ax * r, c + ay * r, r * 0.1, r * 0.07, ax, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(c + ax * r - r * 0.03, c + ay * r - r * 0.02, r * 0.025, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'jacque': {
      // Bulbes jaunes serrés autour d'un cœur fibreux — la coupe du jacquier
      ctx.fillStyle = '#f2ead0';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.22, r * 0.3, 0, 0, TAU);
      ctx.fill();
      for (let ring = 0; ring < 2; ring++) {
        const count = ring === 0 ? 6 : 9;
        const rad = r * (ring === 0 ? 0.45 : 0.75);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + ring * 0.35;
          const px = c + Math.cos(a) * rad;
          const py = c + Math.sin(a) * rad;
          ctx.fillStyle = '#f0c33c';
          ctx.beginPath();
          ctx.ellipse(px, py, r * 0.16, r * 0.21, a, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(190, 140, 30, 0.7)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 250, 210, 0.45)';
          ctx.beginPath();
          ctx.ellipse(px - r * 0.04, py - r * 0.05, r * 0.06, r * 0.08, a, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }

    case 'carambole': {
      // Étoile pâle inscrite : la coupe de la carambole EST une étoile
      ctx.save();
      ctx.beginPath();
      traceStar(ctx, c, c, r * 0.72, r * 0.3);
      ctx.fillStyle = 'rgba(255, 252, 214, 0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(206, 172, 44, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      // Pépins plats au cœur
      ctx.fillStyle = '#8a6a30';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * r * 0.16, c + Math.sin(a) * r * 0.16, r * 0.07, r * 0.04, a, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'combava_bonus': {
      // Quartiers d'agrume séparés par des membranes blanches
      ctx.fillStyle = '#f7f0d0';
      ctx.beginPath();
      ctx.arc(c, c, r * 0.9, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * TAU + 0.06;
        const a1 = ((i + 1) / 8) * TAU - 0.06;
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, r * 0.82, a0, a1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Vésicules de jus dans chaque quartier
        ctx.strokeStyle = 'rgba(230, 180, 30, 0.5)';
        ctx.lineWidth = 1.6;
        for (let k = 1; k <= 3; k++) {
          const a = a0 + (a1 - a0) * (k / 4);
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2);
          ctx.lineTo(c + Math.cos(a) * r * 0.78, c + Math.sin(a) * r * 0.78);
          ctx.stroke();
        }
      }
      break;
    }

    case 'goyavier': {
      // Chair rose pâle, et une couronne de petits pépins durs très serrés —
      // ce sont eux qu'on croque, et c'est la signature de la coupe.
      ctx.fillStyle = '#f6dccb';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.92, r * 0.94, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(226, 150, 120, 0.45)';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.58, r * 0.6, 0, 0, TAU);
      ctx.fill();
      speckle(ctx, c, r * 0.58, 26, 'rgba(150, 108, 70, 0.9)', 2.1);
      // Fines nervures du centre vers l'écorce
      ctx.strokeStyle = 'rgba(214, 150, 122, 0.5)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r * 0.58, c + Math.sin(a) * r * 0.6);
        ctx.lineTo(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
      break;
    }

    case 'pitaya': {
      // LA coupe du catalogue : chair d'un blanc franc, criblée de pépins
      // noirs minuscules, cerclée d'un liseré fuchsia très fin. C'est le
      // contraste le plus fort de tout le jeu — il doit rester net.
      ctx.fillStyle = '#fbf8f7';
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.9, r * 0.94, 0, 0, TAU);
      ctx.fill();

      // Liseré de peau, fin : sur un vrai pitaya, la peau n'a presque pas
      // d'épaisseur — un anneau large le ferait ressembler à une pastèque.
      ctx.strokeStyle = 'rgba(214, 60, 110, 0.85)';
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.86, r * 0.9, 0, 0, TAU);
      ctx.stroke();

      // Pépins : nombreux, très petits, répartis sans amas.
      speckle(ctx, c, r * 0.78, 78, 'rgba(28, 26, 30, 0.92)', 1.7);

      // Reflet humide au centre : la chair d'un pitaya est gorgée d'eau.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.ellipse(c - r * 0.22, c - r * 0.26, r * 0.3, r * 0.22, -0.5, 0, TAU);
      ctx.fill();
      break;
    }

    case 'grenade': {
      // Arilles : les centaines de grains rubis serrés dans leurs loges
      // blanches — la coupe la plus spectaculaire du catalogue.
      ctx.fillStyle = '#f7ead8';
      ctx.beginPath();
      ctx.arc(c, c, r * 0.92, 0, TAU);
      ctx.fill();
      // Cloisons membraneuses qui délimitent les loges
      ctx.strokeStyle = 'rgba(246, 232, 210, 0.95)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.25;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.9);
        ctx.stroke();
      }
      // Grains disposés en spirale de Vogel : dense et sans amas visible
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 78; i++) {
        const rad = r * 0.82 * Math.sqrt((i + 0.5) / 78);
        const a = i * golden;
        const px = c + Math.cos(a) * rad;
        const py = c + Math.sin(a) * rad;
        const grain = r * 0.085;
        ctx.fillStyle = i % 4 === 0 ? '#e8143c' : '#c8102e';
        ctx.beginPath();
        ctx.ellipse(px, py, grain, grain * 0.82, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 190, 200, 0.55)';
        ctx.beginPath();
        ctx.arc(px - grain * 0.28, py - grain * 0.3, grain * 0.3, 0, TAU);
        ctx.fill();
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Peint la face de coupe d'une moitié : la chair remplit l'intérieur de la
 * silhouette rétrécie (ce qui laisse automatiquement une bande de peau tout
 * autour, quelle que soit la forme), puis les détails de chair, puis un
 * liseré clair le long du trait de coupe.
 *
 * L'appelant a déjà clippé le contexte sur la moitié concernée.
 */
export function paintCut(
  ctx: CanvasRenderingContext2D,
  variety: FruitVariety,
  size: number,
  side: 'left' | 'right'
): void {
  const c = size / 2;
  const r = variety.radius;

  // 1. Surface de chair : léger dégradé pour éviter l'aplat mort
  buildPath(ctx, variety, size, FLESH_SHRINK);
  const flesh = ctx.createRadialGradient(c - r * 0.2, c - r * 0.25, r * 0.05, c, c, r);
  flesh.addColorStop(0, shade(variety.fleshColor, 0.3));
  flesh.addColorStop(0.7, hexToCss(variety.fleshColor));
  flesh.addColorStop(1, shade(variety.fleshColor, -0.16));
  ctx.fillStyle = flesh;
  ctx.fill();

  // 2. Détails internes (pépins, noyau, quartiers), bornés à la chair
  ctx.save();
  buildPath(ctx, variety, size, FLESH_SHRINK);
  ctx.clip();
  paintFleshDetails(ctx, variety, size);
  ctx.restore();

  // 3. Liseré sombre entre peau et chair : sépare nettement les deux
  buildPath(ctx, variety, size, FLESH_SHRINK);
  ctx.strokeStyle = shade(variety.skinColor, -0.5);
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4. Arête de coupe : fine bande claire sur le fil du couteau, du côté
  //    de la moitié — donne l'impression d'une tranche fraîche et humide.
  const edgeX = side === 'left' ? c - 4 : c;
  const edge = ctx.createLinearGradient(edgeX, 0, edgeX + 4, 0);
  const bright = 'rgba(255, 255, 255, 0.75)';
  edge.addColorStop(0, side === 'left' ? 'rgba(255,255,255,0)' : bright);
  edge.addColorStop(1, side === 'left' ? bright : 'rgba(255,255,255,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(edgeX, c - r, 4, r * 2);
}
