import Phaser from 'phaser';
import { DECOR_ILLUSTRE } from '../utils/visuels';

/**
 * Première scène : configuration minimale avant le chargement.
 * (Dans un projet avec assets réels, on chargerait ici uniquement
 * le strict nécessaire à l'écran de chargement : logo, barre, etc.)
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Le décor léger de l'écran de chargement arrive avant les planches de fruits.
    this.load.image(DECOR_ILLUSTRE, `${import.meta.env.BASE_URL}assets/decors/lagon-v1.webp`);
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
