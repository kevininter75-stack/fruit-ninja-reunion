import Phaser from 'phaser';
import { SceneGrading } from '../systems/SceneGrading';
import {
  type GameMode,
  type GameOverReason,
  GAME_FONT,
  DISPLAY_FONT,
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
import { music } from '../systems/MusicManager';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { prefersReducedMotion } from '../utils/settings';
import { buildShareText, getStreak } from '../utils/dailyChallenge';
import { mutationDuJour, objectifDuJour } from '../utils/mutations';
import { envoyer, pseudo, retenirResultat, doitDeposer } from '../systems/Classement';
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
  bomb: { title: BOMBE, subtitle: 'Vous avez tranché un pétard…', color: '#ffb347' },
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
  /** Record battu ? Calculé dans create(), relu par createButtons(). */
  private nouveauRecord = false;
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

  /**
   * Une rotation d'écran reconstruit la scène, qui repartirait sinon de ses
   * valeurs par défaut : score à 0, cause « plus de vies », aucune statistique.
   * Le défaut était plus discret qu'en pleine partie, mais tout aussi faux.
   */
  captureState(): object {
    return {
      score: this.finalScore,
      mode: this.mode,
      reason: this.reason,
      fruitsSliced: this.fruitsSliced,
      bestCombo: this.bestCombo,
    };
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
    // Le match est fini : le rouler se retire, la boucle redevient celle du
    // menu. Sans cela le tambour continuerait de battre sur l'ecran de fin.
    music.setEnPartie(false);
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    new SceneGrading(this);
    new AnimatedBackground(this, true);
    this.add.rectangle(0, 0, w, h, 0x0b2a3a, 0.62).setOrigin(0);

    const display = REASON_DISPLAY[this.reason];
    // Le record est calculé AVANT tout affichage : la célébration dépend de lui
    const isNewRecord = saveBestScore(this.mode, this.finalScore);
    this.nouveauRecord = isNewRecord;

    // LE SCORE PART EN SILENCE, ET SANS QU'ON L'ATTENDE. Le joueur n'a rien à
    // valider et ne voit aucune roue tourner : soit ça passe, soit ça part dans
    // la file locale et repartira au prochain lancement. Un écran de fin qui
    // attendrait le réseau serait un écran de fin cassé.
    // Tant que le joueur n'a pas choisi ses trois lettres, il n'y a rien à
    // envoyer — il les choisira depuis l'écran de classement.
    // SEULEMENT AU RECORD. Une partie qui ne bat pas le meilleur score du
    // joueur n'a rien à faire dans la base : le tableau n'en montre qu'un par
    // personne et par mode, donc elle ne changerait rien à l'affichage tout en
    // faisant grossir la table. Le Défi du jour fait exception — il se classe à
    // la journée (cf. doitDeposer).
    if (!doitDeposer(this.mode, isNewRecord)) {
      // Rien à faire : le record déjà en ligne est meilleur.
    } else if (pseudo() !== null) {
      void envoyer(this.mode, this.finalScore, this.fruitsSliced, this.bestCombo);
    } else {
      // Pas encore de pseudo : le résultat est mis de côté et partira dès
      // qu'elles existeront. Sans ça, le PREMIER score d'un nouveau joueur —
      // souvent le plus beau — serait perdu, et il devrait rejouer après avoir
      // découvert l'écran de classement.
      retenirResultat(this.mode, this.finalScore, this.fruitsSliced, this.bestCombo);
    }
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
        fontFamily: DISPLAY_FONT,
        fontSize: portrait ? fontPx(78) : fontPx(80),
        fontStyle: '700',
        color: display.color,
        stroke: '#1d2731',
        strokeThickness: px(10),
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

    // LES BOUTONS D'ABORD, LE TEXTE ENSUITE. L'ordre compte : les boutons sont
    // ancrés au bas de l'écran, et c'est là où leur pile s'arrête qui dit
    // jusqu'où le texte peut descendre. L'inverse — poser le texte à une
    // fraction fixe puis espérer que les boutons tiennent — est exactement ce
    // qui produisait les chevauchements.
    const hautDesBoutons = this.createButtons();
    this.createBlocTexte(hautDesBoutons, isNewRecord);
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
        strokeThickness: px(5),
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

  /**
   * Le bloc de texte au-dessus des boutons : statistiques, mutation, record.
   *
   * Empilé DEPUIS LE BAS lui aussi, en partant de là où s'arrêtent les boutons,
   * et en utilisant la HAUTEUR RÉELLE de chaque texte plutôt qu'une estimation.
   * C'est ce qui manquait : la ligne de statistiques était à 0,66 de la hauteur
   * et l'invitation au classement à 0,655 — deux valeurs choisies séparément,
   * qui ne pouvaient que se croiser le jour où les deux s'affichent ensemble.
   * En Défi du jour, où s'ajoute encore le nom de la mutation, quatre textes se
   * chevauchaient sur moins de trente pixels.
   */
  private createBlocTexte(bas: number, isNewRecord: boolean): void {
    const w = this.scale.width;
    const ESPACE = px(10);
    let curseur = bas;

    /** Pose un texte juste au-dessus du précédent, puis l'anime. */
    const poser = (texte: Phaser.GameObjects.Text, etape: number): number => {
      curseur -= texte.height / 2;
      const centre = curseur;
      texte.setY(centre);
      curseur -= texte.height / 2 + ESPACE;
      this.reveal(texte, etape);
      // On rend la position AVANT animation : reveal() decale l'objet de 26 px
      // pour le faire monter, donc relire texte.y juste apres serait faux.
      return centre;
    };

    const stats = this.add
      .text(w / 2, 0, this.statsLine(), {
        fontFamily: GAME_FONT,
        fontSize: fontPx(27),
        color: '#cfe6f0',
      })
      .setOrigin(0.5);
    poser(stats, 6);

    this.createRecordLine(poser, isNewRecord);
  }

  /**
   * « Nouveau record ! » célébré, ou rappel du record courant du mode.
   *
   * Reçoit un poseur qui empile vers le HAUT : les textes sont donc créés dans
   * l'ordre inverse de la lecture — la ligne du bas d'abord.
   */
  private createRecordLine(
    poser: (texte: Phaser.GameObjects.Text, etape: number) => number,
    isNewRecord: boolean
  ): void {
    const w = this.scale.width;

    // Le Défi du jour affiche la SÉRIE plutôt que le record. C'est elle qui
    // donne envie de revenir demain : un record se bat une fois, une série se
    // perd si on saute un jour.
    if (this.mode === 'daily') {
      // LE VERDICT D'ABORD, LA SÉRIE ENSUITE.
      //
      // Sans objectif, un score n'est qu'un nombre : on ne sait pas si on a
      // bien joué. L'objectif du jour donne une réponse binaire, et c'est elle
      // qu'on retient et qu'on raconte. La série vient après, parce qu'elle
      // parle de demain quand le verdict parle d'aujourd'hui.
      const objectif = objectifDuJour();
      const reussi = this.finalScore >= objectif;
      const mutation = mutationDuJour();
      const serie = getStreak();
      const suite = serie > 1 ? ` · série de ${serie} jours 🔥` : '';
      const ligne = this.add
        .text(w / 2, 0, `${mutation.nom}${suite}`, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(26),
          color: '#fff3e0',
        })
        .setOrigin(0.5);
      poser(ligne, 6);

      const verdict = this.add
        .text(
          w / 2,
          0,
          reussi ? `Objectif atteint ! ${this.finalScore} / ${objectif}` : `Objectif manqué · ${this.finalScore} / ${objectif}`,
          {
            fontFamily: DISPLAY_FONT,
            fontSize: fontPx(36),
            color: reussi ? '#7ddf7a' : '#ffa07a',
            stroke: '#2d3a4a',
            strokeThickness: px(6),
          }
        )
        .setOrigin(0.5);
      poser(verdict, 5);
      return;
    }

    if (!isNewRecord) {
      const line = this.add
        .text(w / 2, 0, `Record : ${getBestScore(this.mode)}`, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(30),
          color: '#fff3e0',
        })
        .setOrigin(0.5);
      poser(line, 5);
      return;
    }

    const record = this.add
      .text(w / 2, 0, `★ ${RECORD} ★\nNouveau record`, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(40),
        fontStyle: '700',
        color: '#ffe066',
        align: 'center',
        stroke: '#1d2731',
        strokeThickness: px(6),
      })
      .setOrigin(0.5);
    const yRecord = poser(record, 5);
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
      .particles(w / 2, yRecord, TEX_JUICE, {
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
        confetti.emitParticleAt(w / 2, yRecord, 40);
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

  /**
   * Les boutons du bas, empilés DEPUIS LE BAS DE L'ÉCRAN.
   *
   * LE DÉFAUT QU'ON CORRIGE. Chaque bouton était posé à une fraction fixe de la
   * hauteur : « Rejouer » à 0,76, « Menu » à 0,93, l'invitation au classement à
   * 0,655. Tant que l'invitation n'apparaissait pas, ça tenait. Mais elle ne
   * s'affiche que pour un joueur sans pseudo qui vient de faire un score digne
   * du classement — et dans ce cas elle se posait PAR-DESSUS « Rejouer »
   * (chevauchement de 46 px sur un écran de 800), et son texte par-dessus la
   * ligne de statistiques. Le Défi du jour, qui ajoute « Partager », entassait
   * quatre éléments dans la même zone.
   *
   * Des positions fixes ne peuvent pas s'adapter à un contenu variable. Une
   * pile, si : chaque élément réserve sa hauteur et pousse le suivant. Ajouter
   * un bouton demain ne pourra plus rien écraser.
   */
  private createButtons(): number {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;
    const defi = this.mode === 'daily';

    // L'invitation n'a de sens que si ce score-là mérite de monter : après une
    // partie qui ne bat pas son propre record, proposer de s'inscrire pour rien
    // serait trompeur.
    const invite = pseudo() === null && doitDeposer(this.mode, this.nouveauRecord);

    const MARGE_BAS = px(30);
    const ESPACE = px(14);
    const hMenu = px(70);
    const hRejouer = px(78);
    const hPartager = px(70);
    const hInvite = px(66);
    const hTexte = px(26) * 1.6;

    let bas = h - MARGE_BAS;
    /** Réserve une hauteur au-dessus de ce qui est déjà posé, rend son centre. */
    const empiler = (hauteur: number): number => {
      const centre = bas - hauteur / 2;
      bas -= hauteur + ESPACE;
      return centre;
    };

    const lRejouer = px(264);
    const lPartager = px(236);
    const lMenu = px(224);

    let yRejouer: number;
    let yMenu: number;
    let yPartager = 0;
    let xRejouer = w / 2;
    let xMenu = w / 2;
    let xPartager = w / 2;

    if (portrait) {
      yMenu = empiler(hMenu);
      yRejouer = empiler(hRejouer);
      if (defi) {
        yPartager = empiler(hPartager);
      }
    } else {
      // Paysage : les boutons tiennent sur une seule rangée, l'écran manquant
      // de hauteur. C'est donc une seule case dans la pile.
      yRejouer = empiler(Math.max(hMenu, hRejouer, defi ? hPartager : 0));
      yMenu = yRejouer;
      yPartager = yRejouer;

      // LA RANGÉE SE CALCULE À PARTIR DES LARGEURS RÉELLES, pas d'un écartement
      // choisi à la main. L'ancienne version écartait de 210 px et supposait
      // que ça suffisait : avec « Partager » au milieu, « Rejouer » mordait de
      // 40 px dessus et « Partager » de 20 px sur « Menu ». Le même défaut que
      // sur l'axe vertical, et la même correction — c'est le contenu qui décide
      // de la place, pas l'inverse.
      const GOUTTIERE = px(18);
      const largeurs = defi ? [lRejouer, lPartager, lMenu] : [lRejouer, lMenu];
      const total =
        largeurs.reduce((a, b) => a + b, 0) + GOUTTIERE * (largeurs.length - 1);
      let bord = w / 2 - total / 2;
      const placer = (largeur: number): number => {
        const centre = bord + largeur / 2;
        bord += largeur + GOUTTIERE;
        return centre;
      };
      xRejouer = placer(lRejouer);
      if (defi) {
        xPartager = placer(lPartager);
      }
      xMenu = placer(lMenu);
    }

    const yInvite = invite ? empiler(hInvite) : 0;
    const yTexte = invite ? empiler(hTexte) : 0;

    // APPEL À L'ACTION QUAND LE SCORE NE COMPTE PAS ENCORE.
    //
    // C'était le trou : un joueur venait de faire un score, il n'apparaissait
    // nulle part, et RIEN ne lui disait pourquoi. Il fallait deviner qu'un
    // bouton du menu menait à un écran où un lien en bas de page ouvrait une
    // saisie. Personne ne devine ça.
    //
    // Le message le dit au moment où ça l'intéresse — il a un score sous les
    // yeux — et le bouton l'emmène droit à la saisie. Son score est déjà mis
    // de côté (cf. retenirResultat) : il partira sans qu'il ait à rejouer.
    if (invite) {
      const texte = this.add
        .text(w / 2, yTexte, 'Ton score n’est pas encore au classement', {
          fontFamily: GAME_FONT,
          fontSize: fontPx(26),
          color: '#ffd9a0',
          align: 'center',
        })
        .setOrigin(0.5);
      this.reveal(texte, 7);
      this.makeButton(
        w / 2,
        yInvite,
        px(340),
        hInvite,
        '🏆  Entrer au classement',
        0x2f8f5b,
        8,
        () => {
          sfx.click();
          fadeToScene(this, 'ClassementScene', { mode: this.mode, saisir: true });
        }
      );
    }

    if (defi) {
      this.makeButton(xPartager, yPartager, lPartager, hPartager, 'Partager', 0x2f7d5b, 9, () => {
        sfx.click();
        void this.shareResult();
      });
    }

    this.makeButton(xRejouer, yRejouer, lRejouer, hRejouer, 'Rejouer', 0xe0455a, 10, () => {
      sfx.click();
      fadeToScene(this, 'GameScene', { mode: this.mode });
    });

    this.makeButton(xMenu, yMenu, lMenu, hMenu, 'Menu', 0x2d3a4a, 11, () => {
      sfx.click();
      fadeToScene(this, 'MenuScene');
    });

    // Le haut de la pile : c'est la limite que le bloc de texte ne doit pas
    // franchir.
    return bas;
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
