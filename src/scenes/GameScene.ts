import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { SliceTrail } from '../entities/SliceTrail';
import { SliceDetector } from '../systems/SliceDetector';
import { ScoreManager } from '../systems/ScoreManager';
import { ComboManager } from '../systems/ComboManager';
import { SpawnManager } from '../systems/SpawnManager';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, halfTextureKeys, wholeTextureKey } from '../utils/fruitCatalog';
import { createMuteButton, addHudPanel, addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { prefersReducedMotion } from '../utils/settings';
import { PauseController } from '../systems/PauseController';
import { seedRandom, clearSeed } from '../utils/rng';
import { dailySeed, saveTodayResult } from '../utils/dailyChallenge';
import { exclamationCombo, FRENESIE } from '../utils/creole';
import {
  FRUIT_POOL_SIZE,
  HALF_POOL_SIZE,
  HALF_LIFETIME_MS,
  SCORE_PER_FRUIT,
  SLICE_MIN_SPEED,
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
  COMBO_BONUS_PER_STEP,
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
  GESTURE_COMBO_BONUS,
  type GameMode,
  type GameOverReason,
  CROSS_SIZE_LIT,
  CROSS_SIZE_DIM,
  fontPx,
  px,
} from '../utils/constants';

/** Données passées par le menu au lancement d'une partie. */
interface GameSceneData {
  mode?: GameMode;
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
  /** Nombre de fruits tranchés depuis que ce doigt s'est posé (combo par geste). */
  comboCount: number;
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
  private comboManager!: ComboManager;
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
  private nextSplatIndex = 0;

  // Statistiques de la partie (affichées sur l'écran de fin — Étape 4)
  private fruitsSliced = 0;
  private bestGestureCombo = 0;

  // État de la partie — la même instance de scène est réutilisée à chaque
  // restart, donc TOUT l'état mutable doit être réinitialisé dans init().
  private gameEnded = false;
  private pause!: PauseController;
  private chronoEndTime = 0;
  private lastShownSecond = -1;

  // Gestes de coupe en cours, un slot par doigt (recréés dans create())
  private gestures: SliceGesture[] = [];

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode ?? 'classic';

    // Le Défi du jour sème la source de hasard avec la date : tout le monde
    // reçoit la même séquence de fruits. Les autres modes la relâchent, sinon
    // une partie libre lancée après un défi rejouerait ce même défi.
    if (this.mode === 'daily') {
      seedRandom(dailySeed());
    } else {
      clearSeed();
    }
    this.gameEnded = false;
    this.lastShownSecond = -1;
    this.multiplierTimer = null;
    this.fruitsSliced = 0;
    this.bestGestureCombo = 0;
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

    new AnimatedBackground(this);
    // Voile sombre : atténue le décor pendant la partie pour que les fruits
    // ressortent. Au-dessus du fond animé (depths négatifs), sous les taches.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, GAME_DARKEN_COLOR, GAME_DARKEN_ALPHA)
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
    this.comboManager = new ComboManager();
    this.sliceDetector = new SliceDetector();
    this.spawnManager = new SpawnManager(this, this.fruits, this.bombs, this.scoreManager, this.mode);

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
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 1)
      .setOrigin(0)
      .setDepth(200)
      .setVisible(false)
      .setAlpha(0);

    addVignette(this);
    this.createUi();
    this.createPopupPool();
    this.createSplatPool();
    this.createFrenzyEffects();
    this.registerGameEvents();
    this.registerPointerEvents();

    if (this.mode === 'chrono') {
      this.chronoEndTime = this.time.now + CHRONO_DURATION_MS;
    }

    this.spawnManager.start();
    fadeIn(this);
  }

  update(): void {
    if (this.pause?.isPaused) {
      return;
    }
    for (const gesture of this.gestures) {
      gesture.trail.update(this.time.now);
    }
    this.updateFuseSparks();
    this.updateFrenzyAura();
    if (this.mode === 'chrono' && !this.gameEnded) {
      this.updateChrono();
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

    // Compteur UNIQUE qui suit la grenade : un popup par coup s'empilait en
    // un tas illisible, puisque la grenade est presque immobile en frénésie.
    this.frenzyCounter = this.add
      .text(0, 0, '', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(64),
        fontStyle: 'bold',
        color: '#ffd166',
        stroke: '#7a1020',
        strokeThickness: 8,
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
    if (grenade === null || !grenade.active) {
      if (this.frenzyAura.visible) {
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
    this.frenzyCounter.setPosition(grenade.x, grenade.y - grenade.sliceRadius - 14);
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
        strokeThickness: 6,
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
          strokeThickness: 6,
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
        .setDisplaySize(40, 40)
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
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setVisible(false);
      this.popupPool.push(popup);
    }
  }

  /** Affiche un texte flottant qui monte et s'estompe (recycle le pool). */
  private showPopup(x: number, y: number, message: string, color: string, fontSize: number): void {
    const popup = this.popupPool.find((p) => !p.visible);
    if (popup === undefined) {
      return; // pool saturé : on saute ce feedback plutôt que d'allouer
    }
    popup
      .setText(message)
      .setColor(color)
      .setFontSize(fontSize)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.6)
      .setVisible(true);
    this.tweens.add({
      targets: popup,
      y: y - 90,
      alpha: 0,
      scale: 1,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.setVisible(false),
    });
  }

  private registerGameEvents(): void {
    this.events.on('score-changed', this.onScoreChanged, this);
    this.events.on('lives-changed', this.onLivesChanged, this);
    this.events.on('life-gained', this.onLifeGained, this);
    this.events.on('frenzy-incoming', this.onFrenzyIncoming, this);
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
      gesture.comboCount = 0; // nouveau geste : le combo par swipe repart de zéro
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
        this.celebrateGestureCombo(gesture);
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

    // Coup critique : bonus rare et appuyé (jamais sur le combava, déjà spécial)
    const isCrit = !fruit.isBonus && Math.random() < CRIT_CHANCE;
    const comboBonus = (this.comboManager.registerSlice(now) - 1) * COMBO_BONUS_PER_STEP;
    let points = SCORE_PER_FRUIT + comboBonus;
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
      this.showPopup(fruit.x, fruit.y - 20, `CRITIQUE ! +${awarded}`, '#ffd700', 46);
      this.hitStop(HITSTOP_CRIT_MS);
      sfx.crit();
    } else {
      this.showPopup(fruit.x, fruit.y - 20, `+${awarded}`, '#ffffff', 40);
    }

    sfx.slice();
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
    const cibleX = this.scale.width / 2 + (grenade.x - this.scale.width / 2) * FRENZY_PAN_RATIO;
    const cibleY = this.scale.height / 2 + (grenade.y - this.scale.height / 2) * FRENZY_PAN_RATIO;
    this.zoomCamera(FRENZY_ZOOM, FRENZY_ZOOM_MS, 'Sine.easeOut');
    this.panCamera(cibleX, cibleY, FRENZY_ZOOM_MS, 'Sine.easeOut');
    this.setHudDimmed(true);
  }

  /** Rend la caméra à son cadrage normal (fin de frénésie). */
  private exitFrenzyZoom(): void {
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
  private zoomCamera(cible: number, dureeMs: number, ease?: string): void {
    if (prefersReducedMotion()) {
      return;
    }
    this.cameras.main.zoomTo(cible, dureeMs, ease);
  }

  /** Panoramique de caméra ; supprimé en mouvement réduit. */
  private panCamera(x: number, y: number, dureeMs: number, ease?: string): void {
    if (prefersReducedMotion()) {
      return;
    }
    this.cameras.main.pan(x, y, dureeMs, ease);
  }

  /**
   * Brève pulsation de zoom : la caméra « respire » sur un temps fort, puis
   * revient au zoom de référence — celui de la frénésie s'il est en cours,
   * sinon 1. Sans cette lecture du contexte, un combo pendant la frénésie
   * annulerait le resserrement.
   */
  private cameraPunch(force: number, dureeMs: number): void {
    const repos = this.frenzyGrenade !== null ? FRENZY_ZOOM : 1;
    this.zoomCamera(repos * force, dureeMs, 'Sine.easeOut');
    this.time.delayedCall(dureeMs, () => {
      if (this.scene.isActive()) {
        this.zoomCamera(repos, dureeMs * 1.6, 'Sine.easeInOut');
      }
    });
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
    this.showBigBanner(`${FRENESIE}\n${slashes} coups  +${awarded}`);

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
  }

  /**
   * Fin d'un geste : si le doigt a tranché GESTURE_COMBO_MIN fruits ou plus
   * dans le même swipe, on célèbre en grand (bannière centrée + bonus + son)
   * — la signature de Fruit Ninja, « couper plein de fruits d'un coup ».
   */
  private celebrateGestureCombo(gesture: SliceGesture): void {
    if (this.gameEnded || gesture.comboCount < GESTURE_COMBO_MIN) {
      return;
    }
    const n = gesture.comboCount;
    const awarded = this.scoreManager.addScore(n * GESTURE_COMBO_BONUS);
    // L'exclamation creole passe AVANT le chiffre : c'est elle qu'on lit en
    // premier, et c'est elle qui donne sa voix au jeu.
    this.showBigBanner(`${exclamationCombo(n)}\nx${n}  +${awarded}`);
    sfx.bigCombo(n);

    // Ponctuation visuelle du combo : gel bref, caméra qui respire, onde
    // partant du dernier fruit tranché, secousse croissante avec le combo.
    this.hitStop(HITSTOP_COMBO_MS);
    this.cameraPunch(COMBO_PUNCH_ZOOM, COMBO_PUNCH_MS);
    this.spawnRing(gesture.lastX, gesture.lastY, 5 + n, 0xffe066, 520);
    this.shakeCamera(120, 0.002 + Math.min(n, 6) * 0.0008);
    // Gerbe dorée le long du geste, proportionnée au nombre de fruits
    this.juiceEmitter.setParticleTint(0xffe066);
    this.juiceEmitter.emitParticleAt(gesture.lastX, gesture.lastY, JUICE_PARTICLE_COUNT * 2);
  }

  /** Bannière centrée éphémère (gros combo) : apparition en "pop" puis fondu. */
  private showBigBanner(message: string): void {
    const banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, message, {
        fontFamily: GAME_FONT,
        fontSize: fontPx(76),
        fontStyle: 'bold',
        color: '#ffe066',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
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
          delay: 350,
          duration: 350,
          onComplete: () => banner.destroy(),
        });
      },
    });
  }

  /** Combava doré tranché : score x2 temporaire + feedback doré appuyé. */
  private activateBonus(fruit: Fruit): void {
    this.scoreManager.activateMultiplier(BONUS_X2_FACTOR, BONUS_X2_DURATION_MS);
    this.showPopup(fruit.x, fruit.y - 160, 'COMBAVA DORÉ !', '#ffd700', 48);
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

    // Zoom caméra (centré → punch-in) + secousse + flash plein écran
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
    if (this.gameEnded || this.mode === 'chrono' || fruit.isBonus || fruit.isFrenzy) {
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
