import Phaser from 'phaser';
import {
  PORTRAIT_WIDTH,
  PORTRAIT_HEIGHT,
  LANDSCAPE_WIDTH,
  LANDSCAPE_HEIGHT,
  TEX_BOMB,
  TEX_JUICE,
  TEX_SPLAT_PREFIX,
  SPLAT_VARIANTS,
  BOMB_RADIUS,
  TEX_GLOW,
  TEX_CLOUD,
  SUN_FRAC_X,
  SUN_FRAC_Y,
} from '../utils/constants';
import {
  FRUIT_VARIETIES,
  BONUS_VARIETY,
  type FruitVariety,
  wholeTextureKey,
  halfTextureKeys,
} from '../utils/fruitCatalog';

/** Convertit une couleur hex numérique en chaîne CSS (#rrggbb). */
function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Éclaircit (amt > 0) ou assombrit (amt < 0, jusqu'à -1) une couleur hex. */
function shade(color: number, amt: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (ch: number): number =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? ch + (255 - ch) * amt : ch * (1 + amt))));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/**
 * Dégradé "sphère éclairée" : source lumineuse en haut-gauche, ombre au
 * bord opposé → donne du volume 3D à un aplat. base = couleur hex du fruit.
 */
function sphereGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  base: number
): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.35, r * 0.1, cx, cy, r * 1.08);
  g.addColorStop(0, shade(base, 0.5));
  g.addColorStop(0.55, shade(base, 0.05));
  g.addColorStop(1, shade(base, -0.42));
  return g;
}

