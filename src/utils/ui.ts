import Phaser from 'phaser';
import { isMuted, getQualityPreference, setQualityPreference } from './settings';
import { music } from '../systems/MusicManager';
import {
  TEX_VIGNETTE,
  DEPTH_VIGNETTE,
  HUD_PANEL_COLOR,
  HUD_PANEL_ALPHA,
  SCENE_FADE_MS,
  SCREEN_BLEED,
  GAME_FONT,
  fontPx,
  px,
} from './constants';

/**
 * Vignettage plein écran : cadre sombre discret sur les bords, qui
 * concentre le regard vers le centre (rendu plus cinématique/fini).
 * Étiré à la taille courante, au-dessus du jeu mais sous le HUD.
 */
export function addVignette(scene: Phaser.Scene): void {
  // Déborde de l'écran comme le décor : sans cela, une secousse de caméra
  // ferait apparaître le bord franc du vignettage au ras de l'image.
  scene.add
    .image(-SCREEN_BLEED, -SCREEN_BLEED, TEX_VIGNETTE)
    .setOrigin(0)
    .setDisplaySize(scene.scale.width + SCREEN_BLEED * 2, scene.scale.height + SCREEN_BLEED * 2)
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
 * Ouverture en fondu au début d'une scène. Appelée par chaque scène juste
 * après sa construction : une coupure sèche entre écrans fait « page web qui
 * change », un fondu fait « jeu ».
 */
export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(SCENE_FADE_MS, 0, 0, 0);
}

/**
 * Fermeture en fondu puis changement de scène. Le passage de relais n'a lieu
 * qu'une fois le fondu terminé, sinon la nouvelle scène démarrerait sous un
 * voile noir en train de s'effacer.
 */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  const cam = scene.cameras.main;
  let switched = false;
  const go = (): void => {
    if (switched) {
      return;
    }
    switched = true;
    scene.scene.start(key, data);
  };

  cam.fadeOut(SCENE_FADE_MS, 0, 0, 0);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);

  // Filet de sécurité : un fondu déjà en cours sur cette caméra fait ignorer
  // le nouveau, et l'événement de fin ne viendrait jamais — le joueur
  // resterait coincé sur l'écran. Une coupe sèche vaut mieux qu'un blocage.
  scene.time.delayedCall(SCENE_FADE_MS + 150, go);
}

/**
 * Bouton muet 🔊/🔇 partagé entre les scènes.
 * Zone tactile généreuse (padding), état persistant via settings.
 */
export function createMuteButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  const button = scene.add
    .text(x, y, isMuted() ? '🔇' : '🔊', {
      fontSize: fontPx(44),
      padding: { x: px(14), y: px(14) },
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

/**
 * Bouton de qualité graphique, réservé au menu.
 *
 * Il recharge la page : toutes les textures sont peintes en code à la
 * résolution choisie, changer d'échelle impose donc de les refaire. C'est
 * assumé plutôt que caché — l'écran de chargement dure moins d'une seconde,
 * et une régénération à chaud aurait coûté bien plus de complexité que ce
 * qu'elle aurait fait gagner.
 *
 * Le libellé dit la résolution obtenue, pas un adjectif : « Haute » ne veut
 * rien dire pour qui hésite, « 2× (max) » se compare.
 */
export function createQualityButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  const libelle = (): string => (getQualityPreference() === 'high' ? 'Netteté 2×' : 'Netteté auto');

  const button = scene.add
    .text(x, y, libelle(), {
      fontFamily: GAME_FONT,
      fontSize: fontPx(22),
      color: '#cfe3ef',
      backgroundColor: '#16303f',
      padding: { x: px(14), y: px(9) },
    })
    .setOrigin(1, 0.5)
    .setDepth(90)
    .setAlpha(0.9)
    .setInteractive({ useHandCursor: true });

  button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    // Sans cela, le toucher qui change le réglage compte aussi comme un
    // début de geste de coupe et sélectionne un mode de jeu.
    pointer.event.stopPropagation();
    setQualityPreference(getQualityPreference() === 'high' ? 'auto' : 'high');
    window.location.reload();
  });
  button.on('pointerover', () => button.setColor('#ffd76a'));
  button.on('pointerout', () => button.setColor('#cfe3ef'));

  return button;
}
