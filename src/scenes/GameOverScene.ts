import Phaser from 'phaser';
import { SceneGrading } from '../systems/SceneGrading';
import {
  type GameMode,
  type GameOverReason,
  GAME_FONT,
  FONT_DIGITS,
  MEDAL_THRESHOLDS,
  MEDAL_COLORS,
  MEDAL_LABELS,
  GAMEOVER_COUNT_MS,
  GAMEOVER_STEP_MS,
  TEX_RING,
  TEX_JUICE,
  fontPx,
  px,
} from '../utils/constants';
import { getBestScore, saveBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { prefersReducedMotion } from '../utils/settings';
import { buildShareText, getStreak } from '../utils/dailyChallenge';
import { RECORD, BOMBE } from '../utils/creole';

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
  // « La plané » — la formule que Kevin emploie quand c'est fichu.
  bomb: { title: BOMBE, subtitle: 'Vous avez tranché une bombe…', color: '#ffb347' },
  time: { title: 'TEMPS ÉCOULÉ', subtitle: 'Les 60 secondes sont passées !', color: '#7fd4f0' },
};

/**
 * Écran de fin.
 *
 * Il ne se contente pas d'afficher des chiffres : il les MET EN SCÈNE. Les
 * éléments se révèlent l'un après l'autre, le score défile jusqu'à son total,
 * et une médaille récompense le palier atteint. Un écran de fin qui s'affiche
 * d'un bloc se lit comme un formulaire ; échelonné, il se lit comme un bilan.
 *
 * Responsive : boutons empilés en portrait, côte à côte en paysage.
 */
export class GameOverScene extends Phaser.Scene {
  private finalScore = 0;
  private mode: GameMode = 'classic';
  private reason: GameOverReason = 'lives';
  private fruitsSliced = 0;
  private bestCombo = 0;

