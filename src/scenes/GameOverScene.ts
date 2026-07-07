import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  type GameMode,
  type GameOverReason,
} from '../utils/constants';
import { getBestScore, saveBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';

/** Données passées par la GameScene à la fin d'une partie. */
interface GameOverData {
  score: number;
  mode: GameMode;
  reason: GameOverReason;
}

/** Titre et sous-titre adaptés à la cause de fin de partie. */
const REASON_DISPLAY: Record<GameOverReason, { title: string; subtitle: string; color: string }> = {
  lives: { title: 'GAME OVER', subtitle: 'Plus de vies !', color: '#ff6b6b' },
  bomb: { title: 'BOUM !', subtitle: 'Vous avez tranché une bombe…', color: '#ffb347' },
  time: { title: 'TEMPS ÉCOULÉ', subtitle: 'Les 60 secondes sont passées !', color: '#7fd4f0' },
};

/**
 * Écran de fin : score final, record persistant (localStorage),
 * relance dans le même mode ou retour au menu.
 */
export class GameOverScene extends Phaser.Scene {
  private finalScore = 0;
  private mode: GameMode = 'classic';
  private reason: GameOverReason = 'lives';

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData): void {
    this.finalScore = data.score ?? 0;
    this.mode = data.mode ?? 'classic';
    this.reason = data.reason ?? 'lives';
  }

  create(): void {
    this.add.image(0, 0, 'background').setOrigin(0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b2a3a, 0.55).setOrigin(0);

    const display = REASON_DISPLAY[this.reason];

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, display.title, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: display.color,
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.33, display.subtitle, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '32px',
        color: '#fff3e0',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.47, `Score : ${this.finalScore}`, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '60px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.createRecordText();
    this.createButtons();
  }

  /** Affiche « Nouveau record ! » (animé) ou le record courant du mode. */
  private createRecordText(): void {
    const isNewRecord = saveBestScore(this.mode, this.finalScore);
    if (isNewRecord) {
      const record = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.58, '★ Nouveau record ! ★', {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#2d3a4a',
          strokeThickness: 6,
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: record,
        scale: 1.12,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.58, `Record : ${getBestScore(this.mode)}`, {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '32px',
          color: '#fff3e0',
        })
        .setOrigin(0.5);
    }
  }

  private createButtons(): void {
    // Paysage : les deux boutons côte à côte
    const replay = this.add
      .text(GAME_WIDTH / 2 - 150, GAME_HEIGHT * 0.78, 'Rejouer', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#e0455a',
        padding: { x: 40, y: 18 }, // zone tactile généreuse (> 44px)
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    replay.on('pointerdown', () => {
      sfx.click();
      this.scene.start('GameScene', { mode: this.mode });
    });

    const menu = this.add
      .text(GAME_WIDTH / 2 + 150, GAME_HEIGHT * 0.78, 'Menu', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#2d3a4a',
        padding: { x: 40, y: 18 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menu.on('pointerdown', () => {
      sfx.click();
      this.scene.start('MenuScene');
    });
  }
}
