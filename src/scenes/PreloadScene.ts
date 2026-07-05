import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FRUIT_RADIUS,
  COLOR_SKY_TOP,
  COLOR_SKY_BOTTOM,
  COLOR_MOUNTAIN,
  TEX_FRUIT_WHOLE,
  TEX_FRUIT_HALF_LEFT,
  TEX_FRUIT_HALF_RIGHT,
} from '../utils/constants';

/** Convertit une couleur hex numérique en chaîne CSS (#rrggbb). */
function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Génération des assets placeholder.
 *
 * Aucun fichier image n'est requis en Phase 1 : toutes les textures sont
 * générées procéduralement (Graphics → generateTexture, Canvas pour le fond).
 * Quand les vrais assets arriveront (public/assets/fruits/...), il suffira
 * de remplacer ces générations par des this.load.image() sans toucher au
 * reste du code — les clés de texture resteront identiques.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  create(): void {
    this.createBackgroundTexture();
    this.createFruitTextures();
    this.scene.start('MenuScene');
  }

  /** Fond : dégradé tropical + silhouette de montagne volcanique. */
  private createBackgroundTexture(): void {
    const texture = this.textures.createCanvas('background', GAME_WIDTH, GAME_HEIGHT);
    if (texture === null) {
      return; // ne peut arriver que si la clé existe déjà
    }
    const ctx = texture.getContext();

    // Dégradé bleu lagon → orange coucher de soleil
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, hexToCss(COLOR_SKY_TOP));
    gradient.addColorStop(1, hexToCss(COLOR_SKY_BOTTOM));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Silhouette volcanique discrète (façon Piton des Neiges / Fournaise)
    ctx.fillStyle = `${hexToCss(COLOR_MOUNTAIN)}66`; // ~40% d'opacité
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT);
    ctx.lineTo(0, GAME_HEIGHT * 0.78);
    ctx.lineTo(GAME_WIDTH * 0.22, GAME_HEIGHT * 0.62);
    ctx.lineTo(GAME_WIDTH * 0.38, GAME_HEIGHT * 0.72);
    ctx.lineTo(GAME_WIDTH * 0.58, GAME_HEIGHT * 0.55);
    ctx.lineTo(GAME_WIDTH * 0.63, GAME_HEIGHT * 0.58); // petit cratère
    ctx.lineTo(GAME_WIDTH * 0.68, GAME_HEIGHT * 0.56);
    ctx.lineTo(GAME_WIDTH * 0.85, GAME_HEIGHT * 0.7);
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT * 0.66);
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
    ctx.closePath();
    ctx.fill();

    texture.refresh();
  }

  /**
   * Placeholder du litchi (Phase 1 : un seul type de fruit) :
   * cercle rose-rouge + reflet, et les deux moitiés (demi-disques).
   */
  private createFruitTextures(): void {
    const r = FRUIT_RADIUS;
    const size = r * 2;
    const bodyColor = 0xe0455a; // rose-rouge letchi
    const shineColor = 0xf78fa0;

    // --- Fruit entier ---
    const whole = this.make.graphics({ x: 0, y: 0 }, false);
    whole.fillStyle(bodyColor, 1);
    whole.fillCircle(r, r, r);
    whole.fillStyle(shineColor, 0.8);
    whole.fillCircle(r - r * 0.35, r - r * 0.35, r * 0.25); // reflet
    whole.generateTexture(TEX_FRUIT_WHOLE, size, size);
    whole.destroy();

    // --- Moitié gauche (arc de 90° à 270°, côté gauche du cercle) ---
    const left = this.make.graphics({ x: 0, y: 0 }, false);
    left.fillStyle(bodyColor, 1);
    left.slice(r, r, r, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false);
    left.fillPath();
    // Chair claire le long de la coupe
    left.fillStyle(0xfbe6d4, 1);
    left.fillRect(r - 6, 0, 6, size);
    left.generateTexture(TEX_FRUIT_HALF_LEFT, size, size);
    left.destroy();

    // --- Moitié droite (arc de 270° à 90°, côté droit du cercle) ---
    const right = this.make.graphics({ x: 0, y: 0 }, false);
    right.fillStyle(bodyColor, 1);
    right.slice(r, r, r, Phaser.Math.DegToRad(270), Phaser.Math.DegToRad(90), false);
    right.fillPath();
    right.fillStyle(0xfbe6d4, 1);
    right.fillRect(r, 0, 6, size);
    right.generateTexture(TEX_FRUIT_HALF_RIGHT, size, size);
    right.destroy();
  }
}