  /** Cible du tween de défilement du score. */
  private readonly counter = { value: 0 };
  private scoreValue!: Phaser.GameObjects.BitmapText;
  private shownScore = 0;

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData): void {
    this.finalScore = data.score ?? 0;
    this.mode = data.mode ?? 'classic';
    this.reason = data.reason ?? 'lives';
    this.fruitsSliced = data.fruitsSliced ?? 0;
    this.bestCombo = data.bestCombo ?? 0;
    // La scène est réutilisée : le compteur doit repartir de zéro
    this.counter.value = 0;
    this.shownScore = 0;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    new SceneGrading(this);
    new AnimatedBackground(this, true);
    this.add.rectangle(0, 0, w, h, 0x0b2a3a, 0.62).setOrigin(0);

    const display = REASON_DISPLAY[this.reason];
    // Le record est calculé AVANT tout affichage : la célébration dépend de lui
    const isNewRecord = saveBestScore(this.mode, this.finalScore);
    const medal = this.medalIndex();

    // Disposition explicite par orientation. Le paysage ne fait que 720 px de
    // haut : empiler titre + score + médaille + record + stats + boutons y
    // provoquait des chevauchements. La médaille passe donc SUR LE CÔTÉ du
    // score en paysage, et reste dessous en portrait où la place ne manque pas.
    const L = portrait
      ? { title: 0.14, sub: 0.21, scoreLabel: 0.3, score: 0.33, scoreSize: px(76),
          medalX: w / 2, medalY: h * 0.47, record: 0.6, stats: 0.66 }
      : { title: 0.12, sub: 0.19, scoreLabel: 0.29, score: 0.32, scoreSize: px(68),
          medalX: w / 2 - px(300), medalY: h * 0.37, record: 0.53, stats: 0.62 };

    // --- Titre et cause, révélés en premier ---
    const title = this.add
      .text(w / 2, h * L.title, display.title, {
        fontFamily: GAME_FONT,
        fontSize: portrait ? fontPx(78) : fontPx(80),
        fontStyle: '700',
        color: display.color,
        stroke: '#1d2731',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.reveal(title, 0, true);

    const subtitle = this.add
      .text(w / 2, h * L.sub, display.subtitle, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(30),
        color: '#fff3e0',
      })
      .setOrigin(0.5);
    this.reveal(subtitle, 1);

    // --- Score en gros chiffres, qui défile jusqu'au total ---
    const label = this.add
      .text(w / 2, h * L.scoreLabel, 'SCORE', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(26),
        fontStyle: '600',
        color: '#9fd0e6',
      })
      .setOrigin(0.5);
    this.reveal(label, 2);

    this.scoreValue = this.add
      .bitmapText(w / 2, h * L.score, FONT_DIGITS, '0', L.scoreSize)
      .setOrigin(0.5, 0);
    this.reveal(this.scoreValue, 2);
    this.countScoreUp();

    // --- Médaille (si palier atteint) ---
    if (medal >= 0) {
      this.createMedal(L.medalX, L.medalY, medal);
    }

    // --- Record ---
    this.createRecordLine(h * L.record, isNewRecord);

    // --- Statistiques ---
    const stats = this.add
      .text(w / 2, h * L.stats, this.statsLine(), {
        fontFamily: GAME_FONT,
        fontSize: fontPx(27),
        color: '#cfe6f0',
      })
      .setOrigin(0.5);
    this.reveal(stats, 6);

    this.createButtons();
    addVignette(this);
    fadeIn(this);
  }

  /**
   * Apparition échelonnée : chaque élément monte en place avec un léger
   * retard sur le précédent. C'est ce décalage qui transforme une liste
   * statique en révélation.
   */
  private reveal(
    target: Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText | Phaser.GameObjects.Container,
    step: number,
    big = false
  ): void {
    target.setAlpha(0);
    const baseY = target.y;
    target.setY(baseY + 26);
    this.tweens.add({
      targets: target,
      alpha: 1,
      y: baseY,
      duration: big ? 420 : 300,
      delay: step * GAMEOVER_STEP_MS,
      ease: 'Back.easeOut',
    });
  }

  /** Fait défiler le score de 0 à son total, avec un « clic » à l'arrivée. */
  private countScoreUp(): void {
    if (this.finalScore <= 0) {
      this.scoreValue.setText('0');
      return;
    }
    this.tweens.add({
      targets: this.counter,
      value: this.finalScore,
      duration: GAMEOVER_COUNT_MS,
      delay: GAMEOVER_STEP_MS * 3,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const shown = Math.round(this.counter.value);
        if (shown !== this.shownScore) {
          this.shownScore = shown;
          this.scoreValue.setText(String(shown));
        }
      },
      onComplete: () => {
        // Petite poussée finale : le total « se pose »
        this.scoreValue.setText(String(this.finalScore));
        this.tweens.add({
          targets: this.scoreValue,
          scale: 1.14,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      },
    });
  }

  /** Palier de médaille atteint : -1 si aucun, sinon 0=bronze, 1=argent, 2=or. */
  private medalIndex(): number {
    const thresholds = MEDAL_THRESHOLDS[this.mode];
    let index = -1;
    for (let i = 0; i < thresholds.length; i++) {
      if (this.finalScore >= thresholds[i]) {
        index = i;
      }
    }
    return index;
  }

  /**
   * Médaille : un disque coloré avec liseré et libellé, qui arrive en
   * tournant. Assemblée dans un Container pour être animée d'un bloc.
   */
  private createMedal(x: number, y: number, medal: number): void {
    const color = MEDAL_COLORS[medal];
    const container = this.add.container(x, y);

    const halo = this.add
      .image(0, 0, TEX_RING)
      .setDisplaySize(190, 190)
      .setTint(color)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    container.add(halo);

    const disc = this.add.graphics();
    disc.fillStyle(color, 1);
    disc.fillCircle(0, 0, 40);
    disc.fillStyle(0xffffff, 0.28);
    disc.fillCircle(-12, -14, 18); // reflet
    disc.lineStyle(4, 0xffffff, 0.75);
    disc.strokeCircle(0, 0, 40);
    container.add(disc);

    const label = this.add
      .text(0, 68, MEDAL_LABELS[medal], {
        fontFamily: GAME_FONT,
        fontSize: fontPx(24),
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#1d2731',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    container.add(label);

    // Arrivée en rotation : la médaille « tombe » sur l'écran
    container.setAlpha(0).setScale(0.2).setAngle(-140);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      angle: 0,
      duration: 520,
      delay: GAMEOVER_STEP_MS * 3 + GAMEOVER_COUNT_MS * 0.7,
      ease: 'Back.easeOut',
    });
    // Le halo respire une fois posée
    this.tweens.add({
      targets: halo,
      alpha: 0.8,
      duration: 900,
      delay: GAMEOVER_STEP_MS * 3 + GAMEOVER_COUNT_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** « Nouveau record ! » célébré, ou rappel du record courant du mode. */
  private createRecordLine(y: number, isNewRecord: boolean): void {
    const w = this.scale.width;

    // Le Défi du jour affiche la SÉRIE plutôt que le record. C'est elle qui
    // donne envie de revenir demain : un record se bat une fois, une série se
    // perd si on saute un jour.
    if (this.mode === 'daily') {
      const serie = getStreak();
      const libelle =
        serie > 1 ? `Série de ${serie} jours 🔥` : 'Défi du jour relevé';
      const ligne = this.add
        .text(w / 2, y, libelle, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(32),
          color: serie > 1 ? '#ffd76a' : '#fff3e0',
        })
        .setOrigin(0.5);
      this.reveal(ligne, 5);
      return;
    }

    if (!isNewRecord) {
      const line = this.add
        .text(w / 2, y, `Record : ${getBestScore(this.mode)}`, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(30),
          color: '#fff3e0',
        })
        .setOrigin(0.5);
      this.reveal(line, 5);
      return;
    }

    const record = this.add
      .text(w / 2, y, `★ ${RECORD} ★\nNouveau record`, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(40),
        fontStyle: '700',
        color: '#ffe066',
        align: 'center',
        stroke: '#1d2731',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.reveal(record, 5);
    this.tweens.add({
      targets: record,
      scale: 1.1,
      duration: 520,
      delay: GAMEOVER_STEP_MS * 5 + 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Gerbe de confettis à l'annonce : le record se fête
    const confetti = this.add
      .particles(w / 2, y, TEX_JUICE, {
        speed: { min: 180, max: 460 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0 },
        lifespan: { min: 700, max: 1300 },
        gravityY: 620,
        tint: [0xffe066, 0xff6b6b, 0x7fd4f0, 0x9be36f],
        emitting: false,
      })
      .setDepth(60);
    this.time.delayedCall(GAMEOVER_STEP_MS * 5 + 250, () => {
      // Confettis supprimés en mouvement réduit : c'est le seul effet
      // plein écran du jeu, et le plus agressif pour une sensibilité visuelle.
      if (!prefersReducedMotion()) {
        confetti.emitParticleAt(w / 2, y, 40);
      }
      sfx.bonus();
    });
  }

  private statsLine(): string {
    let text = `${this.fruitsSliced} fruits tranchés`;
    if (this.bestCombo >= 2) {
      text += `   ·   Meilleur combo : x${this.bestCombo}`;
    }
    return text;
  }

  private createButtons(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    const defi = this.mode === 'daily';

    // Portrait : boutons empilés ; paysage : côte à côte. Le Défi ajoute un
    // troisième bouton, donc l'écartement se resserre pour qu'ils tiennent.
    const ecart = defi ? px(210) : px(150);
    const replayX = portrait ? w / 2 : w / 2 - ecart;
    const replayY = portrait ? h * 0.76 : h * 0.83;
    const menuX = portrait ? w / 2 : w / 2 + ecart;
    const menuY = portrait ? h * 0.93 : h * 0.83;

    this.makeButton(replayX, replayY, px(264), px(78), 'Rejouer', 0xe0455a, 7, () => {
      sfx.click();
      fadeToScene(this, 'GameScene', { mode: this.mode });
    });

    if (defi) {
      this.makeButton(portrait ? w / 2 : w / 2, portrait ? h * 0.845 : h * 0.83,
        px(236), px(70), 'Partager', 0x2f7d5b, 8, () => {
        sfx.click();
        void this.shareResult();
      });
    }

    this.makeButton(menuX, menuY, px(224), px(70), 'Menu', 0x2d3a4a, defi ? 9 : 8, () => {
      sfx.click();
      fadeToScene(this, 'MenuScene');
    });
  }

  /**
   * Partage le résultat du défi.
   *
   * navigator.share d'abord : sur téléphone, c'est la feuille de partage native
   * du système, celle qui ouvre WhatsApp ou Messages directement. Le
   * presse-papiers sert de repli sur ordinateur, où l'API n'existe presque
   * jamais. Les deux échouent silencieusement si le navigateur refuse — un
   * partage raté ne doit pas casser l'écran de fin.
   */
  private async shareResult(): Promise<void> {
    const texte = buildShareText(this.finalScore, this.fruitsSliced);

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: texte });
        return;
      }
    } catch {
      // L'utilisateur a annulé la feuille de partage : ce n'est pas une erreur.
      return;
    }

    try {
      await navigator.clipboard.writeText(texte);
      this.flashShareConfirmation('Copié !');
    } catch {
      this.flashShareConfirmation('Copie impossible');
    }
  }

  /** Petit retour visuel : sans lui, on ne sait pas si le partage a marché. */
  private flashShareConfirmation(message: string): void {
    const note = this.add
      .text(this.scale.width / 2, this.scale.height * 0.7, message, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(30),
        color: '#9ff0c4',
      })
      .setOrigin(0.5)
      .setDepth(300);

    this.tweens.add({
      targets: note,
      alpha: 0,
      y: note.y - 40,
      duration: 1400,
      ease: 'Sine.easeIn',
      onComplete: () => note.destroy(),
    });
  }

  /**
   * Bouton arrondi assemblé dans un Container (fond + libellé) pour que
   * l'apparition échelonnée et l'effet d'appui portent sur l'ensemble.
   */
  private makeButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    fill: number,
    step: number,
    onClick: () => void
  ): void {
    const container = this.add.container(x, y);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, height / 2);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    container.add(g);

    container.add(
      this.add
        .text(0, 0, label, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(40),
          fontStyle: '700',
          color: '#ffffff',
        })
        .setOrigin(0.5)
    );

    // La zone tactile reste un objet de scène (hors container) : un container
    // n'a pas de taille propre, le rendre interactif demanderait de la fixer
    // à la main — inutile ici.
    this.add
      .zone(x, y, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        // Effet d'appui : le bouton s'enfonce avant d'agir
        this.tweens.add({
          targets: container,
          scale: 0.94,
          duration: 90,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
        onClick();
      });

    this.reveal(container, step);
  }
}