/** Reflet brillant (spéculaire) en haut-gauche, pour l'aspect verni. */
function addGloss(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const gx = cx - r * 0.34;
  const gy = cy - r * 0.38;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.5);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(gx, gy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Génération des assets placeholder.
 *
 * Aucun fichier image n'est requis : toutes les textures sont générées
 * procéduralement (canvas 2D). Chaque fruit du catalogue reçoit trois
 * textures ([key]_whole, [key]_half_left, [key]_half_right) — les moitiés
 * sont le même dessin découpé par clipping, avec la chair visible le long
 * de la coupe. Quand les vrais assets arriveront (public/assets/fruits/),
 * il suffira de remplacer ces générations par des this.load.image() :
 * les clés de texture ne changeront pas.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  create(): void {
    // Un décor par orientation : la scène active choisit le bon (backgroundKey)
    this.createBackgroundTexture('background_portrait', PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    this.createBackgroundTexture('background_landscape', LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT);
    for (const variety of FRUIT_VARIETIES) {
      this.createVarietyTextures(variety);
    }
    this.createVarietyTextures(BONUS_VARIETY);
    this.createBombTexture();
    this.createJuiceTexture();
    this.createSplatTextures();
    this.createGlowTexture();
    this.createCloudTexture();
    this.scene.start('MenuScene');
  }

  /** Halo lumineux radial : le "glow" animé placé sur le soleil du décor. */
  private createGlowTexture(): void {
    const size = 520;
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_GLOW, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255, 238, 190, 0.85)');
    g.addColorStop(0.4, 'rgba(255, 220, 150, 0.35)');
    g.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** Nuage doux : amas de cercles flous (bord adouci par shadowBlur). */
  private createCloudTexture(): void {
    const w = 360;
    const h = 150;
    const tex = this.textures.createCanvas(TEX_CLOUD, w, h);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 28;
    for (const [cx, cy, r] of [
      [110, 95, 42],
      [165, 72, 54],
      [225, 90, 46],
      [150, 98, 48],
      [205, 98, 44],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  }

  // ------------------------------------------------------------------
  // Décor : coucher de soleil tropical, volcan, océan, palmiers
  // ------------------------------------------------------------------

  private createBackgroundTexture(key: string, W: number, H: number): void {
    const texture = this.textures.createCanvas(key, W, H);
    if (texture === null) {
      return; // ne peut arriver que si la clé existe déjà
    }
    const ctx = texture.getContext();

    // Ciel : lagon en haut → or → corail au couchant
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1478a0');
    sky.addColorStop(0.45, '#3fa7c4');
    sky.addColorStop(0.72, '#f2a95c');
    sky.addColorStop(1, '#e2603c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // (Les nuages sont désormais des sprites animés qui dérivent — cf. AnimatedBackground.)

    // Soleil couchant avec halo, partiellement derrière les montagnes.
    // Position partagée avec le halo animé (SUN_FRAC_*) pour qu'ils coïncident.
    const sunX = W * SUN_FRAC_X;
    const sunY = H * SUN_FRAC_Y;
    const halo = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 240);
    halo.addColorStop(0, 'rgba(255, 222, 150, 0.55)');
    halo.addColorStop(1, 'rgba(255, 222, 150, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 240, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd98c';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
    ctx.fill();

    // Montagnes lointaines (plus claires, pour la profondeur)
    ctx.fillStyle = 'rgba(77, 95, 112, 0.5)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.74);
    ctx.lineTo(W * 0.18, H * 0.6);
    ctx.lineTo(W * 0.34, H * 0.7);
    ctx.lineTo(W * 0.52, H * 0.63);
    ctx.lineTo(W * 0.75, H * 0.72);
    ctx.lineTo(W, H * 0.65);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Volcan proche (silhouette du Piton, cratère marqué)
    ctx.fillStyle = 'rgba(45, 58, 74, 0.8)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H * 0.8);
    ctx.lineTo(W * 0.22, H * 0.64);
    ctx.lineTo(W * 0.38, H * 0.74);
    ctx.lineTo(W * 0.58, H * 0.57);
    ctx.lineTo(W * 0.63, H * 0.6); // cratère
    ctx.lineTo(W * 0.68, H * 0.58);
    ctx.lineTo(W * 0.85, H * 0.72);
    ctx.lineTo(W, H * 0.68);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Océan au pied du volcan
    const seaTop = H * 0.87;
    const sea = ctx.createLinearGradient(0, seaTop, 0, H);
    sea.addColorStop(0, '#1a6f8f');
    sea.addColorStop(1, '#0e4a63');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaTop, W, H - seaTop);

    // Reflets du couchant sur l'eau
    ctx.strokeStyle = 'rgba(255, 235, 190, 0.28)';
    ctx.lineWidth = 3;
    for (const [wx, wy, len] of [
      [W * 0.5, seaTop + 24, 130],
      [W * 0.62, seaTop + 52, 90],
      [W * 0.42, seaTop + 78, 110],
      [W * 0.58, seaTop + 108, 70],
      [W * 0.15, seaTop + 60, 60],
      [W * 0.85, seaTop + 90, 60],
    ]) {
      ctx.beginPath();
      ctx.moveTo(wx - len / 2, wy);
      ctx.lineTo(wx + len / 2, wy);
      ctx.stroke();
    }

    // Palmiers en silhouette dans les coins bas
    this.drawPalm(ctx, W * 0.07, seaTop + 14, 1);
    this.drawPalm(ctx, W * 0.94, seaTop + 22, -1);

    texture.refresh();
  }

  /** Palmier stylisé en silhouette : tronc courbé + palmes en arcs. */
  private drawPalm(ctx: CanvasRenderingContext2D, baseX: number, baseY: number, dir: number): void {
    ctx.strokeStyle = '#22303c';
    ctx.fillStyle = '#22303c';
    const topX = baseX + dir * 42;
    const topY = baseY - 165;

    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(baseX + dir * 6, baseY - 90, topX, topY);
    ctx.stroke();

    // Palmes : arcs partant du sommet dans toutes les directions
    ctx.lineWidth = 7;
    for (const [dx, dy, cx, cy] of [
      [-85, 10, -40, -35],
      [-70, 45, -30, 0],
      [-20, -55, -5, -45],
      [30, -50, 10, -50],
      [80, 15, 40, -30],
      [65, 50, 30, 5],
    ]) {
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(topX + cx * dir, topY + cy, topX + dx * dir, topY + dy);
      ctx.stroke();
    }
    // Noix de coco
    ctx.beginPath();
    ctx.arc(topX - dir * 8, topY + 12, 8, 0, Math.PI * 2);
    ctx.arc(topX + dir * 6, topY + 14, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------------
  // Fruits : 3 textures par variété (entier + 2 moitiés par clipping)
  // ------------------------------------------------------------------

  private createVarietyTextures(variety: FruitVariety): void {
    // Marge élargie : place pour feuilles/couronnes ET pour l'ombre portée
    // douce (halo sombre) qui détache le fruit du décor assombri.
    const size = variety.radius * 2 + 40;
    const variants: Array<'whole' | 'left' | 'right'> = ['whole', 'left', 'right'];
    const halves = halfTextureKeys(variety);

    for (const variant of variants) {
      const key =
        variant === 'whole' ? wholeTextureKey(variety) : variant === 'left' ? halves.left : halves.right;
      const texture = this.textures.createCanvas(key, size, size);
      if (texture === null) {
        continue;
      }
      const ctx = texture.getContext();

      ctx.save();
      if (variant === 'left') {
        ctx.beginPath();
        ctx.rect(0, 0, size / 2, size);
        ctx.clip();
      } else if (variant === 'right') {
        ctx.beginPath();
        ctx.rect(size / 2, 0, size / 2, size);
        ctx.clip();
      }
      // Ombre portée symétrique (offset 0) : un halo sombre entoure toute la
      // silhouette pour la faire ressortir. Offset nul → l'ombre reste
      // correcte même quand le sprite tourne en vol. Le gros aplat du corps
      // du fruit domine le halo ; les détails internes, dessinés par-dessus
      // leur propre ombre, restent nets.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 13;
      this.drawFruit(ctx, variety, size);
      ctx.restore();

      if (variant !== 'whole') {
        this.drawCutFace(ctx, variety, size, variant);
      }
      texture.refresh();
    }
  }

  /** Chair visible le long de la coupe (+ graines pour passion/papaye). */
  private drawCutFace(
    ctx: CanvasRenderingContext2D,
    variety: FruitVariety,
    size: number,
    side: 'left' | 'right'
  ): void {
    const stripWidth = 7;
    const x = side === 'left' ? size / 2 - stripWidth : size / 2;
    const c = size / 2;
    const h = (variety.radius - 10) * 2; // un peu plus court que la silhouette

    ctx.fillStyle = hexToCss(variety.fleshColor);
    ctx.fillRect(x, c - h / 2, stripWidth, h);

    if (variety.key === 'fruit_de_la_passion' || variety.key === 'papaye') {
      ctx.fillStyle = '#3a2a1e';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + stripWidth / 2, c - h / 2 + (h / 5) * (i + 1), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Dispatch du dessin par variété — chaque fruit a sa silhouette propre. */
  private drawFruit(ctx: CanvasRenderingContext2D, variety: FruitVariety, size: number): void {
    const c = size / 2;
    const r = variety.radius;

    switch (variety.key) {
      case 'litchi': {
        // Coque rose-rouge granuleuse, avec volume et reflet verni
        ctx.fillStyle = sphereGradient(ctx, c, c, r, 0xe0455a);
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(0xe0455a, -0.28);
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const rr = r * (i % 2 === 0 ? 0.62 : 0.32);
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * rr, c + Math.sin(angle) * rr, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        addGloss(ctx, c, c, r);
        break;
      }
      case 'ananas_victoria': {
        // Corps doré quadrillé + couronne verte
        const ry = r * 0.9;
        const cy = c + 5;
        ctx.fillStyle = sphereGradient(ctx, c, cy, ry, 0xf0b429);
        ctx.beginPath();
        ctx.ellipse(c, cy, r * 0.72, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c, cy, r * 0.72, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(150, 105, 20, 0.5)';
        ctx.lineWidth = 2;
        for (let d = -size; d < size * 2; d += 15) {
          ctx.beginPath();
          ctx.moveTo(d, 0);
          ctx.lineTo(d + size, size);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(d + size, 0);
          ctx.lineTo(d, size);
          ctx.stroke();
        }
        ctx.restore();
        addGloss(ctx, c, cy, ry);
        // Couronne
        ctx.fillStyle = '#2e7d4f';
        const crownBase = cy - ry + 4;
        for (const [dx, tipDx, tipDy] of [
          [-18, -26, -16],
          [-6, -6, -20],
          [6, 8, -19],
          [18, 28, -14],
        ]) {
          ctx.beginPath();
          ctx.moveTo(c + dx - 6, crownBase);
          ctx.lineTo(c + tipDx, crownBase + tipDy);
          ctx.lineTo(c + dx + 6, crownBase);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'mangue_jose': {
        // Ovale incliné orange avec joue rouge
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(-0.35);
        ctx.fillStyle = sphereGradient(ctx, 0, 0, r * 0.8, 0xf28c28);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.92, r * 0.68, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#d94f35';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.28, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        addGloss(ctx, 0, 0, r * 0.8);
        ctx.restore();
        break;
      }
      case 'fruit_de_la_passion': {
        // Sphère violette mouchetée, volume + reflet
        ctx.fillStyle = sphereGradient(ctx, c, c, r, 0x5d3277);
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(0x5d3277, 0.28);
        for (let i = 0; i < 9; i++) {
          const angle = (i / 9) * Math.PI * 2 + 0.4;
          const rr = r * (i % 3 === 0 ? 0.55 : 0.75);
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * rr, c + Math.sin(angle) * rr, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        addGloss(ctx, c, c, r);
        break;
      }
      case 'papaye': {
        // Grand ovale vertical jaune-orangé strié, avec volume
        ctx.fillStyle = sphereGradient(ctx, c, c, r * 0.85, 0xffa552);
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.62, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 192, 74, 0.6)';
        ctx.lineWidth = 5;
        for (const dx of [-r * 0.3, 0, r * 0.3]) {
          ctx.beginPath();
          ctx.ellipse(c + dx * 0.5, c, Math.max(r * 0.62 - Math.abs(dx), 6), r * 0.9, 0, -0.5, 0.5);
          ctx.stroke();
        }
        addGloss(ctx, c, c, r * 0.85);
        break;
      }
      case 'corossol': {
        // Ovoïde vert hérissé de picots sombres, avec volume
        ctx.fillStyle = sphereGradient(ctx, c, c, r * 0.87, 0x6faa4f);
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.8, r * 0.94, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.8, r * 0.94, 0.2, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#4d7d36';
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 6; col++) {
            const px = c - r * 0.7 + col * (r * 0.28) + (row % 2) * (r * 0.14);
            const py = c - r * 0.8 + row * (r * 0.27);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - 4, py + 8);
            ctx.lineTo(px + 4, py + 8);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
        break;
      }
      case 'longane': {
        // Petite sphère brun sable, volume + reflet
        ctx.fillStyle = sphereGradient(ctx, c, c, r, 0xc49a6c);
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(0xc49a6c, -0.22);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + 0.2;
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * r * 0.55, c + Math.sin(angle) * r * 0.55, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        addGloss(ctx, c, c, r);
        break;
      }
      case 'jacque': {
        // Gros ovoïde vert-jaune à picots denses, avec volume
        ctx.fillStyle = sphereGradient(ctx, c, c, r * 0.88, 0xa8b545);
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.82, r * 0.95, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.82, r * 0.95, -0.15, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#7f8f2e';
        for (let row = 0; row < 9; row++) {
          for (let col = 0; col < 8; col++) {
            const px = c - r * 0.8 + col * (r * 0.24) + (row % 2) * (r * 0.12);
            const py = c - r * 0.9 + row * (r * 0.24);
            ctx.beginPath();
            ctx.arc(px, py, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        break;
      }
      case 'carambole': {
        // Étoile à 5 branches — le fruit étoile, avec volume
        ctx.fillStyle = sphereGradient(ctx, c, c, r, 0xf5d442);
        ctx.strokeStyle = '#c9a83a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.52;
          const px = c + Math.cos(angle) * rr;
          const py = c + Math.sin(angle) * rr;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        addGloss(ctx, c, c, r * 0.7);
        break;
      }
      case 'combava_bonus': {
        // Combava doré : halo lumineux + peau dorée bosselée
        const glow = ctx.createRadialGradient(c, c, r * 0.4, c, c, r + 4);
        glow.addColorStop(0, 'rgba(255, 215, 0, 0.55)');
        glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(c, c, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = sphereGradient(ctx, c, c, r - 7, 0xffd700);
        ctx.beginPath();
        ctx.arc(c, c, r - 7, 0, Math.PI * 2);
        ctx.fill();
        // Bosses caractéristiques du combava
        ctx.fillStyle = '#e6b800';
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 + 0.3;
          const rr = (r - 7) * (i % 2 === 0 ? 0.6 : 0.35);
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * rr, c + Math.sin(angle) * rr, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        addGloss(ctx, c, c, r - 7);
        break;
      }
      default: {
        // Variété inconnue : disque neutre pour ne jamais bloquer
        ctx.fillStyle = hexToCss(variety.juiceColor);
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------------
  // Bombe et particules
  // ------------------------------------------------------------------

  /** Bombe placeholder : sphère noire, reflet, mèche et étincelle. */
  private createBombTexture(): void {
    const r = BOMB_RADIUS;
    const size = r * 2;
    const bodyRadius = r - 8; // marge pour laisser la mèche dans le canvas
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Corps sombre + reflet
    g.fillStyle(0x1d1d26, 1);
    g.fillCircle(r, r + 6, bodyRadius);
    g.fillStyle(0x3c3c4e, 1);
    g.fillCircle(r - bodyRadius * 0.35, r + 6 - bodyRadius * 0.35, bodyRadius * 0.28);

    // Mèche stylisée
    g.lineStyle(6, 0x8a6d4a, 1);
    g.beginPath();
    g.moveTo(r, 16);
    g.lineTo(r + 14, 8);
    g.strokePath();

    // Étincelle orange au bout de la mèche
    g.fillStyle(0xffb347, 1);
    g.fillCircle(r + 17, 8, 7);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(r + 17, 8, 3);

    g.generateTexture(TEX_BOMB, size, size);
    g.destroy();
  }

  /** Goutte de jus : petit disque blanc à bord doux, teinté à l'émission. */
  private createJuiceTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 12, 7);
    g.generateTexture(TEX_JUICE, 24, 24);
    g.destroy();
  }

  /**
   * Taches de jus persistantes : blobs irréguliers blancs (teintés à la
   * couleur du fruit à l'affichage). Motifs déterministes — plusieurs
   * variantes pour que deux taches voisines ne se ressemblent pas.
   */
  private createSplatTextures(): void {
    const size = 180;
    const c = size / 2;
    for (let variant = 0; variant < SPLAT_VARIANTS; variant++) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      // Corps principal de la tache
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(c, c, 34 + variant * 3);
      // Lobes autour du corps (angles décalés par variante)
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 + variant * 0.7;
        const dist = 26 + ((i * 13 + variant * 5) % 22);
        const radius = 7 + ((i * 7 + variant * 3) % 12);
        g.fillCircle(c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, radius);
      }
      // Gouttelettes projetées plus loin
      g.fillStyle(0xffffff, 0.7);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + variant * 1.3 + 0.4;
        const dist = 62 + ((i * 11 + variant * 7) % 20);
        g.fillCircle(c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, 4 + (i % 3) * 2);
      }
      g.generateTexture(`${TEX_SPLAT_PREFIX}${variant}`, size, size);
      g.destroy();
    }
  }
}
