import Phaser from 'phaser';

/**
 * Première scène : configuration minimale avant le chargement.
 * (Dans un projet avec assets réels, on chargerait ici uniquement
 * le strict nécessaire à l'écran de chargement : logo, barre, etc.)
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
