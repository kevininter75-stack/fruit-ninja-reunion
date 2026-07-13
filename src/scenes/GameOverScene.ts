import Phaser from 'phaser';
import { type GameMode, type GameOverReason } from '../utils/constants';
import { getBestScore, saveBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { addVignette } from '../utils/ui';

/** Données passées par la GameScene à la fin d'une partie. */
interface GameOverData {
  score: number;
  mode: GameMode;
  reason: GameOverReason;
  fruitsSliced: number;
  bestCombo: number;
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
 * Responsive : boutons empilés en portrait, côte à côte en paysage.
 */
export class GameOverScene extends Phaser.Scene {
  private finalScore = 0;
  private mode: GameMode = 'classic';
  private reason: GameOverReason = 'lives';
  private fruitsSliced = 0;
  private bestCombo = 0;

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData): void {
    this.finalScore = data.score ?? 0;
    this.mode = data.mode ?? 'classic';
    this.reason = data.reason ?? 'lives';
    this.fruitsSliced = data.fruitsSliced ?? 0;
    this.bestCombo = data.bestCombo ?? 0;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    new AnimatedBackground(this);
    this.add.rectangle(0, 0, w, h, 0x0b2a3a, 0.55).setOrigin(0);

    const display = REASON_DISPLAY[this.reason];

    this.add
      .text(w / 2, h * 0.2, display.title, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: display.color,
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.33, display.subtitle, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '32px',
        color: '#fff3e0',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.47, `Score : ${this.finalScore}`, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '60px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.createRecordText();
    this.createStatsText();
    this.createButtons();
    addVignette(this);
  }

  /** Ligne de statistiques : fruits tranchés et meilleur combo d'un geste. */
  private createStatsText(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    let text = `${this.fruitsSliced} fruits tranchés`;
    if (this.bestCombo >= 2) {
      text += `   ·   Meilleur combo : x${this.bestCombo}`;
    }
    this.add
      .text(w / 2, h * 0.66, text, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '28px',
        color: '#cfe6f0',
      })
      .setOrigin(0.5);
  }

  /** Affiche « Nouveau record ! » (animé) ou le record courant du mode. */
  private createRecordText(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const isNewRecord = saveBestScore(this.mode, this.finalScore);
    if (isNewRecord) {
      const record = this.add
        .text(w / 2, h * 0.58, '★ Nouveau record ! ★', {
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
        .text(w / 2, h * 0.58, `Record : ${getBestScore(this.mode)}`, {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '32px',
          color: '#fff3e0',
        })
        .setOrigin(0.5);
    }
  }

  private createButtons(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    // Portrait : boutons empilés ; paysage : côte à côte
    const replayX = portrait ? w / 2 : w / 2 - 150;
    const replayY = portrait ? h * 0.71 : h * 0.78;
    const menuX = portrait ? w / 2 : w / 2 + 150;
    const menuY = portrait ? h * 0.81 : h * 0.78;

    this.makeButton(replayX, replayY, 264, 78, 'Rejouer', 0xe0455a, () => {
      sfx.click();
      this.scene.start('GameScene', { mode: this.mode });
    });
    this.makeButton(menuX, menuY, 224, 70, 'Menu', 0x2d3a4a, () => {
      sfx.click();
      this.scene.start('MenuScene');
    });
  }

  /** Bouton arrondi : cartouche plein + liseré clair + libellé + zone tactile. */
  private makeButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    fill: number,
    onClick: () => void
  ): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    this.add
      .text(x, y, label, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .zone(x, y, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }
}
