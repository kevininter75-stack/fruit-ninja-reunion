import Phaser from 'phaser';
import { isMuted } from './settings';
import { music } from '../systems/MusicManager';

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
