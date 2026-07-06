import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TEX_BOMB,
  TEX_JUICE,
  BOMB_RADIUS,
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
    this.createBackgroundTexture();
    for (const variety of FRUIT_VARIETIES) {
      this.createVarietyTextures(variety);
    }
    this.createVarietyTextures(BONUS_VARIETY);
    this.createBombTexture();
    this.createJuiceTexture();
    this.scene.start('MenuScene');
  }

  // ------------------------------------------------------------------
  // Décor : coucher de soleil tropical, volcan, océan, palmiers
  // ------------------------------------------------------------------

  private createBackgroundTexture(): void {
    const texture = this.textures.createCanvas('background', GAME_WIDTH, GAME_HEIGHT);
    if (texture === null) {
      return; // ne peut arriver que si la clé existe déjà
    }
    const ctx = texture.getContext();
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;

    // Ciel : lagon en haut → or → corail au couchant
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1478a0');
    sky.addColorStop(0.45, '#3fa7c4');
    sky.addColorStop(0.72, '#f2a95c');
    sky.addColorStop(1, '#e2603c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Nuages doux
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (const [cx, cy, rx] of [
      [W * 0.24, H * 0.13, 120],
      [W * 0.62, H * 0.08, 90],
      [W * 0.8, H * 0.2, 110],
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soleil couchant avec halo, partiellement derrière les montagnes
    const sunX = W * 0.66;
    const sunY = H * 0.52;
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
    const size = variety.radius * 2 + 8; // marge pour feuilles/couronnes/halo
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
        // Coque rose-rouge granuleuse + feuille
        ctx.fillStyle = '#e0455a';
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c23349';
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const rr = r * (i % 2 === 0 ? 0.62 : 0.32);
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * rr, c + Math.sin(angle) * rr, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f78fa0';
        ctx.beginPath();
        ctx.arc(c - r * 0.35, c - r * 0.35, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ananas_victoria': {
        // Corps doré quadrillé + couronne verte
        const ry = r * 0.9;
        const cy = c + 5;
        ctx.fillStyle = '#f0b429';
        ctx.beginPath();
        ctx.ellipse(c, cy, r * 0.72, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c, cy, r * 0.72, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = '#c98d1b';
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
        ctx.fillStyle = '#f28c28';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.92, r * 0.68, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#d94f35';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.28, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'fruit_de_la_passion': {
        // Sphère violette mouchetée
        ctx.fillStyle = '#5d3277';
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a4a99';
        for (let i = 0; i < 9; i++) {
          const angle = (i / 9) * Math.PI * 2 + 0.4;
          const rr = r * (i % 3 === 0 ? 0.55 : 0.75);
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * rr, c + Math.sin(angle) * rr, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(c - r * 0.35, c - r * 0.35, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'papaye': {
        // Grand ovale vertical jaune-orangé strié
        ctx.fillStyle = '#ffa552';
        ctx.beginPath();
        ctx.ellipse(c, c, r * 0.62, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f0c04a';
        ctx.lineWidth = 5;
        for (const dx of [-r * 0.3, 0, r * 0.3]) {
          ctx.beginPath();
          ctx.ellipse(c + dx * 0.5, c, Math.max(r * 0.62 - Math.abs(dx), 6), r * 0.9, 0, -0.5, 0.5);
          ctx.stroke();
        }
        break;
      }
      case 'corossol': {
        // Ovoïde vert hérissé de picots sombres
        ctx.fillStyle = '#6faa4f';
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
        // Petite sphère brun sable
        ctx.fillStyle = '#c49a6c';
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a97f4f';
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + 0.2;
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * r * 0.55, c + Math.sin(angle) * r * 0.55, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#dcb98d';
        ctx.beginPath();
        ctx.arc(c - r * 0.32, c - r * 0.32, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'jacque': {
        // Gros ovoïde vert-jaune à picots denses
        ctx.fillStyle = '#a8b545';
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
        // Étoile à 5 branches — le fruit étoile
        ctx.fillStyle = '#f5d442';
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(c - r * 0.2, c - r * 0.25, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.fillStyle = '#ffd700';
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
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(c - r * 0.3, c - r * 0.3, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
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
}
