import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { SliceTrail } from '../entities/SliceTrail';
import { SliceDetector } from '../systems/SliceDetector';
import { ScoreManager } from '../systems/ScoreManager';
import { SpawnManager } from '../systems/SpawnManager';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, halfTextureKeys, wholeTextureKey } from '../utils/fruitCatalog';
import { createMuteButton, addHudPanel, addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { prefersReducedMotion } from '../utils/settings';
import { PauseController } from '../systems/PauseController';
import { SceneGrading } from '../systems/SceneGrading';
import { applyShadingTint } from '../utils/surfaceShading';
import { seedRandom, clearSeed } from '../utils/rng';
import type { ScoreSnapshot } from '../systems/ScoreManager';
import { dailySeed, saveTodayResult } from '../utils/dailyChallenge';
import { exclamationCombo, FRENESIE, CYCLONE } from '../utils/creole';
import {
  FRUIT_POOL_SIZE,
  HALF_POOL_SIZE,
  HALF_LIFETIME_MS,
  SCORE_PER_FRUIT,
  SLICE_MIN_SPEED,
  STROKE_BREAK_MS,
  STROKE_MAX_MS,
  STARTING_LIVES,
  FRENZY_ZONE_TOP,
  FRENZY_ZONE_BOTTOM,
  FRENZY_ZOOM,
  FRENZY_ZOOM_MS,
  FRENZY_PAN_RATIO,
  FRENZY_HIT_PUNCH,
  COMBO_PUNCH_ZOOM,
  COMBO_PUNCH_MS,
  GAME_FONT,
  FONT_DIGITS,
  TEX_CROSS,
  HITSTOP_CRIT_MS,
  HITSTOP_COMBO_MS,
  HITSTOP_GRENADE_MS,
  HITSTOP_BOMB_MS,
  HALF_SQUASH_X,
  HALF_SQUASH_Y,
  HALF_SQUASH_MS,
  CROSS_COLOR_LIT,
  CROSS_COLOR_DIM,
  FRENZY_SETTLE_MARGIN,
  FRENZY_BOB_PX,
  FRENZY_DURATION_MS,
  FRENZY_HIT_COOLDOWN_MS,
  FRENZY_POINTS_PER_SLASH,
  FRENZY_AURA_SCALE,
  TEX_GLOW,
  TEX_RING,
  RING_POOL_SIZE,
  DEPTH_FRENZY_AURA,
  TEX_BOMB,
  TEX_JUICE,
  BOMB_POOL_SIZE,
  BOMB_GAMEOVER_DELAY_MS,
  JUICE_PARTICLE_COUNT,
  TEX_SPLAT_PREFIX,
  SPLAT_VARIANTS,
  SPLAT_POOL_SIZE,
  SPLAT_FADE_MS,
  DEPTH_SPLAT,
  DEPTH_HALF,
  DEPTH_JUICE,
  DEPTH_DARKEN,
  GAME_DARKEN_COLOR,
  GAME_DARKEN_ALPHA,
  CHRONO_DURATION_MS,
  POPUP_POOL_SIZE,
  BONUS_X2_FACTOR,
  BONUS_X2_DURATION_MS,
  BOMB_ZOOM,
  BOMB_ZOOM_MS,
  BOMB_PHYSICS_SLOWMO,
  FUSE_SPARK_TINT,
  FUSE_SPARK_EVERY,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GESTURE_COMBO_MIN,
  GESTURE_BANNER_MIN,
  GESTURE_HUGE_MIN,
  GESTURE_COMBO_BONUS,
  CYCLONE_AURA_SCALE,
  CYCLONE_AURA_ALPHA_MIN,
  CYCLONE_AURA_ALPHA_MAX,
  CYCLONE_DURATION_MS,
  CYCLONE_POINTS,
  REWARD_STAGGER_MS,
  REWARD_SPREAD_PX,
  COLOR_POINTS,
  COLOR_CRIT,
  COLOR_COMBO,
  COLOR_CYCLONE,
  COLOR_BONUS,
  type GameMode,
  type GameOverReason,
  CROSS_SIZE_LIT,
  CROSS_SIZE_DIM,
  fontPx,
  px,
  SLICE_FLASH_POOL_SIZE,
  SCREEN_BLEED,
  SLICE_FLASH_MS,
} from '../utils/constants';

/**
 * Avancement d'une partie, transporté à travers une rotation d'écran.
 * Cf. utils/relayout.ts pour le pourquoi.
 */
interface RunSnapshot {
  score: ScoreSnapshot;
  fruitsSliced: number;
  bestGestureCombo: number;
  /** Temps écoulé depuis le début : c'est lui qui porte la difficulté. */
  elapsedMs: number;
  /** Temps restant au chrono, en mode Chrono uniquement. */
  chronoRemainingMs: number;
}

/** Données passées par le menu au lancement d'une partie. */
interface GameSceneData {
  mode?: GameMode;
  /** Présent seulement lors d'une reconstruction après rotation. */
  resume?: RunSnapshot;
}

/**
 * État d'un geste de coupe en cours. Multi-touch : chaque doigt posé
 * occupe un slot (pré-alloué) avec sa propre traînée et son historique.
 */
interface SliceGesture {
  /** id du pointeur Phaser qui occupe ce slot, null si libre. */
  pointerId: number | null;
  trail: SliceTrail;
  lastX: number;
  lastY: number;
  lastTime: number;
  /** Nombre de fruits tranchés dans le COUP DE SABRE en cours. */
  comboCount: number;
  /** Vrai entre le début et la fin d'un coup de sabre. */
  strokeActive: boolean;
  /** Instant du début du coup de sabre courant. */
  strokeStart: number;
  /** Dernier instant où le doigt allait assez vite pour trancher. */
  lastFastTime: number;
}

/** Nombre de gestes simultanés gérés (2 doigts + souris, cf. activePointers). */
const MAX_GESTURES = 3;

/**
 * Scène de jeu principale : boucle spawn → swipe → coupe → score.
 *
 * Deux modes :
 * - Classique : 3 vies, un fruit manqué coûte une vie.
 * - Chrono : 60 secondes, les fruits manqués sont ignorés.
 * Dans les deux modes, trancher une bombe termine immédiatement la partie.
 * Le combava doré active un score x2 temporaire (bannière sous le score).
 */
export class GameScene extends Phaser.Scene {
  private mode: GameMode = 'classic';

  private fruits!: Phaser.Physics.Arcade.Group;
  private halves!: Phaser.Physics.Arcade.Group;
  private bombs!: Phaser.Physics.Arcade.Group;
  private sliceDetector!: SliceDetector;
  private scoreManager!: ScoreManager;
  private spawnManager!: SpawnManager;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fuseEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly fuseTip = new Phaser.Math.Vector2(); // réutilisé (pas d'alloc/frame)
  private frameCount = 0;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private infoText!: Phaser.GameObjects.Text; // compte à rebours (mode Chrono uniquement)
  /** Halo doré collé à la grenade tant qu'elle est en scène. */
  private frenzyAura!: Phaser.GameObjects.Image;
  /** Compteur de coups affiché au-dessus de la grenade. */
  private frenzyCounter!: Phaser.GameObjects.Text;
  /** Grenade suivie par le halo (null quand il n'y en a pas). */
  private frenzyGrenade: Fruit | null = null;
  /** Pool d'ondes de choc (effets de la grenade). */
  private rings!: Phaser.GameObjects.Group;
  private lifeCrosses: Phaser.GameObjects.Image[] = []; // strikes peints (mode Classique)
  private livesLabel?: Phaser.GameObjects.Text; // « 3 / 3 » sous les croix
  /** Nombre du score, en chiffres bitmap (aucune texture reconstruite). */
  private scoreValue!: Phaser.GameObjects.BitmapText;
  /** Valeur actuellement affichée — évite de réécrire le texte pour rien. */
  private displayedScore = 0;
  /** Cible du tween de défilement du score. */
  private readonly scoreCounter = { value: 0 };
  /** Nb de croix allumées au dernier rendu — sert à repérer celle qui change. */
  private filledCrosses = 0;
  /** Vrai pendant un hit-stop : empêche d'empiler les gels. */
  private hitStopActive = false;
  /** Éléments du HUD, estompés pendant la frénésie (cf. setHudDimmed). */
  private hudElements: Array<Phaser.GameObjects.GameObject & { alpha: number }> = [];
  private multiplierBanner!: Phaser.GameObjects.Text;
  private multiplierTimer: Phaser.Time.TimerEvent | null = null;
  private popupPool: Phaser.GameObjects.Text[] = [];
  private splatPool: Phaser.GameObjects.Image[] = [];
  private flashPool: Phaser.GameObjects.Image[] = [];
  private nextFlashIndex = 0;
  private nextSplatIndex = 0;

  // Statistiques de la partie (affichées sur l'écran de fin — Étape 4)
  private fruitsSliced = 0;
  private bestGestureCombo = 0;

  // État de la partie — la même instance de scène est réutilisée à chaque
  // restart, donc TOUT l'état mutable doit être réinitialisé dans init().
  private gameEnded = false;
  private pause!: PauseController;
  /** Retour de zoom en attente après un coup de caméra (cf. cameraPunch). */
  private punchReturn: Phaser.Time.TimerEvent | null = null;
  /** Vrai entre enterFrenzyZoom et exitFrenzyZoom, et seulement là. */
  private frenzyZoomed = false;
  /** Mémoire de l'état précédent, pour détecter la FIN du déluge. */
  private delugeEnCours = false;
  /** Papaye cyclone en vol, pour lui coller son halo (null sinon). */
  private cyclonePapaye: Fruit | null = null;
  private cycloneAura!: Phaser.GameObjects.Image;
  /** Fruits tranchés depuis le début du déluge en cours : alimente le compteur. */
  private delugeFruits = 0;
  private grading!: SceneGrading;
  private chronoEndTime = 0;
  /** Avancement à restaurer après une rotation d'écran, sinon null. */
  private resume: RunSnapshot | null = null;
  /** Instant du début de la partie, reporté en arrière après une rotation. */
  private startedAt = 0;
  private lastShownSecond = -1;

  // Gestes de coupe en cours, un slot par doigt (recréés dans create())
  private gestures: SliceGesture[] = [];

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode ?? 'classic';
    this.resume = data.resume ?? null;
    this.startedAt = 0;

    // Le Défi du jour sème la source de hasard avec la date : tout le monde
    // reçoit la même séquence de fruits. Les autres modes la relâchent, sinon
    // une partie libre lancée après un défi rejouerait ce même défi.
    if (this.mode === 'daily') {
      seedRandom(dailySeed());
    } else {
      clearSeed();
    }
    this.gameEnded = false;
    this.delugeEnCours = false;
    this.lastShownSecond = -1;
    this.multiplierTimer = null;
    this.fruitsSliced = data.resume?.fruitsSliced ?? 0;
    this.bestGestureCombo = data.resume?.bestGestureCombo ?? 0;
    this.frameCount = 0;
    // La scène est réutilisée au restart : on repart d'un tableau vide pour
    // ne pas garder de références aux croix (détruites) de la partie passée.
    this.lifeCrosses = [];
  }

  create(): void {
    // Normalise le temps au cas où un ralenti de bombe ou un hit-stop
    // traînerait d'une partie précédente (le reset au shutdown planterait :
    // world null, et le minuteur de reprise du gel meurt avec la scène).
    this.physics.world.timeScale = 1;
    this.physics.resume();
    this.tweens.timeScale = 1;
    this.hitStopActive = false;

    // L'étalonnage d'abord : il s'installe sur la caméra, pas sur la scène,
    // donc l'ordre de création des objets ne le concerne pas.
    this.grading = new SceneGrading(this);

    // Bornes du monde : la caméra ne peut plus montrer ce qui n'existe pas.
    //
    // Le recadrage de la frénésie suit la grenade à mi-chemin, et la grenade
    // entre par un BORD de l'écran. À un zoom de 1,22 la demi-largeur visible
    // vaut 0,41 W ; visée à 0,25 W, la caméra débordait donc de 0,16 W à
    // gauche du décor — on voyait le vide.
    //
    // Phaser borne lui-même le défilement à chaque image, et il tient compte
    // du zoom courant : c'est plus sûr que de calculer la cible à l'avance,
    // puisque le zoom et le recadrage sont deux tweens indépendants qui ne
    // finissent pas ensemble.
    this.cameras.main.setBounds(0, 0, this.scale.width, this.scale.height);

    new AnimatedBackground(this);
    // Voile sombre : atténue le décor pendant la partie pour que les fruits
    // ressortent. Au-dessus du fond animé (depths négatifs), sous les taches.
    this.add
      .rectangle(
        -SCREEN_BLEED,
        -SCREEN_BLEED,
        this.scale.width + SCREEN_BLEED * 2,
        this.scale.height + SCREEN_BLEED * 2,
        GAME_DARKEN_COLOR,
        GAME_DARKEN_ALPHA
      )
      .setOrigin(0)
      .setDepth(DEPTH_DARKEN);
    music.ensureRunning();

    // Pools de sprites : fruits, moitiés et bombes sont recyclés, jamais
    // détruits, pour éviter les allocations/GC en partie (60 FPS mobile).
    this.fruits = this.physics.add.group({
      classType: Fruit,
      defaultKey: wholeTextureKey(FRUIT_VARIETIES[0]),
      maxSize: FRUIT_POOL_SIZE,
    });
    this.halves = this.physics.add.group({
      defaultKey: halfTextureKeys(FRUIT_VARIETIES[0]).left,
      maxSize: HALF_POOL_SIZE,
    });
    this.bombs = this.physics.add.group({
      classType: Bomb,
      defaultKey: TEX_BOMB,
      maxSize: BOMB_POOL_SIZE,
    });

    this.scoreManager = new ScoreManager(this);
    this.sliceDetector = new SliceDetector();
    this.spawnManager = new SpawnManager(
      this,
      this.fruits,
      this.bombs,
      this.scoreManager,
      this.mode,
      () => this.fruitsSliced
    );

    // Slots de gestes multi-touch : traînées et états pré-alloués,
    // aucune allocation quand un doigt se pose en pleine partie.
    this.gestures = [];
    for (let i = 0; i < MAX_GESTURES; i++) {
      this.gestures.push({
        pointerId: null,
        trail: new SliceTrail(this),
        lastX: 0,
        lastY: 0,
        lastTime: 0,
        comboCount: 0,
        strokeActive: false,
        strokeStart: 0,
        lastFastTime: 0,
      });
    }

    // Émetteur de jus : un seul émetteur réutilisé, teinté par fruit à l'émission
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

    // Étincelles de mèche : petites particules vives émises au bout de la mèche
    // des bombes en vol (crépitement). Réutilise la texture de jus, teinte orange.
    this.fuseEmitter = this.add
      .particles(0, 0, TEX_JUICE, {
        speed: { min: 20, max: 90 },
        angle: { min: 200, max: 340 }, // vers le haut, gerbe étroite
        scale: { start: 0.5, end: 0 },
        lifespan: { min: 150, max: 320 },
        tint: FUSE_SPARK_TINT,
        gravityY: 300,
        emitting: false,
      })
      .setDepth(DEPTH_JUICE);

    // Flash blanc plein écran (bombe) — créé une fois, réactivé au besoin
    this.flashRect = this.add
      .rectangle(
        -SCREEN_BLEED,
        -SCREEN_BLEED,
        this.scale.width + SCREEN_BLEED * 2,
        this.scale.height + SCREEN_BLEED * 2,
        0xffffff,
        1
      )
      .setOrigin(0)
      .setDepth(200)
      .setVisible(false)
      .setAlpha(0);

    addVignette(this);
    this.createUi();
    this.createPopupPool();
    this.createSplatPool();
    this.createSliceFlashPool();
    this.createFrenzyEffects();
    this.registerGameEvents();
    this.registerPointerEvents();

    if (this.mode === 'chrono') {
      this.chronoEndTime = this.time.now + CHRONO_DURATION_MS;
    }

    this.startedAt = this.time.now;
    this.spawnManager.start();
    this.restoreRun();
    fadeIn(this);
  }

  update(): void {
    if (this.pause?.isPaused) {
      return;
    }
    for (const gesture of this.gestures) {
      gesture.trail.update(this.time.now);
    }
    this.closeStaleStrokes();
    this.updateFuseSparks();
    this.updateDeluge();
    this.updateHalvesShading();
    this.updateFrenzyAura();
    this.updateCycloneAura();
    if (this.mode === 'chrono' && !this.gameEnded) {
      this.updateChrono();
    }
  }

  /**
   * Photographie l'avancement avant une reconstruction pour rotation d'écran.
   *
   * Renvoie `undefined` si la partie est finie : il n'y a plus rien à sauver,
   * et la scène peut repartir de ses données d'origine.
   */
  captureState(): object | undefined {
    if (this.gameEnded) {
      return { mode: this.mode };
    }
    return {
      mode: this.mode,
      resume: {
        score: this.scoreManager.snapshot(),
        fruitsSliced: this.fruitsSliced,
        bestGestureCombo: this.bestGestureCombo,
        elapsedMs: this.time.now - this.startedAt,
        chronoRemainingMs: this.mode === 'chrono' ? Math.max(0, this.chronoEndTime - this.time.now) : 0,
      },
    };
  }

  /**
   * Reprend la partie là où la rotation l'a interrompue.
   *
   * La PAUSE est posée dans la foulée, et c'est délibéré : le joueur vient de
   * tourner son téléphone, il ne regarde pas l'écran, et les fruits en vol ont
   * disparu avec l'ancienne forme du monde. Le relancer aussitôt au milieu
   * d'une salve serait lui reprendre d'une main ce qu'on lui rend de l'autre.
   */
  private restoreRun(): void {
    const etat = this.resume;
    if (etat === null) {
      return;
    }
    this.scoreManager.restore(etat.score);
    this.startedAt = this.time.now - etat.elapsedMs;
    this.spawnManager.resumeFrom(etat.elapsedMs, etat.fruitsSliced);
    if (this.mode === 'chrono') {
      this.chronoEndTime = this.time.now + etat.chronoRemainingMs;
      this.updateChrono();
    }

    this.settleHud(etat.score.score);
    this.pause.setPaused(true);
  }

  /**
   * Pose le HUD dans son état d'arrivée, sans jouer les animations.
   *
   * Tout ce qui s'affiche ici est normalement ANIMÉ : le score monte par un
   * tween, les croix de vie arrivent en grand et se posent, le chrono ne se
   * rafraîchit que dans update(). Or la reprise après rotation met aussitôt le
   * jeu en pause, ce qui fige tweens et update() au milieu du geste.
   *
   * Sans ce réglage d'autorité, le joueur retrouvait un score à 0, un chrono à
   * 60 s et des croix à moitié dessinées — le pire des deux mondes, puisque la
   * partie était bien conservée mais que rien de ce qu'il VOYAIT ne le disait.
   */
  private settleHud(score: number): void {
    this.tweens.killTweensOf(this.scoreCounter);
    this.tweens.killTweensOf(this.scoreValue);
    this.scoreCounter.value = score;
    this.displayedScore = score;
    this.scoreValue.setText(String(score)).setScale(1);

    for (const croix of this.lifeCrosses) {
      this.tweens.killTweensOf(croix);
      croix.setAngle(0);
    }
    // setDisplaySize rétablit l'échelle de repos, la teinte et l'opacité.
    this.syncLifeCrossStyles();
  }

  /**
   * Rend l'étalonnage normal à la fin du déluge.
   *
   * L'image reste chaude tant que les fruits pleuvent — c'est le même signal
   * périphérique que pendant la frénésie, et il dit la même chose : profite.
   */
  private updateDeluge(): void {
    if (this.delugeEnCours && !this.spawnManager.isDeluge()) {
      this.grading.setMode(this.filledCrosses >= STARTING_LIVES - 1 ? 'danger' : 'normal');
      // Bilan du déluge. Un moment fort a besoin d'une fin, sinon il s'éteint
      // sans qu'on sache ce qu'il a rapporté — et le joueur n'a aucun repère
      // pour faire mieux la fois suivante.
      if (this.delugeFruits > 0 && !this.gameEnded) {
        this.showRewardBurst(this.scale.width / 2, this.scale.height * 0.58, [
          { texte: `${this.delugeFruits} FRUITS`, couleur: COLOR_CYCLONE, taille: px(48) },
        ]);
      }
      this.delugeFruits = 0;
    }
    this.delugeEnCours = this.spawnManager.isDeluge();
  }

  /**
   * Rend leur galbe aux moitiés coupées.
   *
   * Elles sont peintes sous pleine lumière comme les fruits entiers — même
   * texture, même surface en cache — et reçoivent donc le même éclairage par
   * la teinte. Sans cela elles sortiraient plates et surexposées, ce qui se
   * verrait d'autant plus qu'elles apparaissent à l'endroit exact où le fruit
   * correctement éclairé vient de disparaître.
   *
   * Elles tournent vite (jusqu'à 300°/s) : le recalcul par image est donc
   * nécessaire, et il coûte quatre évaluations d'une rampe affine.
   *
   * Pas de calque de reflet sur elles, en revanche : il déborderait sur la
   * face de coupe, qui n'est pas une surface de peau.
   */
  private updateHalvesShading(): void {
    for (const objet of this.halves.getChildren()) {
      const moitie = objet as Phaser.Physics.Arcade.Sprite & { sliceRadius?: number };
      if (!moitie.active || !moitie.visible) {
        continue;
      }
      applyShadingTint(moitie, moitie.sliceRadius ?? moitie.displayWidth / 3);
    }
  }

  /**
   * Prépare les effets réservés à la grenade : le halo (un seul sprite
   * repositionné) et le pool d'ondes de choc. Tout est créé une fois ici pour
   * qu'aucune allocation n'ait lieu au moment de l'action.
   */
  private createFrenzyEffects(): void {
    this.frenzyGrenade = null;
    this.frenzyAura = this.add
      .image(0, 0, TEX_GLOW)
      .setVisible(false)
      .setDepth(DEPTH_FRENZY_AURA)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Halo DISTINCT pour la papaye cyclone, et non le même réutilisé. Les deux
    // fruits spéciaux ne peuvent pas se croiser (le SpawnManager les espace),
    // mais partager le sprite couplerait leurs cycles de vie : ranger le halo
    // du cyclone appellerait hideFrenzyVisuals(), donc un dézoom de caméra qui
    // n'a rien à faire là. Un sprite de plus coûte moins qu'un couplage.
    this.cyclonePapaye = null;
    this.cycloneAura = this.add
      .image(0, 0, TEX_GLOW)
      .setVisible(false)
      .setDepth(DEPTH_FRENZY_AURA)
      .setTint(0xff9a4a) // teinte chaude : le cyclone n'est pas la grenade
      .setBlendMode(Phaser.BlendModes.ADD);

    // Compteur UNIQUE qui suit la grenade : un popup par coup s'empilait en
    // un tas illisible, puisque la grenade est presque immobile en frénésie.
    this.frenzyCounter = this.add
      .text(0, 0, '', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(64),
        fontStyle: 'bold',
        color: '#ffd166',
        stroke: '#7a1020',
        strokeThickness: px(8),
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);

    this.rings = this.add.group({
      classType: Phaser.GameObjects.Image,
      defaultKey: TEX_RING,
      maxSize: RING_POOL_SIZE,
    });
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const ring = this.rings.create(0, 0, TEX_RING) as Phaser.GameObjects.Image;
      ring.setActive(false).setVisible(false);
    }
  }

  /**
   * Colle le halo doré sur la grenade tant qu'elle est en scène. Un seul
   * sprite réutilisé, repositionné chaque frame : aucune allocation.
   */
  private updateFrenzyAura(): void {
    const grenade = this.frenzyGrenade;
    // `isFrenzy` en plus de `active` : les fruits viennent d'un POOL, et une
    // grenade rendue au pool peut être relancée en fruit ordinaire dès la
    // salve suivante. Elle redeviendrait alors active, et cette condition la
    // croirait encore en scène — halo collé sur un fruit banal, et surtout
    // aucune sortie de frénésie. Le test dit maintenant ce qu'il veut dire :
    // l'objet suivi est-il toujours LA grenade ?
    if (grenade === null || !grenade.active || !grenade.isFrenzy) {
      if (this.frenzyAura.visible || this.frenzyZoomed) {
        this.hideFrenzyVisuals();
      }
      return;
    }
    // Filet de sécurité indépendant des animations : une grenade en frénésie
    // ne peut JAMAIS sortir de l'écran, quoi qu'il arrive à ses tweens. C'est
    // la garantie que le combo reste toujours terminable — le bug d'origine
    // était une grenade qui dérivait hors champ, spawn gelé, combo perdu.
    if (grenade.frenzyActive) {
      const marge = grenade.sliceRadius + FRENZY_SETTLE_MARGIN;
      const x = Phaser.Math.Clamp(grenade.x, marge, this.scale.width - marge);
      const y = Phaser.Math.Clamp(grenade.y, marge, this.scale.height - marge);
      if (x !== grenade.x || y !== grenade.y) {
        grenade.setPosition(x, y);
      }
    }
    this.frenzyAura.setPosition(grenade.x, grenade.y);
    this.frenzyCounter.setPosition(grenade.x, grenade.y - grenade.sliceRadius - px(14));
  }

  /**
   * Colle le halo chaud sur la papaye cyclone tant qu'elle traverse l'écran.
   *
   * Même précaution que pour la grenade : on vérifie `isCyclone` en plus de
   * `active`, parce que le fruit vient d'un POOL et qu'une papaye rendue au
   * pool peut ressortir en letchi à la salve suivante. Sans ce test, le halo
   * resterait collé sur un fruit parfaitement ordinaire.
   *
   * Aucun recadrage ici, à la différence de la grenade : le cyclone n'est PAS
   * censé rester à l'écran. Il traverse, et le manquer est un vrai choix du
   * joueur — c'est ce qui lui donne sa valeur.
   */
  private updateCycloneAura(): void {
    const papaye = this.cyclonePapaye;
    if (papaye === null || !papaye.active || !papaye.isCyclone) {
      if (this.cycloneAura.visible) {
        this.hideCycloneAura();
      }
      return;
    }
    this.cycloneAura.setPosition(papaye.x, papaye.y);
  }

  /** Range le halo du cyclone (fruit tranché, manqué, ou fin de partie). */
  private hideCycloneAura(): void {
    this.tweens.killTweensOf(this.cycloneAura);
    this.cycloneAura.setVisible(false);
    this.cyclonePapaye = null;
  }

  /**
   * La papaye cyclone entre en scène. Pas de bandeau ici, volontairement :
   * dans la référence, la banane de frénésie ne s'annonce pas — elle passe,
   * et c'est au joueur de la voir. Annoncer la récompense avant qu'elle ne
   * soit méritée lui retirerait tout son sel.
   *
   * Il reste trois signaux, et ils suffisent : une silhouette qu'on ne voit
   * jamais autrement, une entrée par le côté, et un halo qui la suit.
   */
  private onCycloneIncoming(papaye: Fruit): void {
    if (this.gameEnded) {
      return;
    }
    this.cyclonePapaye = papaye;
    this.cycloneAura
      .setPosition(papaye.x, papaye.y)
      .setDisplaySize(papaye.sliceRadius * CYCLONE_AURA_SCALE, papaye.sliceRadius * CYCLONE_AURA_SCALE)
      .setVisible(true)
      .setAlpha(CYCLONE_AURA_ALPHA_MIN);
    this.tweens.killTweensOf(this.cycloneAura);
    this.tweens.add({
      targets: this.cycloneAura,
      alpha: CYCLONE_AURA_ALPHA_MAX,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.spawnRing(papaye.x, papaye.y, 4, 0xff9a4a, 620);
  }

  /**
   * La papaye cyclone est tranchée : le déluge commence SUR-LE-CHAMP.
   *
   * C'est la demande de Kevin, et c'est le modèle de Fruit Ninja : la frénésie
   * ne se gagne pas au bout d'un mini-jeu, elle se cueille d'un coup de sabre.
   * Elle vit donc à côté de la grenade sans faire double emploi — la grenade
   * récompense l'endurance, le cyclone récompense l'œil.
   *
   * Les bombes en vol sont désamorcées comme pour la grenade : on va demander
   * au joueur de balayer l'écran entier pendant six secondes, il ne peut pas
   * viser en même temps.
   */
  private startCyclone(papaye: Fruit): void {
    this.delugeFruits = 0;
    this.defuseBombs();
    this.hideCycloneAura();
    this.spawnManager.startDeluge(CYCLONE_DURATION_MS);
    this.grading.setMode('frenzy');

    const gagne = this.scoreManager.addScore(CYCLONE_POINTS);
    this.showBigBanner(`${CYCLONE}\n+${gagne}`, 1.15);

    // Double onde chaude, secousse, gel bref : le vocabulaire du gros moment.
    this.spawnRing(papaye.x, papaye.y, 7, 0xffd166, 420);
    this.spawnRing(papaye.x, papaye.y, 14, 0xff7b3a, 820);
    this.juiceEmitter.setParticleTint(papaye.juiceColor);
    this.juiceEmitter.emitParticleAt(papaye.x, papaye.y, JUICE_PARTICLE_COUNT * 4);
    this.shakeCamera(240, 0.006);
    this.hitStop(HITSTOP_GRENADE_MS);
    this.cameraPunch(COMBO_PUNCH_ZOOM * 1.4, COMBO_PUNCH_MS);
    sfx.bonus();
  }

  /**
   * Désamorce les bombes encore en vol à l'entrée du fruit spécial.
   *
   * POURQUOI LES RETIRER plutôt que de les laisser. Pendant la frénésie, le
   * joueur frappe en rafale un point fixe de l'écran : une bombe qui dérive
   * dans cette zone est une fin de partie immédiate contre laquelle il n'a
   * aucun recours, au moment précis où le jeu lui demande de ne plus viser.
   * C'est aussi ce que fait la référence : pendant la Frenzy de Fruit Ninja,
   * aucune bombe n'apparaît.
   *
   * Elles ne disparaissent pas d'un coup : la mèche s'éteint dans une gerbe
   * d'étincelles et la bombe s'efface. Escamotée sans rien, elle passerait
   * pour un défaut d'affichage.
   */
  private defuseBombs(): void {
    for (const objet of this.bombs.getChildren()) {
      const bombe = objet as Bomb;
      if (!bombe.active) {
        continue;
      }
      this.fuseEmitter.emitParticleAt(bombe.x, bombe.y, 10);
      this.tweens.add({
        targets: bombe,
        alpha: 0,
        scale: 0.6,
        duration: 220,
        ease: 'Quad.easeIn',
        onComplete: () => bombe.kill(),
      });
    }
  }

  /** Range halo et compteur (fin de frénésie, grenade manquée, fin de partie). */
  private hideFrenzyVisuals(): void {
    this.tweens.killTweensOf(this.frenzyAura);
    this.tweens.killTweensOf(this.frenzyCounter);
    this.frenzyAura.setVisible(false);
    this.frenzyCounter.setVisible(false);
    this.frenzyGrenade = null;
    // Surtout pas de dézoom si la partie s'achève : le drame de la bombe a
    // son propre zoom, qu'on écraserait.
    if (!this.gameEnded) {
      this.exitFrenzyZoom();
    }
  }

  /**
   * Onde de choc circulaire à un point donné : le vocabulaire visuel réservé
   * à la grenade. Recyclée depuis un pool ; si le pool est vide on saute
   * l'effet plutôt que d'allouer en pleine partie.
   */
  private spawnRing(x: number, y: number, toScale: number, tint: number, durationMs: number): void {
    const ring = this.rings.get(x, y) as Phaser.GameObjects.Image | null;
    if (ring === null) {
      return;
    }
    ring
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setScale(0.15)
      .setAlpha(0.6)
      .setTint(tint)
      .setDepth(DEPTH_JUICE)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      scale: toScale,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        ring.setActive(false).setVisible(false);
      },
    });
  }

  /**
   * La grenade entre en scène : bandeau, halo qui la suit, onde de choc et
   * pulsation. C'est cette mise en scène — plus que le fruit lui-même — qui
   * dit au joueur « celui-ci n'est pas comme les autres ».
   */
  private onFrenzyIncoming(grenade: Fruit): void {
    if (this.gameEnded) {
      return;
    }
    this.frenzyGrenade = grenade;
    this.defuseBombs();
    this.frenzyAura
      .setPosition(grenade.x, grenade.y)
      .setDisplaySize(grenade.sliceRadius * FRENZY_AURA_SCALE, grenade.sliceRadius * FRENZY_AURA_SCALE)
      .setVisible(true)
      // Fusion additive : au-delà de ~0,3 le halo sature en blanc et efface
      // la grenade elle-même, ce qui est exactement l'inverse du but.
      .setAlpha(0.22);
    // Le halo respire tant que la grenade est là (tween relancé à chaque
    // apparition : une seule grenade à la fois, donc pas d'empilement)
    this.tweens.killTweensOf(this.frenzyAura);
    this.tweens.add({
      targets: this.frenzyAura,
      alpha: 0.44,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.spawnRing(grenade.x, grenade.y, 4.5, 0xffd166, 700);
    this.showBigBanner('GRENADE !');
    sfx.crit();
  }

  /** Fait crépiter la mèche de chaque bombe en vol (étincelles à son bout). */
  private updateFuseSparks(): void {
    this.frameCount++;
    if (this.gameEnded || this.frameCount % FUSE_SPARK_EVERY !== 0) {
      return;
    }
    const bombs = this.bombs.getChildren();
    for (let i = 0; i < bombs.length; i++) {
      const bomb = bombs[i] as Bomb;
      if (!bomb.active) {
        continue;
      }
      bomb.fuseTip(this.fuseTip);
      this.fuseEmitter.emitParticleAt(this.fuseTip.x, this.fuseTip.y, 1);
    }
  }

  private updateChrono(): void {
    const remainingMs = this.chronoEndTime - this.time.now;
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    // setText coûte cher : on ne met à jour qu'au changement de seconde
    if (seconds !== this.lastShownSecond) {
      this.lastShownSecond = seconds;
      this.infoText.setText(`${seconds} s`);
      if (seconds <= 5 && seconds > 0) {
        this.infoText.setColor('#ff5252'); // urgence visuelle en fin de chrono
      }
    }
    if (remainingMs <= 0) {
      this.gameEnded = true;
      this.spawnManager.stop();
      this.endGame('time');
    }
  }

  private createUi(): void {
    // Le HUD est collecté au fur et à mesure : il est collé aux bords, donc
    // le moindre zoom caméra le rogne. On l'estompe pendant la frénésie
    // (cf. setHudDimmed) — un HUD à moitié coupé passerait pour un défaut.
    this.hudElements = [];

    // Cartouche + score. Le libellé « SCORE » est un texte figé (donc gratuit),
    // le nombre est un BitmapText : il change à chaque fruit tranché et un
    // objet Text reconstruirait sa texture à chaque fois.
    this.hudElements.push(addHudPanel(this, px(14), px(12), px(244), px(84)));
    this.hudElements.push(
      this.add
        .text(px(36), px(24), 'SCORE', {
          fontFamily: GAME_FONT,
          fontSize: fontPx(22),
          fontStyle: '600',
          color: '#9fd0e6',
        })
        .setDepth(50)
    );
    this.scoreValue = this.add
      .bitmapText(px(36), px(44), FONT_DIGITS, '0', px(44))
      .setOrigin(0, 0)
      .setDepth(50);
    this.hudElements.push(this.scoreValue);
    // La scène est réutilisée d'une partie à l'autre : le compteur de
    // défilement doit repartir de zéro, sinon le score initial « descendrait »
    // depuis celui de la partie précédente.
    this.displayedScore = 0;
    this.scoreCounter.value = 0;

    // Bannière x2 sous le score, cachée par défaut, clignote quand active
    this.multiplierBanner = this.add
      .text(24, 106, `SCORE x${BONUS_X2_FACTOR} !`, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(32),
        fontStyle: '700',
        color: '#ffd700',
        stroke: '#2d3a4a',
        strokeThickness: px(6),
      })
      .setDepth(50)
      .setVisible(false);
    this.tweens.add({
      targets: this.multiplierBanner,
      alpha: 0.45,
      duration: 300,
      yoyo: true,
      repeat: -1,
    });

    const w = this.scale.width;
    if (this.mode !== 'chrono') {
      // Pas de libellé « VIES » : trois croix parlent d'elles-mêmes, et le
      // texte entrait en collision avec les éclaboussures de la dernière.
      this.hudElements.push(addHudPanel(this, w - px(14) - px(204), px(12), px(204), px(84)));
      this.createLifeCrosses();
      this.hudElements.push(...this.lifeCrosses);
    } else {
      this.hudElements.push(addHudPanel(this, w - px(14) - px(160), px(12), px(160), px(84)));
      this.hudElements.push(
        this.add
          .text(w - 36, 20, 'TEMPS', {
            fontFamily: GAME_FONT,
            fontSize: fontPx(22),
            fontStyle: '600',
            color: '#9fd0e6',
          })
          .setOrigin(1, 0)
          .setDepth(50)
      );
      this.infoText = this.add
        .text(w - 36, 44, '60 s', {
          fontFamily: GAME_FONT,
          fontSize: fontPx(40),
          fontStyle: '700',
          color: '#ffffff',
          stroke: '#2d3a4a',
          strokeThickness: px(6),
        })
        .setOrigin(1, 0)
        .setDepth(50);
      this.hudElements.push(this.infoText);
    }

    createMuteButton(this, px(52), this.scale.height - px(52));

    // La pause ne doit pas pouvoir s'ouvrir sur un game over ni pendant la
    // frénésie : dans les deux cas la partie n'est plus entre les mains du
    // joueur, et geler là laisserait un état intermédiaire à démêler.
    this.pause = new PauseController(
      this,
      () => fadeToScene(this, 'MenuScene'),
      () => !this.gameEnded && this.frenzyGrenade === null
    );
    this.pause.create();
  }

  /**
   * Estompe (ou rétablit) le HUD. Utilisé pendant la frénésie : la caméra
   * zoome, or le HUD est ancré aux bords et se retrouverait tronqué. Le
   * masquer est aussi cohérent côté jeu — plus aucun fruit n'apparaît
   * pendant la frénésie, donc ni le score ni les vies n'y sont actionnables.
   */
  private setHudDimmed(dimmed: boolean): void {
    for (const element of this.hudElements) {
      this.tweens.killTweensOf(element);
      this.tweens.add({
        targets: element,
        alpha: dimmed ? 0 : 1,
        duration: 220,
        ease: 'Sine.easeOut',
        // Les croix éteintes ont leur propre opacité (0,5) : on la rétablit
        // une fois le HUD revenu, sinon elles paraîtraient toutes allumées.
        onComplete: dimmed ? undefined : () => this.syncLifeCrossStyles(),
      });
    }
  }

  /**
   * Applique taille, teinte et opacité des croix selon les vies restantes.
   *
   * La TAILLE est le signal principal, pas la couleur. Auparavant les deux
   * états ne différaient que par la teinte, avec un contraste de 1,10:1 :
   * indistinguables pour un daltonien, et illisibles en plein soleil. Un
   * élément graphique porteur d'information ne doit jamais reposer sur la
   * seule couleur — ici s'ajoutent un écart de taille de 42 contre 27 px et
   * le compteur chiffré juste en dessous.
   */
  private syncLifeCrossStyles(): void {
    for (let i = 0; i < this.lifeCrosses.length; i++) {
      const isFilled = i < this.filledCrosses;
      const side = isFilled ? CROSS_SIZE_LIT : CROSS_SIZE_DIM;
      this.lifeCrosses[i]
        .setDisplaySize(side, side)
        .setTint(isFilled ? CROSS_COLOR_LIT : CROSS_COLOR_DIM)
        .setAlpha(isFilled ? 1 : 0.7);
    }

    const remaining = STARTING_LIVES - this.filledCrosses;
    this.livesLabel?.setText(`${remaining} / ${STARTING_LIVES}`);
  }

  /**
   * Croix de vie (strikes) façon Fruit Ninja : trois croix éteintes en
   * haut à droite. Chaque fruit manqué en allume une en rouge avec un
   * "pop", jusqu'au game over — plus lisible que des cœurs qui disparaissent.
   */
  private createLifeCrosses(): void {
    this.lifeCrosses = [];
    this.filledCrosses = 0;
    // Croix centrées dans leur cartouche (panneau de 204 px collé au bord)
    // Écart généreux : les éclaboussures débordent largement du corps de la
    // croix, deux croix trop proches se lisaient comme une seule tache.
    const gap = px(64);
    const panelCenterX = this.scale.width - px(14) - px(204) / 2;
    for (let i = 0; i < STARTING_LIVES; i++) {
      // i = 0 le plus à gauche : les croix s'allument de gauche à droite
      const x = panelCenterX + (i - (STARTING_LIVES - 1) / 2) * gap;
      const cross = this.add
        .image(x, px(54), TEX_CROSS)
        .setDisplaySize(px(40), px(40))
        .setOrigin(0.5)
        .setDepth(50)
        .setTint(CROSS_COLOR_DIM)
        .setAlpha(0.7);
      this.lifeCrosses.push(cross);
    }

    // Le nombre de vies écrit en clair. C'est la seule forme d'information
    // qui reste lisible quelles que soient la vision et la luminosité.
    this.livesLabel = this.add
      .text(panelCenterX, px(92), `${STARTING_LIVES} / ${STARTING_LIVES}`, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(22),
        color: '#eef3f7',
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setAlpha(0.9);

    this.syncLifeCrossStyles();
  }

  /**
   * Taches de jus persistantes : pool d'images recyclées en round-robin
   * (la plus ancienne est réutilisée), teintées à la couleur du fruit.
   * Elles s'estompent lentement et racontent la partie sur le décor.
   */
  private createSplatPool(): void {
    this.splatPool = [];
    this.nextSplatIndex = 0;
    for (let i = 0; i < SPLAT_POOL_SIZE; i++) {
      const splat = this.add
        .image(0, 0, `${TEX_SPLAT_PREFIX}0`)
        .setDepth(DEPTH_SPLAT)
        .setVisible(false);
      this.splatPool.push(splat);
    }
  }

  private spawnSplat(x: number, y: number, color: number): void {
    const splat = this.splatPool[this.nextSplatIndex];
    this.nextSplatIndex = (this.nextSplatIndex + 1) % SPLAT_POOL_SIZE;
    this.tweens.killTweensOf(splat); // la tache recyclée abandonne son fondu en cours
    splat
      .setTexture(`${TEX_SPLAT_PREFIX}${Phaser.Math.Between(0, SPLAT_VARIANTS - 1)}`)
      .setPosition(x, y)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(Phaser.Math.FloatBetween(0.7, 1.25))
      .setTint(color)
      .setAlpha(0.75)
      .setVisible(true);
    this.tweens.add({
      targets: splat,
      alpha: 0,
      duration: SPLAT_FADE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => splat.setVisible(false),
    });
  }

  /**
   * Éclats de lame : le trait de lumière qui naît DANS le fruit au moment
   * où il s'ouvre.
   *
   * C'est l'instant que le joueur regarde, et c'est le seul où il ne se
   * passait rien de lumineux : il y avait du jus, une tache, un texte et un
   * son, mais aucune trace du coup lui-même. Le halo radial étiré dans l'axe
   * du geste donne exactement cela — une lame qui accroche le couchant en
   * traversant — pour un sprite additif recyclé, sans shader.
   */
  private createSliceFlashPool(): void {
    this.flashPool = [];
    this.nextFlashIndex = 0;
    for (let i = 0; i < SLICE_FLASH_POOL_SIZE; i++) {
      const flash = this.add
        .image(0, 0, TEX_GLOW)
        .setDepth(DEPTH_JUICE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
      this.flashPool.push(flash);
    }
  }

  /**
   * `angle` est celui du geste : l'éclat s'aligne dessus. Un éclat toujours
   * horizontal aurait suffi à éclairer, mais il aurait démenti la direction
   * du coup — et c'est justement ce que le joueur vient de faire.
   */
  private spawnSliceFlash(x: number, y: number, angle: number, radius: number): void {
    const flash = this.flashPool[this.nextFlashIndex];
    this.nextFlashIndex = (this.nextFlashIndex + 1) % SLICE_FLASH_POOL_SIZE;
    this.tweens.killTweensOf(flash);

    const longueur = radius * 2.6;
    const epaisseur = radius * 0.34;
    flash
      .setPosition(x, y)
      .setRotation(angle)
      .setDisplaySize(longueur, epaisseur)
      .setAlpha(0.85)
      .setVisible(true);

    // L'éclat s'ÉTIRE en s'effaçant : la lumière file le long de la coupe au
    // lieu de se dissiper sur place. Très court — au-delà de 200 ms l'œil
    // n'y lit plus un éclat mais un objet, et la coupe paraît molle.
    this.tweens.add({
      targets: flash,
      displayWidth: longueur * 1.75,
      displayHeight: epaisseur * 0.35,
      alpha: 0,
      duration: SLICE_FLASH_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.setVisible(false),
    });
  }

  /** Pool de textes flottants (+10, Combo x2…) — aucune création en partie. */
  private createPopupPool(): void {
    this.popupPool = [];
    for (let i = 0; i < POPUP_POOL_SIZE; i++) {
      const popup = this.add
        .text(0, 0, '', {
          fontFamily: GAME_FONT,
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2d3a4a',
          strokeThickness: px(6),
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setVisible(false);
      this.popupPool.push(popup);
    }
  }

  /**
   * Affiche un texte flottant qui monte et s'estompe (recycle le pool).
   *
   * `delayMs` est ce qui permet d'en faire apparaître PLUSIEURS à la suite
   * sans les empiler sur la même image. Une cascade de 70 ms se lit ; cinq
   * textes apparus à la même frame font une bouillie.
   *
   * Chaque popup part légèrement de travers et dérive un peu sur le côté.
   * Sans cela, deux récompenses proches montent sur des rails parallèles et
   * se lisent comme une seule ligne de texte cassée en deux.
   */
  private showPopup(
    x: number,
    y: number,
    message: string,
    color: string,
    fontSize: number,
    delayMs = 0
  ): void {
    const popup = this.popupPool.find((p) => !p.visible);
    if (popup === undefined) {
      return; // pool saturé : on saute ce feedback plutôt que d'allouer
    }
    // Bornage à l'écran : une récompense affichée hors cadre n'est pas une
    // récompense. La marge suit la taille du texte, pas une valeur fixe.
    const marge = fontSize * 2.2;
    const cx = Phaser.Math.Clamp(x, marge, this.scale.width - marge);
    const cy = Phaser.Math.Clamp(y, fontSize, this.scale.height - fontSize);
    const derive = Phaser.Math.Between(-px(26), px(26));
    popup
      .setText(message)
      .setColor(color)
      .setFontSize(fontSize)
      .setPosition(cx, cy)
      .setAngle(Phaser.Math.Between(-6, 6))
      .setAlpha(delayMs > 0 ? 0 : 1)
      .setScale(0.6)
      .setVisible(true);
    this.tweens.add({
      targets: popup,
      x: cx + derive,
      y: cy - px(90),
      alpha: { from: 1, to: 0 },
      scale: 1,
      delay: delayMs,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.setVisible(false),
    });
  }

  /**
   * Plusieurs récompenses d'un coup, dispersées autour du point du geste.
   *
   * CE QUI MANQUAIT, relevé par Kevin sur la vidéo de référence à 1 min 04 :
   * cinq récompenses y cohabitent à l'écran — le combo, le critique, le bonus
   * de fruit, le bonus de blitz — à cinq endroits, dans trois tailles et
   * trois couleurs. Chez nous, tout arrivait en un seul bandeau centré. Un
   * bandeau, si gros soit-il, reste UNE chose : l'œil le lit et passe.
   *
   * La dispersion alterne de part et d'autre du geste, en s'éloignant à
   * chaque rang. Ce n'est pas une décoration : deux textes superposés ne se
   * lisent ni l'un ni l'autre, et un simple décalage vertical les aurait fait
   * passer pour les lignes d'un même paragraphe.
   *
   * Le décalage temporel fait le reste (cf. REWARD_STAGGER_MS) : la cascade
   * donne l'impression que l'écran n'arrive plus à suivre, ce qui est
   * exactement l'effet recherché.
   */
  private showRewardBurst(
    x: number,
    y: number,
    recompenses: Array<{ texte: string; couleur: string; taille: number }>
  ): void {
    // L'écart vertical se DÉDUIT de la taille du texte précédent, il n'est pas
    // constant : une valeur fixe suffisait pour deux petites lignes et faisait
    // se chevaucher un « 9 FRUITS » en 56 px avec le « +225 » d'en dessous.
    // Mesuré avant correction : 90 px d'écart pour un texte large de 230.
    let dy = -px(26);
    for (let i = 0; i < recompenses.length; i++) {
      const { texte, couleur, taille } = recompenses[i];
      const cote = i % 2 === 0 ? -1 : 1;
      const dx = cote * REWARD_SPREAD_PX * (0.32 + i * 0.16);
      this.showPopup(x + dx, y + dy, texte, couleur, taille, i * REWARD_STAGGER_MS);
      dy -= taille * 1.3 + px(16);
    }
  }

  private registerGameEvents(): void {
    this.events.on('score-changed', this.onScoreChanged, this);
    this.events.on('lives-changed', this.onLivesChanged, this);
    this.events.on('life-gained', this.onLifeGained, this);
    this.events.on('frenzy-incoming', this.onFrenzyIncoming, this);
    this.events.on('cyclone-incoming', this.onCycloneIncoming, this);
    this.events.on('fruit-missed', this.onFruitMissed, this);
    this.events.on('game-over', this.onLivesDepleted, this);

    // Les listeners de this.events survivent au restart de la scène :
    // on les retire explicitement au shutdown pour éviter les doublons.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('score-changed', this.onScoreChanged, this);
      this.events.off('lives-changed', this.onLivesChanged, this);
      this.events.off('life-gained', this.onLifeGained, this);
      this.events.off('frenzy-incoming', this.onFrenzyIncoming, this);
      this.events.off('fruit-missed', this.onFruitMissed, this);
      this.events.off('game-over', this.onLivesDepleted, this);
    });
  }

  /** Slot de geste occupé par ce pointeur (recherche linéaire : 3 slots). */
  private findGesture(pointerId: number): SliceGesture | undefined {
    return this.gestures.find((g) => g.pointerId === pointerId);
  }

  private registerPointerEvents(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Réutilise le slot si ce pointeur en avait déjà un, sinon en prend un libre
      const gesture = this.findGesture(pointer.id) ?? this.gestures.find((g) => g.pointerId === null);
      if (gesture === undefined) {
        return; // plus de 3 doigts : les suivants sont ignorés
      }
      gesture.pointerId = pointer.id;
      gesture.comboCount = 0;
      gesture.strokeActive = false;
      gesture.trail.clear();
      // worldX/worldY (et non x/y) : la caméra zoome pendant la frénésie et le
      // drame de la bombe. En espace écran, le doigt ne coïnciderait plus avec
      // les fruits dès que le zoom n'est pas à 1.
      gesture.lastX = pointer.worldX;
      gesture.lastY = pointer.worldY;
      gesture.lastTime = this.time.now;
      gesture.trail.addPoint(pointer.worldX, pointer.worldY, this.time.now);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) {
        return;
      }
      const gesture = this.findGesture(pointer.id);
      if (gesture === undefined) {
        return;
      }
      this.handleSliceMove(gesture, pointer);
    });

    // Doigt levé : on évalue le combo de ce geste, puis le slot redevient libre
    const endSlice = (pointer: Phaser.Input.Pointer): void => {
      const gesture = this.findGesture(pointer.id);
      if (gesture !== undefined) {
        this.endStroke(gesture);
        gesture.pointerId = null;
      }
    };
    this.input.on('pointerup', endSlice);
    this.input.on('pointerupoutside', endSlice);
  }

  /**
   * À chaque déplacement du pointeur pendant un geste :
   * 1. on ajoute le point à la traînée visuelle,
   * 2. on teste le segment [dernier point → point courant] contre fruits ET
   *    bombes, mais seulement si le geste est assez rapide — un doigt posé
   *    immobile sur l'écran ne doit pas couper.
   */
  private handleSliceMove(gesture: SliceGesture, pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded || this.pause?.isPaused) {
      return;
    }
    const now = this.time.now;
    // Tout le geste est raisonné en coordonnées MONDE : fruits, traînée et
    // segment de coupe partagent ainsi le même repère, zoom caméra compris.
    const px = pointer.worldX;
    const py = pointer.worldY;
    const distance = Phaser.Math.Distance.Between(gesture.lastX, gesture.lastY, px, py);
    const elapsed = Math.max(now - gesture.lastTime, 1);
    const speed = distance / elapsed; // px par ms

    gesture.trail.addPoint(px, py, now);

    if (speed >= SLICE_MIN_SPEED) {
      // Un coup de sabre s'ouvre dès que le doigt atteint la vitesse de coupe,
      // et non quand il se pose : on peut poser le doigt, hésiter, puis
      // trancher — c'est le tranchage qui compte.
      if (!gesture.strokeActive) {
        gesture.strokeActive = true;
        gesture.strokeStart = now;
        gesture.comboCount = 0;
      }
      gesture.lastFastTime = now;

      // Angle du geste : les moitiés s'écarteront perpendiculairement à lui
      const sliceAngle = Math.atan2(py - gesture.lastY, px - gesture.lastX);
      this.sliceDetector.checkSegment<Fruit>(
        gesture.lastX,
        gesture.lastY,
        px,
        py,
        this.fruits,
        (fruit) => this.onFruitSliced(fruit, gesture, now, sliceAngle)
      );
      this.sliceDetector.checkSegment<Bomb>(
        gesture.lastX,
        gesture.lastY,
        px,
        py,
        this.bombs,
        (bomb) => this.onBombSliced(bomb)
      );
    }

    gesture.lastX = px;
    gesture.lastY = py;
    gesture.lastTime = now;
  }

  /** Un fruit vient d'être tranché : score, combo, coup critique, jus, moitiés. */
  private onFruitSliced(fruit: Fruit, gesture: SliceGesture, now: number, sliceAngle: number): void {
    if (this.gameEnded) {
      return;
    }

    // La grenade ne se coupe pas : elle encaisse et s'emballe (cf. onGrenadeHit)
    if (fruit.isFrenzy) {
      this.onGrenadeHit(fruit, now);
      return;
    }

    // Suivi du combo par geste et des statistiques de fin
    gesture.comboCount++;
    this.fruitsSliced++;
    this.bestGestureCombo = Math.max(this.bestGestureCombo, gesture.comboCount);

    // Le combava doré active le multiplicateur AVANT le crédit des points :
    // sa propre coupe profite déjà du x2.
    if (fruit.isBonus) {
      this.activateBonus(fruit);
    }

    // La papaye cyclone se tranche comme n'importe quel fruit — elle compte
    // dans le combo, se fend en deux, rapporte ses points. C'est ce qu'elle
    // DÉCLENCHE qui n'a rien d'ordinaire.
    if (fruit.isCyclone) {
      this.startCyclone(fruit);
    }

    // Coup critique : bonus rare et appuyé (jamais sur le combava, déjà spécial)
    const isCrit = !fruit.isBonus && Math.random() < CRIT_CHANCE;
    // Un fruit vaut toujours le même prix. Tout le bénéfice d'un enchaînement
    // est versé EN UNE FOIS à la fin du coup de sabre (cf. celebrateGestureCombo),
    // comme dans Fruit Ninja. C'est ce qui empêche un bonus de s'auto-alimenter.
    let points = SCORE_PER_FRUIT;
    if (isCrit) {
      points *= CRIT_MULTIPLIER;
    }
    const awarded = this.scoreManager.addScore(points);

    // Jus au point d'impact (teinté) + tache persistante sur le décor
    this.juiceEmitter.setParticleTint(fruit.juiceColor);
    this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT);
    this.spawnSplat(fruit.x, fruit.y, fruit.juiceColor);

    if (isCrit) {
      // Coup critique : popup doré, double jet de jus et son dédié
      this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT);
      this.showPopup(fruit.x, fruit.y - px(20), `CRITIQUE ! +${awarded}`, COLOR_CRIT, px(46));
      this.hitStop(HITSTOP_CRIT_MS);
      sfx.crit();
    } else {
      this.showPopup(fruit.x, fruit.y - px(20), `+${awarded}`, COLOR_POINTS, px(34));
    }

    // Compteur de déluge : tous les quatre fruits, un troisième objet vient
    // s'ajouter à l'écran, dans une troisième couleur et une troisième taille.
    // C'est exactement ce qu'on voit à 1 min 04 de la vidéo de référence —
    // plusieurs récompenses de natures différentes, simultanées, dispersées.
    // Tous les quatre et pas à chaque fruit : à sept fruits par seconde, un
    // popped par coupe redeviendrait un mur illisible.
    if (this.spawnManager.isDeluge()) {
      this.delugeFruits++;
      if (this.delugeFruits % 4 === 0) {
        this.showPopup(
          fruit.x,
          fruit.y - px(96),
          `CYCLONE x${this.delugeFruits}`,
          COLOR_CYCLONE,
          px(44),
          REWARD_STAGGER_MS
        );
      }
    }

    sfx.slice();
    this.spawnSliceFlash(fruit.x, fruit.y, sliceAngle, fruit.sliceRadius);
    this.spawnHalves(fruit, sliceAngle);
    fruit.kill();
  }

  /**
   * Coup porté à la grenade. Le premier amorce la frénésie (elle se fige en
   * l'air et un compte à rebours démarre) ; les suivants incrémentent le
   * compteur, borné par un temps de garde pour qu'un doigt traînant dessus
   * ne mitraille pas le score à 60 coups/seconde.
   */
  private onGrenadeHit(grenade: Fruit, now: number): void {
    if (!grenade.frenzyActive) {
      grenade.startFrenzy();
      this.settleGrenade(grenade);
      this.enterFrenzyZoom(grenade);
      grenade.lastSlashAt = now;
      grenade.slashCount = 1;
      // Pas de bandeau ici : il masquerait la grenade au moment précis où le
      // joueur doit la voir. Le compteur qui s'allume suffit à dire « vas-y ».
      this.frenzyCounter.setText('x1').setVisible(true).setScale(1);
      sfx.crit();
      this.spawnRing(grenade.x, grenade.y, 5, 0xffffff, 500);
      // Fin de frénésie programmée : un seul timer, quoi qu'il arrive
      this.time.delayedCall(FRENZY_DURATION_MS, () => this.explodeGrenade(grenade));
      return;
    }
    if (now - grenade.lastSlashAt < FRENZY_HIT_COOLDOWN_MS) {
      return;
    }
    grenade.lastSlashAt = now;
    grenade.slashCount += 1;

    // Retour immédiat à chaque coup : jus, onde, sursaut et compteur qui grimpe
    this.juiceEmitter.setParticleTint(grenade.juiceColor);
    this.juiceEmitter.emitParticleAt(grenade.x, grenade.y, JUICE_PARTICLE_COUNT);
    this.spawnRing(grenade.x, grenade.y, 2.6, 0xff8fa3, 320);
    sfx.slice();

    // Sursaut du fruit : il encaisse visiblement. La pulsation permanente est
    // un tween sur `scale`, donc on secoue l'ANGLE pour ne pas les faire
    // lutter l'un contre l'autre.
    this.tweens.add({
      targets: grenade,
      angle: grenade.angle + Phaser.Math.Between(-16, 16),
      duration: 90,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    this.shakeCamera(70, 0.003);
    // Respiration de caméra à chaque coup : le zoom « pompe » au rythme des
    // frappes, ce qui donne son énergie à la séquence.
    this.cameraPunch(FRENZY_HIT_PUNCH, 80);

    // Le compteur enfle à chaque coup : la montée se voit sans encombrer
    this.frenzyCounter.setText(`x${grenade.slashCount}`).setVisible(true).setScale(1.35);
    this.tweens.killTweensOf(this.frenzyCounter);
    this.tweens.add({
      targets: this.frenzyCounter,
      scale: 1,
      duration: 130,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Resserre la caméra sur la grenade pour la durée de la frénésie.
   *
   * Le recentrage n'est que PARTIEL (FRENZY_PAN_RATIO) : viser la grenade en
   * plein centre sortirait le HUD du cadre quand elle est près d'un bord.
   * Le geste de coupe raisonne en coordonnées monde, donc le zoom ne décale
   * pas le doigt (cf. handleSliceMove).
   */
  private enterFrenzyZoom(grenade: Fruit): void {
    this.cancelPunchReturn();
    this.frenzyZoomed = true;
    const cibleX = this.scale.width / 2 + (grenade.x - this.scale.width / 2) * FRENZY_PAN_RATIO;
    const cibleY = this.scale.height / 2 + (grenade.y - this.scale.height / 2) * FRENZY_PAN_RATIO;
    this.grading.setMode('frenzy');
    this.zoomCamera(FRENZY_ZOOM, FRENZY_ZOOM_MS, 'Sine.easeOut');
    this.panCamera(cibleX, cibleY, FRENZY_ZOOM_MS, 'Sine.easeOut');
    this.setHudDimmed(true);
  }

  /** Rend la caméra à son cadrage normal (fin de frénésie). */
  private exitFrenzyZoom(): void {
    this.cancelPunchReturn();
    this.frenzyZoomed = false;
    this.grading.setMode(this.filledCrosses >= STARTING_LIVES - 1 ? 'danger' : 'normal');
    this.zoomCamera(1, FRENZY_ZOOM_MS, 'Sine.easeInOut');
    this.panCamera(this.scale.width / 2, this.scale.height / 2, FRENZY_ZOOM_MS, 'Sine.easeInOut');
    this.setHudDimmed(false);
  }

  /**
   * Hit-stop : micro-gel du jeu à l'impact, puis reprise.
   *
   * C'est la technique de « juice » la plus efficace — c'est cette pause
   * infime qui fait qu'un coup CLAQUE au lieu de simplement se produire.
   * On fige la physique ET les tweens ; l'horloge de la scène, elle, continue
   * de tourner, ce qui permet au minuteur de reprise de se déclencher (et
   * n'altère ni le chrono ni la minuterie d'explosion de la grenade).
   *
   * Un gel en cours n'est jamais empilé : deux coups rapprochés donneraient
   * un blocage cumulé, perçu comme une saccade et non comme une frappe.
   */
  private hitStop(durationMs: number): void {
    if (this.hitStopActive) {
      return;
    }
    this.hitStopActive = true;
    this.physics.pause();
    this.tweens.timeScale = 0;
    this.time.delayedCall(durationMs, () => {
      this.hitStopActive = false;
      this.tweens.timeScale = 1;
      // Toujours relancer la physique : même une fin de partie en a besoin,
      // c'est elle qui joue le ralenti dramatique de la bombe.
      this.physics.resume();
    });
  }

  // ------------------------------------------------------------------
  // Mouvement réduit
  // ------------------------------------------------------------------
  //
  // Toutes les secousses, zooms et panoramiques passent par ces trois gardes.
  // Un fruit-slicer secoue beaucoup : pour une personne sujette au mal des
  // transports vestibulaire ou aux migraines, ces mouvements ne sont pas un
  // détail de confort, ils rendent le jeu douloureux.
  //
  // On coupe l'AMPLITUDE, jamais la logique : les minuteries, les états et les
  // rappels continuent de s'exécuter à l'identique. Court-circuiter un
  // delayedCall parce que le joueur préfère peu de mouvement laisserait la
  // frénésie coincée dans son état de zoom.

  /** Secousse de caméra, supprimée si le joueur demande peu de mouvement. */
  private shakeCamera(dureeMs: number, intensite: number): void {
    if (prefersReducedMotion()) {
      return;
    }
    this.cameras.main.shake(dureeMs, intensite);
  }

  /** Zoom de caméra ; en mouvement réduit, le cadrage reste fixe. */
  /** Même raison que panCamera : le dernier ordre de zoom doit gagner. */
  private zoomCamera(cible: number, dureeMs: number, ease?: string): void {
    if (prefersReducedMotion()) {
      return;
    }
    this.cameras.main.zoomTo(cible, dureeMs, ease, true);
  }

  /** Panoramique de caméra ; supprimé en mouvement réduit. */
  /**
   * Le quatrième argument (`force`) n'est pas un détail : sans lui, Phaser
   * IGNORE SILENCIEUSEMENT un nouveau recadrage tant que le précédent n'est
   * pas terminé (Effects.Pan.start : `if (!force && this.isRunning) return`).
   *
   * Tous les appels du jeu supposent l'inverse — le dernier ordre doit
   * gagner. Un dézoom demandé pendant un coup de caméra était purement et
   * simplement perdu, et la caméra restait où le coup l'avait laissée.
   */
  private panCamera(x: number, y: number, dureeMs: number, ease?: string): void {
    if (prefersReducedMotion()) {
      return;
    }
    this.cameras.main.pan(x, y, dureeMs, ease, true);
  }

  /**
   * Brève pulsation de zoom : la caméra « respire » sur un temps fort, puis
   * revient au zoom de référence — celui de la frénésie s'il est en cours,
   * sinon 1. Sans cette lecture du contexte, un combo pendant la frénésie
   * annulerait le resserrement.
   */
  private cameraPunch(force: number, dureeMs: number): void {
    // Un seul retour en attente à la fois : deux coups rapprochés
    // programmaient deux retours, et le second écrasait le premier en pleine
    // course.
    this.cancelPunchReturn();

    this.zoomCamera(this.restingZoom() * force, dureeMs, 'Sine.easeOut');
    this.punchReturn = this.time.delayedCall(dureeMs, () => {
      this.punchReturn = null;
      if (this.scene.isActive()) {
        // Le zoom de repos est relu MAINTENANT, et non au départ du coup.
        //
        // C'ÉTAIT LE BUG. Il était capturé à l'appel : un coup porté à la
        // grenade capturait 1,22, et si la frénésie se terminait dans les
        // 80 ms qui suivaient, ce retour périmé se déclenchait APRÈS le
        // dézoom et ramenait la caméra à 1,22. Elle y restait jusqu'au combo
        // suivant — d'où un dézoom qui échouait une fois sur deux, puis se
        // réparait tout seul plus tard.
        //
        // Or un coup porté dans les 80 dernières millisecondes d'une frénésie
        // n'a rien d'un cas rare : c'est le comportement NORMAL du joueur, qui
        // frappe la grenade jusqu'à l'explosion.
        this.zoomCamera(this.restingZoom(), dureeMs * 1.6, 'Sine.easeInOut');
      }
    });
  }

  /**
   * Zoom auquel la caméra doit revenir une fois l'effet en cours terminé.
   *
   * Il se lit sur l'ÉTAT DU CADRAGE, et surtout pas sur la présence d'une
   * grenade à l'écran. Ce sont deux choses différentes : la grenade est
   * suivie dès son ENTRÉE, alors que le zoom ne s'engage qu'au premier COUP
   * porté. Entre les deux — pendant toute la traversée de l'écran — lire la
   * grenade faisait croire à un repos de 1,22 alors que la caméra était à 1 :
   * un simple combo suffisait alors à zoomer sans raison, et le zoom restait
   * tant que la grenade n'avait pas quitté l'écran.
   */
  private restingZoom(): number {
    return this.frenzyZoomed ? FRENZY_ZOOM : 1;
  }

  /**
   * Annule un retour de coup en attente. Indispensable avant tout changement
   * DURABLE de cadrage : sans cela, un retour périmé vient défaire le nouveau
   * cadrage quelques dizaines de millisecondes plus tard.
   */
  private cancelPunchReturn(): void {
    if (this.punchReturn !== null) {
      this.punchReturn.remove();
      this.punchReturn = null;
    }
  }

  /**
   * La grenade « s'installe » : elle glisse vers une position confortable puis
   * y flotte doucement jusqu'à l'explosion.
   *
   * Sans ce recadrage, une grenade frappée près du sommet de son arc restait
   * collée au bord haut de l'écran (voire en sortait), et le combo devenait
   * impossible à terminer. La zone est bornée en x ET en y pour qu'elle soit
   * toujours entièrement visible et à portée du doigt.
   */
  private settleGrenade(grenade: Fruit): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const marge = grenade.sliceRadius + FRENZY_SETTLE_MARGIN;
    const cibleX = Phaser.Math.Clamp(grenade.x, marge, w - marge);
    const cibleY = Phaser.Math.Clamp(
      grenade.y,
      Math.max(marge, h * FRENZY_ZONE_TOP),
      h * FRENZY_ZONE_BOTTOM
    );

    // On ne purge pas les tweens du sprite : la pulsation d'échelle lancée au
    // spawn doit continuer, et elle ne touche pas aux mêmes propriétés.
    this.tweens.add({
      targets: grenade,
      x: cibleX,
      y: cibleY,
      duration: 280,
      ease: 'Back.easeOut', // arrivée franche : on sent qu'elle se cale
      onComplete: () => {
        if (!grenade.active || !grenade.frenzyActive) {
          return;
        }
        // Léger flottement sur place : vivant, mais elle ne s'échappe plus
        this.tweens.add({
          targets: grenade,
          y: cibleY - FRENZY_BOB_PX,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  /**
   * Fin de la frénésie : la grenade éclate, rapporte ses points et emporte
   * tous les fruits encore en vol (qui marquent normalement, eux aussi).
   * Les bombes ne sont pas touchées — l'explosion ne doit pas tuer le joueur.
   */
  private explodeGrenade(grenade: Fruit): void {
    if (!grenade.active || !grenade.frenzyActive) {
      return; // grenade déjà rendue au pool (manquée, ou partie relancée)
    }
    if (this.gameEnded) {
      // Partie finie pendant la frénésie : on rend la grenade au pool sans
      // fanfare, sinon elle resterait en scène et gèlerait le spawn.
      grenade.kill();
      return;
    }
    const slashes = grenade.slashCount;
    const awarded = this.scoreManager.addScore(slashes * FRENZY_POINTS_PER_SLASH);

    // Gerbe généreuse au point d'explosion
    this.juiceEmitter.setParticleTint(grenade.juiceColor);
    this.juiceEmitter.emitParticleAt(grenade.x, grenade.y, JUICE_PARTICLE_COUNT * 5);
    this.spawnSplat(grenade.x, grenade.y, grenade.juiceColor);
    this.shakeCamera(260, 0.008);
    // Double onde : une rapide et serrée, une lente et large — le souffle
    this.spawnRing(grenade.x, grenade.y, 6, 0xffffff, 380);
    this.spawnRing(grenade.x, grenade.y, 12, 0xff5c78, 750);
    this.hitStop(HITSTOP_GRENADE_MS);
    sfx.crit();
    // Même découpage que pour les combos : l'exclamation au centre, le détail
    // chiffré dispersé autour du point d'explosion.
    this.showBigBanner(FRENESIE);
    this.showRewardBurst(grenade.x, grenade.y, [
      { texte: `${slashes} COUPS`, couleur: COLOR_COMBO, taille: px(48) },
      { texte: `+${awarded}`, couleur: COLOR_POINTS, taille: px(38) },
    ]);

    this.hideFrenzyVisuals();
    grenade.kill();

    // Souffle : tous les fruits en vol sont tranchés dans la foulée
    const children = this.fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const other = children[i] as Fruit;
      if (!other.active || other === grenade) {
        continue;
      }
      this.fruitsSliced++;
      this.scoreManager.addScore(SCORE_PER_FRUIT);
      this.juiceEmitter.setParticleTint(other.juiceColor);
      this.juiceEmitter.emitParticleAt(other.x, other.y, JUICE_PARTICLE_COUNT);
      this.spawnHalves(other, Phaser.Math.FloatBetween(0, Math.PI));
      other.kill();
    }

    // PAS DE DÉLUGE ICI, et c'est délibéré depuis que la papaye cyclone
    // existe. La grenade en déclenchait un, du temps où elle était le seul
    // fruit spécial du jeu ; les deux se sont retrouvés à faire la même
    // chose, et la frénésie perdait sa rareté à sortir deux fois plus souvent.
    //
    // Chacun son métier : la grenade paie le combo de coups qu'on vient de lui
    // porter — c'est déjà une récompense complète, et elle a la sienne. Le
    // déluge appartient au cyclone, qui n'a que ça à offrir.
  }

  /**
   * Ferme les coups de sabre qui ne se termineront jamais d'eux-mêmes.
   *
   * C'ÉTAIT LE BUG. Le combo ne se clôturait qu'au LEVER du doigt. Un joueur
   * qui gardait le doigt posé et continuait à balayer restait donc dans un
   * seul et même « geste », indéfiniment — le compteur montait sans fin et
   * chaque fruit valait de plus en plus cher. Ce n'est pas comme cela qu'un
   * coup de sabre se termine : il se termine quand le geste s'arrête, pas
   * quand la main quitte l'écran.
   *
   * Deux fins possibles, et il faut les deux. L'arrêt (le doigt ralentit
   * sous la vitesse de coupe) couvre le cas normal : entre deux balayages, la
   * main décélère toujours pour repartir dans l'autre sens. La durée maximale
   * couvre le cas limite : un doigt qui tourne en rond sans jamais ralentir.
   */
  private closeStaleStrokes(): void {
    const now = this.time.now;
    for (const gesture of this.gestures) {
      if (!gesture.strokeActive) {
        continue;
      }
      const arret = now - gesture.lastFastTime > STROKE_BREAK_MS;
      const tropLong = now - gesture.strokeStart > STROKE_MAX_MS;
      if (arret || tropLong) {
        this.endStroke(gesture);
      }
    }
  }

  /** Clôt un coup de sabre : on le célèbre s'il le mérite, puis on repart de zéro. */
  private endStroke(gesture: SliceGesture): void {
    this.celebrateGestureCombo(gesture);
    gesture.strokeActive = false;
    gesture.comboCount = 0;
  }

  /**
   * Fin d'un coup de sabre : si le doigt a tranché GESTURE_COMBO_MIN fruits ou
   * plus dans le même mouvement, on célèbre en grand (bannière centrée +
   * bonus + son) — la signature de Fruit Ninja, « couper plein de fruits d'un
   * coup ».
   */
  private celebrateGestureCombo(gesture: SliceGesture): void {
    if (this.gameEnded || gesture.comboCount < GESTURE_COMBO_MIN) {
      return;
    }
    const n = gesture.comboCount;
    const awarded = this.scoreManager.addScore(n * GESTURE_COMBO_BONUS);

    // Trois fruits d'un geste : la réussite ORDINAIRE. Elle se paie et se
    // voit — chiffre flottant, onde, son — mais elle ne crie pas.
    //
    // Elle criait, et c'était le défaut : sur 22 gestes relevés à intensité
    // maximale, deux bannières sur trois étaient des x3, disant toutes le même
    // mot. Une exclamation qui sert à chaque geste réussi ne dit plus rien —
    // et les vrais grands gestes n'ont alors plus rien de plus à offrir.
    if (n < GESTURE_BANNER_MIN) {
      // Deux objets plutôt qu'un seul texte « x3 +75 » : le nombre de fruits
      // et les points gagnés sont deux informations différentes, elles ont
      // donc droit à deux couleurs, deux tailles et deux places. C'est le
      // principe de toute la refonte des récompenses.
      this.showRewardBurst(gesture.lastX, gesture.lastY, [
        { texte: `${n} FRUITS`, couleur: COLOR_COMBO, taille: px(42) },
        { texte: `+${awarded}`, couleur: COLOR_POINTS, taille: px(34) },
      ]);
      sfx.bigCombo(n);
      this.spawnRing(gesture.lastX, gesture.lastY, 4, 0xffe066, 380);
      return;
    }

    // Trois paliers de PRÉSENCE pour deux mots. Au-delà de GESTURE_HUGE_MIN
    // fruits, l'exclamation ne change pas mais tout le reste grossit : c'est
    // le geste dont on parle après la partie, il doit s'entendre comme tel.
    const enorme = n >= GESTURE_HUGE_MIN;

    // L'exclamation créole tient le centre, SEULE. Le détail chiffré s'en
    // détache et part vivre ailleurs sur l'écran : c'est ce qui fait passer la
    // récompense d'un bloc unique à une gerbe de récompenses, comme dans la
    // référence. Le bandeau y gagne aussi en lisibilité — une ligne au lieu
    // de deux, au moment précis où l'écran est le plus chargé.
    this.showBigBanner(exclamationCombo(n), enorme ? 1.3 : 1);
    this.showRewardBurst(gesture.lastX, gesture.lastY, [
      { texte: `${n} FRUITS`, couleur: COLOR_COMBO, taille: px(enorme ? 56 : 46) },
      { texte: `+${awarded}`, couleur: COLOR_POINTS, taille: px(38) },
      ...(this.spawnManager.isDeluge()
        ? [{ texte: 'EN PLEIN CYCLONE', couleur: COLOR_CYCLONE, taille: px(36) }]
        : []),
    ]);
    sfx.bigCombo(n);

    // Ponctuation visuelle du combo : gel bref, caméra qui respire, onde
    // partant du dernier fruit tranché, secousse croissante avec le combo.
    this.hitStop(enorme ? Math.round(HITSTOP_COMBO_MS * 1.6) : HITSTOP_COMBO_MS);
    this.cameraPunch(enorme ? COMBO_PUNCH_ZOOM * 1.5 : COMBO_PUNCH_ZOOM, COMBO_PUNCH_MS);
    this.spawnRing(gesture.lastX, gesture.lastY, 5 + n, 0xffe066, 520);
    this.shakeCamera(enorme ? 200 : 120, 0.002 + Math.min(n, 10) * 0.0009);
    // Gerbe dorée le long du geste, proportionnée au nombre de fruits
    this.juiceEmitter.setParticleTint(0xffe066);
    this.juiceEmitter.emitParticleAt(gesture.lastX, gesture.lastY, JUICE_PARTICLE_COUNT * 2);
  }

  /** Bannière centrée éphémère (gros combo) : apparition en "pop" puis fondu. */
  /**
   * `emphase` grossit la bannière et la fait tenir plus longtemps.
   *
   * C'est le troisième palier, obtenu SANS troisième mot. Fruit Ninja gradue
   * six rangs nommés, mais il ne gradue pas que les noms : à chaque rang les
   * tambours montent d'un cran. Ici les exclamations créoles validées sont au
   * nombre de deux et ne s'inventent pas — la montée se joue donc sur la
   * PRÉSENCE : même mot, mais dit beaucoup plus fort.
   */
  private showBigBanner(message: string, emphase = 1): void {
    const banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, message, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(Math.round(76 * emphase)),
        fontStyle: 'bold',
        color: '#ffe066',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: px(10),
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.3)
      .setAngle(Phaser.Math.Between(-7, 7)); // léger décalage : moins figé
    this.tweens.add({
      targets: banner,
      scale: 1,
      angle: 0,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          scale: 1.15,
          delay: 350 * emphase,
          duration: 350,
          onComplete: () => banner.destroy(),
        });
      },
    });
  }

  /** Combava doré tranché : score x2 temporaire + feedback doré appuyé. */
  private activateBonus(fruit: Fruit): void {
    this.scoreManager.activateMultiplier(BONUS_X2_FACTOR, BONUS_X2_DURATION_MS);
    this.showRewardBurst(fruit.x, fruit.y - px(120), [
      { texte: 'COMBAVA DORÉ', couleur: COLOR_BONUS, taille: px(46) },
      { texte: 'SCORE x2', couleur: COLOR_CRIT, taille: px(38) },
    ]);
    sfx.bonus();

    // Gros jet de jus doré en plus du jus normal
    this.juiceEmitter.setParticleTint(0xffd700);
    this.juiceEmitter.emitParticleAt(fruit.x, fruit.y, JUICE_PARTICLE_COUNT * 2);

    // Bannière x2 affichée pendant toute la durée du multiplicateur ;
    // un nouveau combava pendant la fenêtre repousse simplement l'échéance.
    this.multiplierBanner.setVisible(true);
    if (this.multiplierTimer !== null) {
      this.multiplierTimer.remove();
    }
    this.multiplierTimer = this.time.delayedCall(BONUS_X2_DURATION_MS, () => {
      this.multiplierBanner.setVisible(false);
      this.multiplierTimer = null;
    });
  }

  /**
   * Bombe tranchée : moment fatal théâtral — gerbe d'explosion, ralenti
   * (bullet-time sur les fruits en vol), zoom caméra, secousse, flash, puis
   * transition différée vers l'écran de fin.
   */
  private onBombSliced(bomb: Bomb): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    const bx = bomb.x;
    const by = bomb.y;
    bomb.kill();
    this.spawnManager.stop();
    // Tous les gestes en cours sont interrompus
    for (const gesture of this.gestures) {
      gesture.pointerId = null;
      gesture.trail.clear();
    }

    sfx.explosion();
    // Le gel le plus long du jeu : la bombe mérite qu'on encaisse le choc
    // avant que le ralenti ne prenne le relais.
    this.hitStop(HITSTOP_BOMB_MS);

    // Gerbe au point d'impact : fumée sombre + pluie d'étincelles
    this.juiceEmitter.setParticleTint(0x2a2a33);
    this.juiceEmitter.emitParticleAt(bx, by, JUICE_PARTICLE_COUNT * 2);
    this.fuseEmitter.emitParticleAt(bx, by, 26);

    // Bullet-time : la physique ralentit, les fruits en vol figent le temps
    this.physics.world.timeScale = BOMB_PHYSICS_SLOWMO;

    // Zoom caméra (centré → punch-in) + secousse + flash plein écran.
    // Le retour de coup en attente est annulé : il ramènerait la caméra à 1
    // en plein drame de l'explosion.
    this.cancelPunchReturn();
    this.shakeCamera(450, 0.022);
    this.zoomCamera(BOMB_ZOOM, BOMB_ZOOM_MS, 'Sine.easeInOut');
    this.flashRect.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.flashRect,
      alpha: 0,
      duration: BOMB_GAMEOVER_DELAY_MS,
      onComplete: () => this.flashRect.setVisible(false),
    });

    // Fin différée, un peu allongée pour savourer le ralenti et le zoom
    this.time.delayedCall(BOMB_GAMEOVER_DELAY_MS + 350, () => this.endGame('bomb'));
  }

  /**
   * Remplace le fruit par deux moitiés qui s'écartent PERPENDICULAIREMENT
   * au geste (comme dans Fruit Ninja : on coupe selon l'angle du swipe).
   *
   * Géométrie : la face de coupe des textures est verticale ; une rotation
   * de (angle + 90°) l'aligne sur la direction du geste. La normale à la
   * coupe est n = (-sin a, cos a) : la moitié "gauche" (face de coupe à
   * droite de sa texture) part côté -n, la droite côté +n.
   */
  private spawnHalves(fruit: Fruit, sliceAngle: number): void {
    const variety = fruit.getVariety();
    if (variety === null) {
      return; // impossible pour un fruit lancé, garde-fou de typage
    }
    const textures = halfTextureKeys(variety);
    const fruitBody = fruit.body as Phaser.Physics.Arcade.Body;
    const normalX = -Math.sin(sliceAngle);
    const normalY = Math.cos(sliceAngle);
    const sides: Array<{ texture: string; direction: number }> = [
      { texture: textures.left, direction: -1 },
      { texture: textures.right, direction: 1 },
    ];

    for (const side of sides) {
      const half = this.halves.get(fruit.x, fruit.y) as Phaser.Physics.Arcade.Sprite | null;
      if (half === null) {
        continue; // pool plein : on saute l'effet plutôt que d'allouer
      }
      // Le rayon du fruit d'origine voyage avec la moitié : c'est la référence
      // de la rampe d'éclairage, et la texture seule ne permet pas de le
      // retrouver (elle comprend une marge pour feuilles et ombre portée).
      (half as Phaser.Physics.Arcade.Sprite & { sliceRadius?: number }).sliceRadius = fruit.sliceRadius;
      half.setTexture(side.texture);
      half.enableBody(true, fruit.x, fruit.y, true, true);
      half.setAlpha(1);
      half.setDepth(DEPTH_HALF);
      half.setRotation(sliceAngle + Math.PI / 2);
      // Impulsion de séparation le long de la normale à la coupe,
      // ajoutée à une fraction de l'élan du fruit.
      const separation = Phaser.Math.Between(110, 210);
      half.setVelocity(
        fruitBody.velocity.x * 0.35 + side.direction * normalX * separation,
        fruitBody.velocity.y * 0.35 + side.direction * normalY * separation - Phaser.Math.Between(20, 80)
      );
      half.setAngularVelocity(side.direction * Phaser.Math.Between(140, 300));

      // Squash & stretch : la moitié jaillit étirée dans l'axe de la coupe
      // puis reprend sa forme. Le sprite étant tourné pour aligner sa face de
      // coupe sur le geste, son axe X LOCAL est déjà celui de la séparation —
      // étirer scaleX étire donc bien dans la bonne direction, quel que soit
      // l'angle du swipe.
      half.setScale(HALF_SQUASH_X, HALF_SQUASH_Y);
      this.tweens.add({
        targets: half,
        scaleX: 1,
        scaleY: 1,
        duration: HALF_SQUASH_MS,
        ease: 'Back.easeOut',
      });

      // Le tween (une allocation par coupe, pas par frame) gère le fondu
      // puis rend la moitié au pool.
      this.tweens.add({
        targets: half,
        alpha: 0,
        duration: HALF_LIFETIME_MS,
        onComplete: () => {
          half.disableBody(true, true);
        },
      });
    }
  }

  /**
   * Le score ne saute pas d'un coup : il ROULE jusqu'à sa nouvelle valeur.
   * Un compteur qui défile se lit comme une récompense, un nombre qui change
   * instantanément se lit comme une donnée. Le tween porte sur un objet
   * intermédiaire, et le BitmapText n'est réécrit que si l'entier a changé.
   */
  private onScoreChanged(score: number): void {
    this.tweens.killTweensOf(this.scoreCounter);
    this.tweens.add({
      targets: this.scoreCounter,
      value: score,
      duration: 320,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const shown = Math.round(this.scoreCounter.value);
        if (shown !== this.displayedScore) {
          this.displayedScore = shown;
          this.scoreValue.setText(String(shown));
        }
      },
    });

    // Petite poussée d'échelle à chaque gain : le score « respire »
    this.tweens.killTweensOf(this.scoreValue);
    this.scoreValue.setScale(1.18);
    this.tweens.add({
      targets: this.scoreValue,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Synchronise les croix de strike sur le nombre de vies. Le rendu est
   * recalculé intégralement (et non incrémenté) car les vies remontent
   * désormais aux paliers de score : une croix peut aussi bien s'allumer
   * que s'éteindre.
   */
  private onLivesChanged(lives: number): void {
    if (this.mode !== 'classic') {
      return;
    }
    const filled = STARTING_LIVES - Phaser.Math.Clamp(lives, 0, STARTING_LIVES);
    // "Pop" sur la croix qui vient de changer d'état : la dernière allumée
    // quand on encaisse un strike, celle qui s'éteint quand on regagne une vie.
    const changedIndex = filled > this.filledCrosses ? filled - 1 : filled;
    this.filledCrosses = filled;
    // Dernière vie : l'image se refroidit et se désature. Un signal en
    // périphérie de vision, qui n'occupe aucune place à l'écran.
    this.grading.setMode(filled >= STARTING_LIVES - 1 ? 'danger' : 'normal');
    this.syncLifeCrossStyles();
    const target = this.lifeCrosses[changedIndex];
    if (target === undefined) {
      return;
    }
    // Coup de pinceau : la croix arrive en grand et de travers, puis se pose.
    const baseScale = target.scaleX;
    target.setScale(baseScale * 2.2).setAngle(Phaser.Math.Between(-35, 35));
    this.tweens.add({
      targets: target,
      scaleX: baseScale,
      scaleY: baseScale,
      angle: Phaser.Math.Between(-8, 8), // légèrement de travers : c'est peint, pas imprimé
      duration: 380,
      ease: 'Back.easeOut', // rebond franc : le strike "claque"
    });
    this.shakeCamera(90, 0.004);
  }

  /** Palier de score franchi : une croix de strike s'efface. */
  private onLifeGained(): void {
    if (this.gameEnded) {
      return;
    }
    sfx.crit();
    this.showBigBanner('VIE REGAGNÉE !');
  }

  private onFruitMissed(fruit: Fruit): void {
    // En mode Chrono, un fruit manqué est sans conséquence ; un combava ou une
    // grenade manqués non plus (c'étaient des cadeaux, pas des obligations).
    if (
      this.gameEnded ||
      this.mode === 'chrono' ||
      fruit.isBonus ||
      fruit.isFrenzy ||
      fruit.isCyclone
    ) {
      return;
    }
    // Pendant le déluge non plus : on déverse sept fruits par seconde, il est
    // impossible de tous les prendre, et c'est voulu. Facturer les manqués
    // transformerait la récompense en piège.
    //
    // La fenêtre va jusqu'à la FIN DU CALME, pas jusqu'à la fin du déluge. Un
    // fruit parti à la dernière seconde vole encore deux secondes : s'arrêter
    // au déluge revenait à faire payer une croix pour un fruit du cadeau.
    if (this.spawnManager.isDelugeCalm()) {
      return;
    }

    // Pendant le moment du fruit spécial, plus rien ne coûte de vie.
    //
    // Les salves sont déjà suspendues, mais les fruits partis AVANT l'entrée
    // de la grenade continuent de tomber. Le joueur, lui, a les yeux sur la
    // grenade : lui prendre une vie pour un fruit qu'on lui demande justement
    // d'ignorer serait le punir d'avoir suivi le jeu.
    if (this.frenzyGrenade !== null) {
      return;
    }
    sfx.lifeLost();
    this.scoreManager.loseLife();
  }

  /** Événement 'game-over' du ScoreManager : plus de vies (mode Classique). */
  private onLivesDepleted(): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    this.spawnManager.stop();
    // Court délai pour que le joueur voie son dernier cœur disparaître
    this.time.delayedCall(400, () => this.endGame('lives'));
  }

  private endGame(reason: GameOverReason): void {
    // Le résultat du défi est enregistré AVANT la transition : si le joueur
    // ferme l'onglet pendant le fondu, sa tentative doit quand même compter.
    // Sans quoi il pourrait quitter juste avant l'écran de fin pour effacer un
    // mauvais score et rejouer, ce qui viderait le défi de son sens.
    if (this.mode === 'daily') {
      saveTodayResult(this.scoreManager.getScore());
    }

    fadeToScene(this, 'GameOverScene', {
      score: this.scoreManager.getScore(),
      mode: this.mode,
      reason,
      fruitsSliced: this.fruitsSliced,
      bestCombo: this.bestGestureCombo,
    });
  }
}
