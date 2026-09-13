/**
 * Le décor : un couchant réunionnais peint en code.
 *
 * POURQUOI UN MODULE À PART. Le décor vivait dans PreloadScene, mêlé à la
 * génération des sprites. Il y avait deux problèmes.
 *
 * Le premier était un vrai bug, introduit par la montée en résolution : les
 * dimensions W et H passent désormais par px(), mais le soleil gardait un
 * rayon de 80 pixels écrits en dur, les palmiers 165 de haut, les reflets
 * 130 de long. À l'échelle 2 le paysage était donc peint à moitié échelle
 * dans une image deux fois plus grande — soleil minuscule, palmiers nains.
 * Tout passe maintenant par l'unité `u`, calée sur le petit côté.
 *
 * Le second est le fond lui-même. Trois aplats et six traits, c'est lisible
 * mais c'est un pictogramme. Ce qui fait qu'un paysage paraît RÉEL n'est pas
 * le détail, c'est la PERSPECTIVE AÉRIENNE : plus un relief est loin, plus
 * l'air empilé devant lui le décolore, l'éclaircit et le tire vers la
 * couleur du ciel. Un peintre le sait depuis toujours, un moteur 3D le
 * simule avec du brouillard. Ici on l'applique à la main, crête par crête.
 *
 * S'y ajoutent la profondeur de champ (les plans lointains sont peints
 * légèrement flous, le premier plan net) et le chemin de lumière sur l'eau,
 * qui est ce qui trahit le plus vite un couchant peint à l'économie.
 *
 * Tout est calculé une fois au chargement. Coût en partie : zéro.
 */

/** Profil de crête : fractions de largeur/hauteur, lues de gauche à droite. */
type Ridge = Array<[number, number]>;

/**
 * Peint le paysage complet dans le contexte donné.
 *
 * `u` est l'unité de longueur : 1 sur un écran de 720 de petit côté, 2 à
 * l'échelle 2. Toutes les distances en découlent, donc le paysage garde
 * exactement les mêmes proportions à toute résolution.
 */
export function paintBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, sunFracX: number, sunFracY: number): void {
  const u = Math.min(W, H) / 720;
  const sunX = W * sunFracX;
  const sunY = H * sunFracY;

  paintSky(ctx, W, H);
  paintSunHalo(ctx, sunX, sunY, u, H);

  // Les trois crêtes lointaines sont peintes FLOUES : c'est la profondeur de
  // champ. L'œil fait la mise au point sur les fruits, qui volent à un mètre ;
  // à cette distance un relief à quinze kilomètres ne peut pas être net. Sans
  // ce flou, fruits et montagnes paraissent collés sur la même vitre.
  //
  // ctx.filter n'existe pas partout ; là où il manque, l'affectation est
  // ignorée et le décor reste net. C'est une dégradation acceptable.
  withBlur(ctx, 3.2 * u, () => {
    paintRidge(ctx, W, H, RIDGE_FAR, 'rgba(126, 149, 172, 0.55)');
    paintRidge(ctx, W, H, RIDGE_MID, 'rgba(92, 112, 136, 0.68)');
  });
  withBlur(ctx, 1.4 * u, () => {
    paintRidge(ctx, W, H, RIDGE_NEAR, 'rgba(61, 76, 96, 0.86)');
  });

  // Le Piton, plan principal : net, c'est lui qui donne l'échelle du paysage.
  paintRidge(ctx, W, H, RIDGE_PITON, 'rgba(38, 49, 64, 0.94)');

  paintHaze(ctx, W, H, sunX, sunY, u);
  paintSea(ctx, W, H, sunX, u);

  // Palmiers : le seul plan net devant l'océan. Ils sont volontairement
  // coupés par le bord de l'image — un objet dont on ne voit pas les limites
  // se lit comme proche, c'est le repère de profondeur le moins cher qui soit.
  const shore = H * 0.87;
  drawPalm(ctx, W * 0.05, shore + 18 * u, 1, u * 1.15);
  drawPalm(ctx, W * 0.96, shore + 26 * u, -1, u * 1.3);
}

// ---------------------------------------------------------------------------
// Ciel et soleil
// ---------------------------------------------------------------------------

