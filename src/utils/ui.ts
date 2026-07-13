import Phaser from 'phaser';
import { isMuted } from './settings';
import { music } from '../systems/MusicManager';
import {
  TEX_VIGNETTE,
  DEPTH_VIGNETTE,
  HUD_PANEL_COLOR,
  HUD_PANEL_ALPHA,
} from './constants';

/**
 * Vignettage plein écran : cadre sombre discret sur les bords, qui
 * concentre le regard vers le centre (rendu plus cinématique/fini).
 * Étiré à la taille courante, au-dessus du jeu mais sous le HUD.
 */
export function addVignette(scene: Phaser.Scene): void {
  scene.add
    .image(0, 0, TEX_VIGNETTE)
    .setOrigin(0)
    .setDisplaySize(scene.scale.width, scene.scale.height)
    .setDepth(DEPTH_VIGNETTE);
}

/**
 * Cartouche de HUD : panneau arrondi translucide (fond + liseré clair)
 * derrière un élément d'interface, pour un look "produit fini".
 */
export function addHudPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const radius = height / 2;
  const g = scene.add.graphics().setDepth(49);
  g.fillStyle(HUD_PANEL_COLOR, HUD_PANEL_ALPHA);
  g.fillRoundedRect(x, y, width, height, radius);
  g.lineStyle(2, 0xffffff, 0.25);
  g.strokeRoundedRect(x, y, width, height, radius);
  return g;
}

/**
 * Bouton muet 🔊/🔇 partagé entre les scènes.
 * Zone tactile généreuse (padding), état persistant via settings.
 */
export function createMuteButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  const button = scene.add
    .text(x, y, isMuted() ? '🔇' : '🔊', {
      fontSize: '44px',
      padding: { x: 14, y: 14 },
    })
    .setOrigin(0.5)
    .setDepth(90)
    .setAlpha(0.85)
    .setInteractive({ useHandCursor: true });

  button.on('pointerdown', () => {
    const muted = music.toggleMuted();
    button.setText(muted ? '🔇' : '🔊');
  });

  return button;
}
