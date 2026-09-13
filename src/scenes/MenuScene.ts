import Phaser from 'phaser';
import { SceneGrading } from '../systems/SceneGrading';
import {
  type GameMode,
  SLICE_MIN_SPEED,
  JUICE_PARTICLE_COUNT,
  TEX_JUICE,
  DEPTH_JUICE,
  TEX_GLOW,
  GAME_FONT,
  fontPx,
  px,
} from '../utils/constants';
import { getBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, wholeTextureKey, type FruitVariety } from '../utils/fruitCatalog';
import { SliceTrail } from '../entities/SliceTrail';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { createMuteButton, createQualityButton, addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { getTodayResult, getStreak } from '../utils/dailyChallenge';

/** Un emblème-fruit tranchable qui lance un mode de jeu. */
interface ModeEmblem {
  sprite: Phaser.GameObjects.Image;
  mode: GameMode;
  radius: number;
}

/**
 * Écran titre façon Fruit Ninja : on TRANCHE un fruit (ou on le touche)
 * pour choisir son mode. Une lame suit le doigt ; couper un emblème lance
 * la partie correspondante.
 *
 * Responsive : emblèmes empilés en portrait, côte à côte en paysage.
 */
export class MenuScene extends Phaser.Scene {
  private trail!: SliceTrail;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emblems: ModeEmblem[] = [];
  private selected = false;

  // État du geste de coupe (menu mono-pointeur, pas besoin de multi-touch ici)
  private slicing = false;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private readonly line = new Phaser.Geom.Line();
  private readonly circle = new Phaser.Geom.Circle();

  constructor() {
    super('MenuScene');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w;

    this.selected = false;
    this.slicing = false;
    this.emblems = [];

    new SceneGrading(this);
    new AnimatedBackground(this, true);
    music.ensureRunning();

    const title = this.add
      .text(w / 2, h * 0.15, portrait ? "Kout\nSab'" : "Kout Sab'", {
        fontFamily: GAME_FONT,
        fontSize: fontPx(76),
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: px(10),
      })
      .setOrigin(0.5);
    title.setAlpha(0).setY(h * 0.12);
    this.tweens.add({ targets: title, alpha: 1, y: h * 0.15, duration: 500, ease: 'Cubic.easeOut' });

    this.add
      .text(w / 2, h * (portrait ? 0.26 : 0.28), 'Tranchez un fruit pour choisir !', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(34),
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    // Emblèmes : letchi = Classique, ananas = Chrono, goyavier = Défi du jour.
    // Le goyavier n'est pas choisi au hasard — « la saison des goyaviers » est
    // la référence saisonnière la plus partagée de l'île, et le défi change
    // justement tous les jours.
    const classic = FRUIT_VARIETIES.find((v) => v.key === 'litchi') ?? FRUIT_VARIETIES[0];
    const chrono = FRUIT_VARIETIES.find((v) => v.key === 'ananas_victoria') ?? FRUIT_VARIETIES[1];
    const daily = FRUIT_VARIETIES.find((v) => v.key === 'goyavier') ?? FRUIT_VARIETIES[0];

    const resultatDuJour = getTodayResult();
    const serie = getStreak();
    const sousTitreDefi = resultatDuJour
      ? `Fait · ${resultatDuJour.score} pts`
      : serie > 1
        ? `Une par jour · série ${serie}`
        : 'Une partie par jour';

    if (portrait) {
      // Portrait : le fruit à gauche, ses libellés à côté.
      //
      // Empilés avec le texte DESSOUS, les trois emblèmes ne tenaient pas :
      // à l'échelle 1,7 l'ananas mesure 755 de haut pour 512 de pas entre
      // rangées, si bien que « CLASSIQUE » tombait en plein milieu de
      // l'ananas et « CHRONO » sur le goyavier. Ce n'était pas un défaut de
      // réglage mais d'agencement : en portrait la hauteur manque, alors que
      // les 720 de largeur restaient vides de part et d'autre.
      //
      // Mettre le texte À CÔTÉ remplit cette largeur inutilisée et supprime
      // le conflit à la racine : plus rien n'occupe l'espace vertical entre
      // deux fruits. On garde au passage des emblèmes deux fois plus gros que
      // ce qu'un empilement aurait permis.
      const pas = h * 0.19;
      const premier = h * 0.4;
      this.createEmblem(w * 0.31, premier, classic, 'classic', 'CLASSIQUE', `3 vies · Record ${getBestScore('classic')}`, 1.15, 'right');
      this.createEmblem(w * 0.31, premier + pas, chrono, 'chrono', 'CHRONO', `60 s · Record ${getBestScore('chrono')}`, 1.15, 'right');
      this.createEmblem(w * 0.31, premier + pas * 2, daily, 'daily', 'DÉFI DU JOUR', sousTitreDefi, 1.15, 'right');
    } else {
      this.createEmblem(w * 0.22, h * 0.58, classic, 'classic', 'CLASSIQUE', `3 vies · Record ${getBestScore('classic')}`, 1.7, 'below');
      this.createEmblem(w * 0.5, h * 0.58, chrono, 'chrono', 'CHRONO', `60 s · Record ${getBestScore('chrono')}`, 1.7, 'below');
      this.createEmblem(w * 0.78, h * 0.58, daily, 'daily', 'DÉFI DU JOUR', sousTitreDefi, 1.7, 'below');
    }

    // Jus (feedback de coupe) + lame qui suit le doigt
    this.juiceEmitter = this.add
      .particles(0, 0, TEX_JUICE, {
        speed: { min: 100, max: 340 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        lifespan: { min: 300, max: 650 },
        gravityY: 900,
        emitting: false,
      })
      .setDepth(DEPTH_JUICE);
    this.trail = new SliceTrail(this);

    this.registerPointerEvents();
    addVignette(this);
    createMuteButton(this, w - px(52), h - px(52));
    // À gauche du bouton de son, sur la même ligne : c'est le seul écran
    // depuis lequel recharger la page ne coûte rien au joueur.
    createQualityButton(this, w - px(104), h - px(52));
    fadeIn(this);
  }

  update(): void {
    this.trail.update(this.time.now);
  }

  /**
   * Crée un emblème-fruit : gros sprite qui ondule, avec ses libellés.
   * Tranchable (swipe) ET cliquable (secours desktop/accessibilité).
   */
  private createEmblem(
    x: number,
    y: number,
    variety: FruitVariety,
    mode: GameMode,
    label: string,
    subtitle: string,
    scale: number,
    cote: 'below' | 'right'
  ): void {
    // Rayon de coupe = rayon logique du fruit mis à l'échelle
    const radius = variety.radius * scale;

    // Halo chaud qui respire derrière l'emblème → il ressort comme une cible
    const glow = this.add
      .image(x, y, TEX_GLOW)
      .setDisplaySize(radius * 2.9, radius * 2.9)
      .setAlpha(0.38)
      .setDepth(-1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      scale: glow.scale * 1.12,
      alpha: 0.6,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const sprite = this.add
      .image(x, y, wholeTextureKey(variety))
      .setScale(scale)
      .setInteractive({ useHandCursor: true });

    // Ondulation permanente pour attirer l'œil
    this.tweens.add({
      targets: sprite,
      y: y - px(12),
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // À côté, le texte part du bord droit du fruit et se cale à gauche ;
    // dessous, il reste centré sous lui. Les deux cas ne diffèrent que par
    // ces trois valeurs, le reste du traçé est commun.
    const aCote = cote === 'right';
    const tx = aCote ? x + radius + px(30) : x;
    const tyLabel = aCote ? y - px(30) : y + radius + px(16);
    const tySub = aCote ? y + px(24) : y + radius + px(68);
    const ancre = aCote ? 0 : 0.5;

    this.add
      .text(tx, tyLabel, label, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(46),
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2d3a4a',
        strokeThickness: px(6),
      })
      .setOrigin(ancre, 0);
    this.add
      .text(tx, tySub, subtitle, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(26),
        color: '#fff3e0',
      })
      .setOrigin(ancre, 0);

    // Secours : un simple appui sélectionne aussi le mode
    sprite.on('pointerup', () => this.selectMode(mode, sprite));

    this.emblems.push({ sprite, mode, radius });
  }

  private registerPointerEvents(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.slicing = true;
      this.trail.clear();
      this.lastX = pointer.x;
      this.lastY = pointer.y;
      this.lastTime = this.time.now;
      this.trail.addPoint(pointer.x, pointer.y, this.time.now);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.slicing || !pointer.isDown) {
        return;
      }
      this.handleSliceMove(pointer);
    });

    const endSlice = (): void => {
      this.slicing = false;
    };
    this.input.on('pointerup', endSlice);
    this.input.on('pointerupoutside', endSlice);
  }

  /** Teste le segment du geste (s'il est assez rapide) contre les emblèmes. */
  private handleSliceMove(pointer: Phaser.Input.Pointer): void {
    if (this.selected) {
      return;
    }
    const now = this.time.now;
    const distance = Phaser.Math.Distance.Between(this.lastX, this.lastY, pointer.x, pointer.y);
    const speed = distance / Math.max(now - this.lastTime, 1);

    this.trail.addPoint(pointer.x, pointer.y, now);

    if (speed >= SLICE_MIN_SPEED) {
      this.line.setTo(this.lastX, this.lastY, pointer.x, pointer.y);
      for (const emblem of this.emblems) {
        this.circle.setTo(emblem.sprite.x, emblem.sprite.y, emblem.radius);
        if (Phaser.Geom.Intersects.LineToCircle(this.line, this.circle)) {
          this.selectMode(emblem.mode, emblem.sprite);
          break;
        }
      }
    }

    this.lastX = pointer.x;
    this.lastY = pointer.y;
    this.lastTime = now;
  }

  /** Emblème tranché/choisi : jus, son, petit délai, puis lancement du mode. */
  private selectMode(mode: GameMode, sprite: Phaser.GameObjects.Image): void {
    if (this.selected) {
      return;
    }
    this.selected = true;

    this.juiceEmitter.setParticleTint(0xffffff);
    this.juiceEmitter.emitParticleAt(sprite.x, sprite.y, JUICE_PARTICLE_COUNT * 2);
    sfx.slice();

    // Le fruit "explose" (grossit et disparaît) avant le lancement
    this.tweens.add({
      targets: sprite,
      scale: sprite.scale * 1.4,
      alpha: 0,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
    // On laisse l'emblème finir d'exploser avant d'enchaîner le fondu
    this.time.delayedCall(240, () => fadeToScene(this, 'GameScene', { mode }));
  }
}
