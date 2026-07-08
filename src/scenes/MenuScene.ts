import Phaser from 'phaser';
import { type GameMode, SLICE_MIN_SPEED, JUICE_PARTICLE_COUNT, TEX_JUICE, DEPTH_JUICE } from '../utils/constants';
import { getBestScore } from '../utils/bestScore';
import { sfx } from '../systems/SfxManager';
import { music } from '../systems/MusicManager';
import { FRUIT_VARIETIES, wholeTextureKey, type FruitVariety } from '../utils/fruitCatalog';
import { SliceTrail } from '../entities/SliceTrail';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { createMuteButton } from '../utils/ui';

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

    new AnimatedBackground(this);
    music.ensureRunning();

    const title = this.add
      .text(w / 2, h * 0.15, portrait ? 'Fruit Ninja\nRéunion' : 'Fruit Ninja Réunion', {
        fontFamily: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
        fontSize: '76px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#2d3a4a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    title.setAlpha(0).setY(h * 0.12);
    this.tweens.add({ targets: title, alpha: 1, y: h * 0.15, duration: 500, ease: 'Cubic.easeOut' });

    this.add
      .text(w / 2, h * (portrait ? 0.26 : 0.28), 'Tranchez un fruit pour choisir !', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '34px',
        color: '#fff3e0',
        align: 'center',
      })
      .setOrigin(0.5);

    // Emblèmes : letchi (rouge) = Classique, ananas (doré) = Chrono
    const classic = FRUIT_VARIETIES.find((v) => v.key === 'litchi') ?? FRUIT_VARIETIES[0];
    const chrono = FRUIT_VARIETIES.find((v) => v.key === 'ananas_victoria') ?? FRUIT_VARIETIES[1];

    if (portrait) {
      this.createEmblem(w / 2, h * 0.5, classic, 'classic', 'CLASSIQUE', `3 vies · Record ${getBestScore('classic')}`);
      this.createEmblem(w / 2, h * 0.74, chrono, 'chrono', 'CHRONO', `60 s · Record ${getBestScore('chrono')}`);
    } else {
      this.createEmblem(w * 0.32, h * 0.58, classic, 'classic', 'CLASSIQUE', `3 vies · Record ${getBestScore('classic')}`);
      this.createEmblem(w * 0.68, h * 0.58, chrono, 'chrono', 'CHRONO', `60 s · Record ${getBestScore('chrono')}`);
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
    createMuteButton(this, w - 52, h - 52);
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
    subtitle: string
  ): void {
    const scale = 1.7;
    const sprite = this.add
      .image(x, y, wholeTextureKey(variety))
      .setScale(scale)
      .setInteractive({ useHandCursor: true });
    // Rayon de coupe = rayon logique du fruit mis à l'échelle
    const radius = variety.radius * scale;

    // Ondulation permanente pour attirer l'œil
    this.tweens.add({
      targets: sprite,
      y: y - 12,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(x, y + radius + 16, label, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2d3a4a',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0);
    this.add
      .text(x, y + radius + 68, subtitle, {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '26px',
        color: '#fff3e0',
      })
      .setOrigin(0.5, 0);

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
    this.time.delayedCall(240, () => this.scene.start('GameScene', { mode }));
  }
}
