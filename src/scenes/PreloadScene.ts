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
  TEX_VIGNETTE,
  SUN_FRAC_X,
  SUN_FRAC_Y,
} from '../utils/constants';
import {
  FRUIT_VARIETIES,
  BONUS_VARIETY,
  FRENZY_VARIETY,
  type FruitVariety,
  wholeTextureKey,
  halfTextureKeys,
} from '../utils/fruitCatalog';
import { paintWhole, paintCut } from '../utils/fruitArt';

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
    this.createVarietyTextures(FRENZY_VARIETY);
    this.createBombTexture();
    this.createJuiceTexture();
    this.createSplatTextures();
    this.createGlowTexture();
    this.createCloudTexture();
    this.createVignetteTexture();
    this.scene.start('MenuScene');
  }

  /** Vignettage : cadre radial sombre (transparent au centre, sombre aux bords). */
  private createVignetteTexture(): void {
    const size = 512;
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_VIGNETTE, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(c, c, size * 0.34, c, c, size * 0.63);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(6, 15, 22, 0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
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
    // Marge élargie : place pour feuilles/couronnes/halo ET pour l'ombre
    // portée douce qui détache le fruit du décor assombri.
    const size = variety.radius * 2 + 64;
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
      // Les moitiés sont le MÊME dessin que l'entier, clippé au fil du
      // couteau : silhouette et motifs restent donc parfaitement cohérents
      // entre le fruit en vol et ses deux moitiés.
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
      // correcte même quand le sprite tourne en vol. paintWhole la coupe
      // dès le corps peint, pour que les détails internes restent nets.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 13;
      paintWhole(ctx, variety, size);

      // La chair est peinte DANS le clip de la moitié : elle recouvre
      // l'intérieur de la peau et laisse une bande d'écorce sur le pourtour.
      if (variant !== 'whole') {
        paintCut(ctx, variety, size, variant);
      }
      ctx.restore();
      texture.refresh();
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

  /** Goutte de jus : disque à dégradé radial doux (bord fondu), teinté à l'émission. */
  private createJuiceTexture(): void {
    const size = 28;
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_JUICE, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.55, 'rgba(255, 255, 255, 0.85)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
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
