import Phaser from 'phaser';
import { GAME_FONT } from '../utils/constants';

/**
 * La pause — absente jusqu'ici, et c'est le manque le plus gênant sur mobile :
 * un appel, une notification, un enfant qui réclame, et la partie est perdue
 * sans que le joueur ait rien fait de mal.
 *
 * Elle fige TOUT par l'horloge de la scène plutôt qu'en arrêtant chaque
 * système un par un. `time.paused` gèle les minuteurs de spawn, la minuterie
 * d'explosion de la grenade, le minuteur de reprise du hit-stop — et, parce
 * que le chrono se lit sur `time.now`, il s'arrête de lui-même. Pas de
 * compensation à calculer, donc pas de dérive possible.
 *
 * La mise en pause automatique quand l'onglet passe en arrière-plan est le
 * point le plus important : sur téléphone, c'est la situation réelle.
 */
export class PauseController {
  private overlay!: Phaser.GameObjects.Container;
  private button!: Phaser.GameObjects.Text;
  private paused = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onQuit: () => void,
    private readonly canPause: () => boolean
  ) {}

  get isPaused(): boolean {
    return this.paused;
  }

  create(): void {
    this.createButton();
    this.createOverlay();
    this.bindKeyboard();
    this.bindAutoPause();

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private createButton(): void {
    // Symétrique du bouton de son, en bas à droite. Cible de 56 px de côté :
    // en dessous, un bouton devient difficile à viser au pouce en pleine action.
    this.button = this.scene.add
      .text(this.scene.scale.width - 52, this.scene.scale.height - 52, '❚❚', {
        fontFamily: GAME_FONT,
        fontSize: '30px',
        color: '#eef3f7',
        padding: { x: 14, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0.85)
      .setInteractive({ useHandCursor: true });

    this.button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // On arrête la propagation : sans ça, le toucher qui met en pause
      // compte aussi comme un début de geste de coupe.
      pointer.event.stopPropagation();
      this.toggle();
    });
  }

  private createOverlay(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const veil = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x0a0712, 0.82);
    const title = this.scene.add
      .text(w / 2, h / 2 - 110, 'Pause', {
        fontFamily: GAME_FONT,
        fontSize: '68px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const resume = this.makeChoice(w / 2, h / 2 + 10, 'Reprendre', () => this.setPaused(false));
    const quit = this.makeChoice(w / 2, h / 2 + 100, 'Menu', () => {
      this.setPaused(false);
      this.onQuit();
    });

    this.overlay = this.scene.add
      .container(0, 0, [veil, title, resume, quit])
      .setDepth(200)
      .setVisible(false);

    // Le voile intercepte les touchers : sinon on continuerait à trancher des
    // fruits invisibles derrière l'écran de pause.
    veil.setInteractive();
  }

  private makeChoice(x: number, y: number, label: string, action: () => void): Phaser.GameObjects.Text {
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: GAME_FONT,
        fontSize: '40px',
        color: '#ffffff',
        backgroundColor: '#2a1a2e',
        padding: { x: 34, y: 16 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    text.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      action();
    });
    text.on('pointerover', () => text.setColor('#ffd76a'));
    text.on('pointerout', () => text.setColor('#ffffff'));

    return text;
  }

  private bindKeyboard(): void {
    // Échap et P : les deux touches que tout le monde essaie.
    this.scene.input.keyboard?.on('keydown-ESC', () => this.toggle());
    this.scene.input.keyboard?.on('keydown-P', () => this.toggle());
  }

  private bindAutoPause(): void {
    // Le cas réel sur téléphone : un appel arrive, l'onglet passe derrière.
    // Sans ça, le joueur revient sur un game over qu'il n'a pas vu venir.
    this.onVisibilityChange = () => {
      if (document.hidden && !this.paused && this.canPause()) {
        this.setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // Phaser signale aussi la perte de focus de la fenêtre : utile sur bureau
    // quand on change d'application sans masquer l'onglet.
    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
  }

  private onVisibilityChange: (() => void) | null = null;

  private onBlur(): void {
    if (!this.paused && this.canPause()) {
      this.setPaused(true);
    }
  }

  toggle(): void {
    if (!this.paused && !this.canPause()) {
      return;
    }
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.overlay.setVisible(paused);
    this.button.setVisible(!paused);

    if (paused) {
      this.scene.physics.pause();
      this.scene.tweens.pauseAll();
      // Gèle toutes les minuteries ET fige time.now, dont dépend le chrono.
      this.scene.time.paused = true;
    } else {
      this.scene.time.paused = false;
      this.scene.tweens.resumeAll();
      this.scene.physics.resume();
    }
  }

  private destroy(): void {
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
  }
}