function paintSky(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  // Cinq arrêts plutôt que quatre : le passage du bleu à l'or est la zone où
  // un dégradé trop court fait une bande visible. On l'étale.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b4f74');
  sky.addColorStop(0.22, '#1478a0');
  sky.addColorStop(0.46, '#48a9c0');
  sky.addColorStop(0.63, '#b9a074');
  sky.addColorStop(0.75, '#f2a95c');
  sky.addColorStop(0.9, '#e8713f');
  sky.addColorStop(1, '#d9512f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
}

function paintSunHalo(ctx: CanvasRenderingContext2D, sunX: number, sunY: number, u: number, H: number): void {
  // Deux halos concentriques au lieu d'un seul. Le large pose l'ambiance
  // générale, le serré donne l'éblouissement juste autour du disque. Avec un
  // seul dégradé il faut choisir entre les deux, et le soleil paraît soit
  // terne soit détouré.
  const wide = ctx.createRadialGradient(sunX, sunY, 10 * u, sunX, sunY, 420 * u);
  wide.addColorStop(0, 'rgba(255, 226, 162, 0.42)');
  wide.addColorStop(0.45, 'rgba(255, 186, 120, 0.18)');
  wide.addColorStop(1, 'rgba(255, 170, 110, 0)');
  fillDisc(ctx, sunX, sunY, 420 * u, wide);

  const tight = ctx.createRadialGradient(sunX, sunY, 4 * u, sunX, sunY, 150 * u);
  tight.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
  tight.addColorStop(0.35, 'rgba(255, 222, 150, 0.4)');
  tight.addColorStop(1, 'rgba(255, 222, 150, 0)');
  fillDisc(ctx, sunX, sunY, 150 * u, tight);

  // Le disque : blanc chaud au centre, or sur le bord. Un aplat uni donne un
  // rond de papier découpé, ce petit dégradé suffit à le rendre incandescent.
  const disc = ctx.createRadialGradient(sunX, sunY - 8 * u, 2 * u, sunX, sunY, 82 * u);
  disc.addColorStop(0, '#fffdf2');
  disc.addColorStop(0.6, '#ffe6a6');
  disc.addColorStop(1, '#ffc964');
  fillDisc(ctx, sunX, sunY, 82 * u, disc);

  // Rayons : quelques fuseaux très pâles, jamais symétriques, sinon l'œil y
  // lit un motif décoratif au lieu d'une lumière.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [angle, spread, alpha] of [
    [-1.42, 0.055, 0.1],
    [-1.05, 0.03, 0.07],
    [-1.86, 0.038, 0.075],
    [-0.62, 0.022, 0.05],
    [-2.3, 0.026, 0.055],
  ]) {
    const reach = H * 0.95;
    const g = ctx.createLinearGradient(sunX, sunY, sunX + Math.cos(angle) * reach, sunY + Math.sin(angle) * reach);
    g.addColorStop(0, `rgba(255, 230, 175, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 230, 175, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.arc(sunX, sunY, reach, angle - spread, angle + spread);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Reliefs
// ---------------------------------------------------------------------------

/**
 * Les quatre plans, du plus lointain au plus proche. Ils se recouvrent : la
 * base de chacun descend sous le suivant, ce qui évite tout liseré de ciel
 * coincé entre deux crêtes.
 */
const RIDGE_FAR: Ridge = [
  [0, 0.665], [0.09, 0.618], [0.2, 0.652], [0.31, 0.6], [0.42, 0.638],
  [0.55, 0.592], [0.68, 0.64], [0.82, 0.606], [0.93, 0.645], [1, 0.622],
];

const RIDGE_MID: Ridge = [
  [0, 0.72], [0.12, 0.665], [0.25, 0.705], [0.37, 0.648], [0.46, 0.676],
  [0.6, 0.63], [0.72, 0.688], [0.86, 0.652], [1, 0.69],
];

const RIDGE_NEAR: Ridge = [
  [0, 0.775], [0.15, 0.7], [0.28, 0.752], [0.4, 0.715], [0.52, 0.742],
  [0.66, 0.694], [0.79, 0.75], [0.9, 0.722], [1, 0.756],
];

/**
 * Le Piton : montée longue et régulière côté ouest, cratère marqué au sommet,
 * puis chute plus raide. C'est cette dissymétrie qui le rend reconnaissable ;
 * un triangle isocèle aurait pu être n'importe quelle montagne du monde.
 */
const RIDGE_PITON: Ridge = [
  [0, 0.845], [0.08, 0.812], [0.19, 0.735], [0.3, 0.786], [0.41, 0.742],
  [0.5, 0.652], [0.55, 0.612], [0.585, 0.63], [0.62, 0.606], [0.67, 0.652],
  [0.76, 0.714], [0.85, 0.762], [0.93, 0.735], [1, 0.78],
];

function paintRidge(ctx: CanvasRenderingContext2D, W: number, H: number, ridge: Ridge, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, H * ridge[0][1]);
  for (let i = 1; i < ridge.length; i++) {
    // Courbe quadratique entre sommets plutôt que segments droits : les
    // crêtes réelles n'ont pas d'arêtes vives à cette distance.
    const [px0, py0] = ridge[i - 1];
    const [px1, py1] = ridge[i];
    const mx = ((px0 + px1) / 2) * W;
    const my = ((py0 + py1) / 2) * H;
    ctx.quadraticCurveTo(px0 * W, py0 * H, mx, my);
    if (i === ridge.length - 1) {
      ctx.lineTo(px1 * W, py1 * H);
    }
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
}

/**
 * La brume : une nappe chaude au ras des crêtes, plus dense près du soleil.
 *
 * C'est le terme qui coûte le moins et qui apporte le plus. Sans lui les
 * montagnes sont découpées à l'emporte-pièce sur le ciel ; avec lui, chaque
 * base de relief se dissout dans l'air et l'on croit à la distance.
 */
function paintHaze(ctx: CanvasRenderingContext2D, W: number, H: number, sunX: number, sunY: number, u: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const band = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.9);
  band.addColorStop(0, 'rgba(255, 196, 130, 0)');
  band.addColorStop(0.5, 'rgba(255, 186, 124, 0.17)');
  band.addColorStop(1, 'rgba(255, 160, 104, 0.05)');
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.52, W, H * 0.38);

  const near = ctx.createRadialGradient(sunX, sunY + 40 * u, 20 * u, sunX, sunY + 40 * u, 520 * u);
  near.addColorStop(0, 'rgba(255, 214, 158, 0.2)');
  near.addColorStop(1, 'rgba(255, 214, 158, 0)');
  ctx.fillStyle = near;
  ctx.fillRect(0, H * 0.4, W, H * 0.5);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Océan
// ---------------------------------------------------------------------------

function paintSea(ctx: CanvasRenderingContext2D, W: number, H: number, sunX: number, u: number): void {
  const seaTop = H * 0.87;
  const sea = ctx.createLinearGradient(0, seaTop, 0, H);
  sea.addColorStop(0, '#2a8aa8'); // près de l'horizon, l'eau reflète le ciel
  sea.addColorStop(0.35, '#186d8d');
  sea.addColorStop(1, '#0a3c53'); // au premier plan, elle est sombre et profonde
  ctx.fillStyle = sea;
  ctx.fillRect(0, seaTop, W, H - seaTop);

  // Le chemin de lumière. Ce n'est pas une traînée uniforme : il s'ÉVASE en
  // s'approchant, parce que chaque vague renvoie le soleil sous un angle un
  // peu différent et que l'on voit d'autant plus de facettes qu'elles sont
  // proches. Un rectangle lumineux de largeur constante est le défaut le plus
  // courant des couchants peints — et le plus visible.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, seaTop, W, H - seaTop);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';

  const depth = H - seaTop;
  const lignes = 26;
  for (let i = 0; i < lignes; i++) {
    const t = i / (lignes - 1); // 0 = horizon, 1 = premier plan
    const y = seaTop + t * depth * 1.05;
    const largeur = (18 + 190 * t * t) * u;
    // Scintillement pseudo-aléatoire mais DÉTERMINISTE : deux sinus de
    // périodes incommensurables. Un Math.random() donnerait un décor
    // différent à chaque chargement, donc impossible à juger.
    const jitter = Math.sin(i * 2.399) * 0.5 + Math.sin(i * 5.771) * 0.3;
    const cx = sunX + jitter * 40 * u * t;
    const alpha = (0.34 - 0.2 * t) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.77)));

    const g = ctx.createLinearGradient(cx - largeur, y, cx + largeur, y);
    g.addColorStop(0, 'rgba(255, 226, 170, 0)');
    g.addColorStop(0.5, `rgba(255, 232, 184, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 226, 170, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - largeur, y, largeur * 2, Math.max(1.5 * u, 3.4 * u * (0.4 + t)));
  }

  // Quelques crêtes d'écume loin du chemin de lumière, sinon la moitié
  // gauche et droite de l'océan reste un aplat mort.
  ctx.fillStyle = 'rgba(210, 236, 245, 0.13)';
  for (const [fx, ft, fl] of [
    [0.14, 0.22, 70], [0.86, 0.3, 62], [0.24, 0.55, 96],
    [0.78, 0.62, 88], [0.09, 0.78, 120], [0.9, 0.85, 104],
  ]) {
    const y = seaTop + ft * depth;
    ctx.fillRect(W * fx - (fl * u) / 2, y, fl * u, 2.2 * u);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Palmiers
// ---------------------------------------------------------------------------

/**
 * Palmier en silhouette. `echelle` permet d'en poser un plus grand que
 * l'autre : deux palmiers identiques se lisent comme un motif, deux palmiers
 * de tailles différentes se lisent comme deux arbres.
 */
function drawPalm(ctx: CanvasRenderingContext2D, baseX: number, baseY: number, dir: number, echelle: number): void {
  const s = echelle;
  ctx.save();
  ctx.strokeStyle = '#1b2733';
  ctx.fillStyle = '#1b2733';
  ctx.lineCap = 'round';

  const topX = baseX + dir * 52 * s;
  const topY = baseY - 205 * s;

  // Tronc fuselé : quatre segments de largeur décroissante plutôt qu'un
  // trait d'épaisseur constante. Un tronc de palmier est large au pied.
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4;
    const t1 = (i + 1) / 4;
    ctx.lineWidth = (17 - 9 * t0) * s;
    ctx.beginPath();
    ctx.moveTo(...palmTrunk(baseX, baseY, topX, topY, dir, s, t0));
    ctx.quadraticCurveTo(
      ...palmTrunk(baseX, baseY, topX, topY, dir, s, (t0 + t1) / 2),
      ...palmTrunk(baseX, baseY, topX, topY, dir, s, t1)
    );
    ctx.stroke();
  }

  // Palmes : chacune est une nervure épaisse qui s'affine, plus des folioles.
  for (const [dx, dy, cx, cy] of [
    [-105, 18, -50, -44], [-86, 58, -38, 2], [-26, -66, -8, -56],
    [38, -62, 14, -60], [98, 22, 50, -38], [80, 62, 38, 8],
  ]) {
    const ex = topX + dx * dir * s;
    const ey = topY + dy * s;
    const qx = topX + cx * dir * s;
    const qy = topY + cy * s;

    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(qx, qy, ex, ey);
    ctx.stroke();

    // Folioles : de courts traits de part et d'autre de la nervure. C'est ce
    // qui distingue une palme d'une simple branche, même en silhouette.
    ctx.lineWidth = 2.6 * s;
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const px1 = quad(topX, qx, ex, t);
      const py1 = quad(topY, qy, ey, t);
      const tx = quad(topX, qx, ex, t + 0.08) - px1;
      const ty = quad(topY, qy, ey, t + 0.08) - py1;
      const len = Math.hypot(tx, ty) || 1;
      const nx = (-ty / len) * 17 * s * (1 - t * 0.55);
      const ny = (tx / len) * 17 * s * (1 - t * 0.55);
      ctx.beginPath();
      ctx.moveTo(px1 + nx, py1 + ny);
      ctx.lineTo(px1 - nx * 0.8, py1 - ny * 0.8);
      ctx.stroke();
    }
  }

  // Régime de cocos, sous la couronne
  ctx.beginPath();
  ctx.arc(topX - dir * 10 * s, topY + 15 * s, 9 * s, 0, Math.PI * 2);
  ctx.arc(topX + dir * 7 * s, topY + 18 * s, 9 * s, 0, Math.PI * 2);
  ctx.arc(topX - dir * 2 * s, topY + 28 * s, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Point du tronc au paramètre t, sur la même courbe que le tracé. */
function palmTrunk(
  baseX: number, baseY: number, topX: number, topY: number,
  dir: number, s: number, t: number
): [number, number] {
  const cx = baseX + dir * 8 * s;
  const cy = baseY - 112 * s;
  return [quad(baseX, cx, topX, t), quad(baseY, cy, topY, t)];
}

/** Bézier quadratique scalaire. */
function quad(a: number, b: number, c: number, t: number): number {
  const it = 1 - t;
  return it * it * a + 2 * it * t * b + t * t * c;
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function fillDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, style: CanvasGradient): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Exécute un tracé sous flou, puis rétablit l'état du contexte. */
function withBlur(ctx: CanvasRenderingContext2D, radius: number, draw: () => void): void {
  ctx.save();
  ctx.filter = `blur(${radius.toFixed(2)}px)`;
  draw();
  ctx.restore();
}
