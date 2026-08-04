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
  const radius = Math.min(height / 2, 26);
  const g = scene.add.graphics().setDepth(49);

  // Ombre portée : une plaque sombre décalée sous le cartouche. C'est elle
  // qui donne l'impression d'un élément posé PAR-DESSUS la scène plutôt que
  // d'un rectangle peint dedans.
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(x + 2, y + 4, width, height, radius);

  // Corps : dégradé vertical (clair en haut, sombre en bas) obtenu par
  // bandes horizontales — Graphics ne sait pas remplir avec un dégradé, mais
  // à cette taille la transition reste invisible.
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const bandY = y + (height / bands) * i;
    const bandH = height / bands + 1;
    g.fillStyle(HUD_PANEL_COLOR, HUD_PANEL_ALPHA * (1.25 - t * 0.45));
    if (i === 0 || i === bands - 1) {
      // Bandes extrêmes arrondies pour respecter la forme du cartouche
      g.fillRoundedRect(x, bandY, width, bandH, radius);
    } else {
      g.fillRect(x, bandY, width, bandH);
    }
  }

  // Liseré clair en haut, plus discret en bas : lumière venant du ciel
  g.lineStyle(2, 0xffffff, 0.32);
  g.strokeRoundedRect(x, y, width, height, radius);
  g.lineStyle(2, 0xffffff, 0.16);
  g.beginPath();
  g.moveTo(x + radius, y + 2);
  g.lineTo(x + width - radius, y + 2);
  g.strokePath();

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
