import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';
import { Bomb } from '../entities/Bomb';
import { ScoreManager } from './ScoreManager';
import { sfx } from './SfxManager';
import type { Mutation } from '../utils/mutations';
import {
  type GameMode,
  FRUIT_RADIUS,
  GRAVITY_Y,
  APEX_FRACTION_MIN,
  APEX_FRACTION_MAX,
  LAUNCH_VX_FACTOR,
  SPAWN_INTERVAL_START_MS,
  SPAWN_INTERVAL_MIN_MS,
  SPAWN_INTERVAL_JITTER,
  SPAWN_BREATHER_FACTOR,
  SPAWN_STAGGER_MIN_MS,
  SPAWN_STAGGER_MAX_MS,
  SPAWN_GENTLE_WAVES,
  SPAWN_WARMUP_WAVES,
  INTENSITY_RAMP_MS,
  INTENSITY_RAMP_CHRONO_MS,
  INTENSITY_RAMP_FRUITS_CHRONO,
  CHRONO_INTENSITE_DEPART,
  INTENSITY_RAMP_FRUITS,
  CELERITE_MAX,
  OVERDRIVE_RAMP_MS,
  SPAWN_INTERVAL_FLOOR_MS,
  BOMB_EVERY_FRUITS_OVERDRIVE,
  BOMB_SAFE_WAVES,
  BOMB_SAFE_TIME_MS,
  BOMB_EVERY_FRUITS_EASY,
  BOMB_EVERY_FRUITS_HARD,
  BOMB_DOUBLE_INTENSITY,
  CLUSTER_MIN_INTENSITY,
  CLUSTER_SPREAD_PX,
  CLUSTER_STAGGER_MS,
  BONUS_CHANCE,
  BONUS_SAFE_TIME_MS,
  FRENZY_SCORE_STEP,
  SEZON_PIMENT_DIVISEUR,
  FRENZY_GAP_SEZON_MS,
  FRENZY_SAFE_TIME_MS,
  FRENZY_STEP_GROWTH,
  FRENZY_MIN_GAP_MS,
  DELUGE_INTERVAL_MS,
  DELUGE_SOMMET_MIN,
  DELUGE_SOMMET_MAX,
  DELUGE_ENTREE_MIN,
  DELUGE_ENTREE_MAX,
  DELUGE_CALM_MS,
  DELUGE_TRAVEL_MIN,
  DELUGE_TRAVEL_MAX,
  CYCLONE_MIN_GAP_MS,
  CYCLONE_GAP_SAISON_MS,
  CYCLONE_MIN_GAP_CHRONO_MS,
  CYCLONE_SAFE_TIME_MS,
  CYCLONE_SAFE_TIME_CHRONO_MS,
  SPECIAL_MIN_GAP_MS,
  SIDE_SOMMET_MIN,
  SIDE_SOMMET_MAX,
  FRENZY_CROSS_FACTOR,
} from '../utils/constants';
import {
  pickRandomVariety,
  BONUS_VARIETY,
  FRENZY_VARIETY,
  CYCLONE_VARIETY,
} from '../utils/fruitCatalog';
import { rnd, rndFloat, rndBetween } from '../utils/rng';

/** Paramètres de lancement calculés une fois par spawn (objet réutilisé). */
interface LaunchParams {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

/**
 * Forme d'une salve. C'est elle qui donne son caractère au rythme :
 * - `solo`    : un fruit isolé, temps de respiration ;
 * - `duo`     : deux fruits échelonnés, l'ordinaire de la partie ;
 * - `volley`  : 3 à 4 fruits répartis sur la largeur, il faut bouger ;
 * - `cluster` : une grappe serrée, taillée pour être coupée d'un seul geste.
 */
type WaveShape = 'solo' | 'duo' | 'volley' | 'cluster';

/**
 * Poids de tirage des formes de salve, du calme au plein régime.
 * Le profil calme n'est PAS « uniquement des solos » : un début composé d'un
 * seul fruit répété devient monotone bien avant de devenir difficile. On y
 * mêle donc des duos, quelques volées et des grappes — la grappe étant même
 * plus facile qu'un duo (un seul swipe suffit), elle apporte de la variété
 * sans coûter en difficulté.
 */
const SHAPE_WEIGHTS_CALM: Record<WaveShape, number> = { solo: 52, duo: 34, volley: 8, cluster: 6 };
const SHAPE_WEIGHTS_INTENSE: Record<WaveShape, number> = {
  solo: 6,
  duo: 32,
  volley: 40,
  cluster: 22,
};
const ALL_SHAPES: WaveShape[] = ['solo', 'duo', 'volley', 'cluster'];

/**
 * Orchestration du spawn des fruits et bombes, et rythme de la partie.
 *
 * Physique : les projectiles partent du bas de l'écran avec une vélocité
 * verticale forte — la gravité (volontairement douce) leur donne un vrai
 * temps de suspension à l'apex, fenêtre de tir confortable.
 *
 * Le pacing repose sur une INTENSITÉ continue (0 → 1), et non plus sur des
 * paliers de score. Elle croît avec le temps écoulé ET avec le score (on
 * garde le plus avancé des deux), puis pilote trois leviers :
 *  1. l'intervalle entre salves (long → court, bruité pour ne pas faire
 *     métronome, et rallongé après une salve dense : la respiration) ;
 *  2. la forme de la salve (solo → grappes, cf. WaveShape) ;
 *  3. le budget de bombes (une toutes les N fruits, N décroissant).
 *
 * Les toutes premières vagues restent scriptées (un fruit, puis un ou deux)
 * pour que le joueur prenne ses marques avant que la courbe ne s'applique.
 */
export class SpawnManager {
  private timer: Phaser.Time.TimerEvent | null = null;
  private running = false;
  private startTime = 0;
  private waveIndex = 0;
  /** Fruits lancés depuis la dernière bombe : c'est le budget de menace. */
  private fruitsSinceBomb = 0;
  /** Vrai si la salve précédente était dense → la suivante laisse souffler. */
  private needsBreather = false;
  /** Prochain palier de score qui fera apparaître un piment. */
  private nextFrenzyAt = FRENZY_SCORE_STEP;
  /** Nombre de piments déjà lancés : le palier s'éloigne à chacun. */
  private frenzyCount = 0;
  /** Fin de la dernière frénésie, pour le délai plancher entre deux. */
  private lastFrenzyEndedAt = -Infinity;
  /** Mémoire de l'état précédent, pour détecter la FIN d'une frénésie. */
  private frenzyOnStage = false;
  /** Fin du déluge (0 = pas de déluge en cours). */
  private delugeUntil = 0;
  /** Dernier fruit cyclone lancé, pour tenir sa cadence d'environ une minute. */
  private lastCycloneAt = -Infinity;
  /**
   * Dernier fruit spécial QUEL QU'IL SOIT — piment ou cyclone. Les deux
   * cadences sont indépendantes ; sans ce garde-fou commun elles finissent
   * mathématiquement par coïncider, et le joueur reçoit deux frénésies coup
   * sur coup. Une seule règle pour les deux mécaniques.
   */
  private lastSpecialAt = -Infinity;
  private readonly launchParams: LaunchParams = { x: 0, y: 0, velocityX: 0, velocityY: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fruits: Phaser.Physics.Arcade.Group,
    private readonly bombs: Phaser.Physics.Arcade.Group,
    private readonly scoreManager: ScoreManager,
    private readonly mode: GameMode,
    /** Fruits tranchés depuis le début de la partie (mesure de progression). */
    private readonly fruitsSliced: () => number = () => 0,
    /**
     * La règle du jour, en Défi du jour uniquement.
     *
     * Trois des cinq mutations se jouent ici, parce que c'est ici que se décide
     * ce qui entre à l'écran et par où. Les deux autres (« une seule vie »,
     * « brume des Hauts ») n'ont rien à voir avec le semeur et vivent ailleurs.
     */
    private readonly mutation: Mutation | null = null
  ) {}

  start(): void {
    this.running = true;
    this.startTime = this.scene.time.now;
    this.waveIndex = 0;
    this.fruitsSinceBomb = 0;
    this.needsBreather = false;
    this.nextFrenzyAt = this.palierPimentBase();
    this.frenzyCount = 0;
    this.lastFrenzyEndedAt = -Infinity;
    this.frenzyOnStage = false;
    this.delugeUntil = 0;
    this.lastCycloneAt = -Infinity;
    this.lastSpecialAt = -Infinity;
    this.scheduleNextWave();
  }

  /**
   * Antidate le début de partie, pour qu'une rotation d'écran ne remette pas
   * la difficulté à zéro. Sans cela, tourner le téléphone à la cinquième
   * minute ramènerait le joueur au rythme de la première.
   */
  resumeFrom(elapsedMs: number, fruitsSliced: number): void {
    this.startTime = this.scene.time.now - elapsedMs;
    // Les vagues scriptées du début ne doivent pas se rejouer.
    this.waveIndex = Math.max(this.waveIndex, Math.round(fruitsSliced / 2));
    // La difficulté est antidatée, mais pas les fruits spéciaux : sans cela,
    // une reprise remettrait leurs compteurs à « jamais lancé » et offrirait un
    // cyclone gratuit dans la seconde. On repart d'un écart plein.
    this.lastCycloneAt = this.scene.time.now;
    this.lastSpecialAt = this.scene.time.now;
  }

  /** Vrai pendant le déluge déclenché par la papaye cyclone. */
  isDeluge(): boolean {
    return this.delugeUntil > 0 && this.scene.time.now < this.delugeUntil;
  }

  /**
   * Vrai pendant le déluge ET pendant le calme qui le suit.
   *
   * C'est cette fenêtre-là, et non `isDeluge()`, qui doit régir tout ce qui
   * PUNIT le joueur. Les fruits lancés à la dernière seconde du déluge volent
   * encore deux secondes après sa fin : s'arrêter à `isDeluge()` revenait à
   * facturer une croix pour un fruit issu de la récompense elle-même.
   *
   * Le test sur `delugeUntil > 0` n'est pas un détail : sans lui, la valeur
   * initiale de zéro rendrait ce calme vrai pendant les 2,6 premières
   * secondes de CHAQUE partie, `time.now` étant l'horloge du jeu et non celle
   * de la partie.
   */
  isDelugeCalm(): boolean {
    return this.delugeUntil > 0 && this.scene.time.now < this.delugeUntil + DELUGE_CALM_MS;
  }

  /**
   * Ouvre le déluge : cinq secondes de fruits par les côtés, sans une seule
   * bombe. C'est la récompense du piment, et c'est ce qui manquait — la
   * frénésie était une parenthèse au lieu d'être un sommet.
   *
   * La salve en attente est annulée et reprogrammée aussitôt : elle pouvait
   * être à plus d'une seconde, et ce temps mort aurait cassé l'enchaînement
   * juste après l'explosion.
   */
  startDeluge(dureeMs: number): void {
    if (!this.running) {
      return;
    }
    this.delugeUntil = this.scene.time.now + dureeMs;
    if (this.timer !== null) {
      this.timer.remove();
      this.timer = null;
    }
    this.scheduleNextWave();
  }

  stop(): void {
    this.running = false;
    this.delugeUntil = 0;
    if (this.timer !== null) {
      this.timer.remove();
      this.timer = null;
    }
  }

  /**
   * Intensité courante, de 0 (début) à 1 (plein régime).
   * Le mode Chrono ne dure que 60 s : sa rampe temporelle est bien plus
   * courte, sinon la partie se terminerait avant d'avoir décollé.
   */
  getIntensity(): number {
    const chrono = this.mode === 'chrono';
    const rampMs = chrono ? INTENSITY_RAMP_CHRONO_MS : INTENSITY_RAMP_MS;
    const byTime = (this.scene.time.now - this.startTime) / rampMs;
    // Progression du JOUEUR, mesurée en fruits tranchés et non en points :
    // le score dépend des combos, du combava et de la frénésie, donc il
    // déplaçait la difficulté à chaque rééquilibrage du barème. C'est aussi
    // la mesure de Fruit Ninja : la cadence y monte à mesure que l'on tranche.
    const cible = chrono ? INTENSITY_RAMP_FRUITS_CHRONO : INTENSITY_RAMP_FRUITS;
    const byFruits = this.fruitsSliced() / cible;
    const brut = Phaser.Math.Clamp(Math.max(byTime, byFruits), 0, 1);
    if (!chrono) {
      return brut;
    }
    // Le Chrono s'ouvre à mi-régime et monte de là : voir
    // CHRONO_INTENSITE_DEPART. La progression garde toute son amplitude, elle
    // est simplement repliée dans la moitié haute.
    return CHRONO_INTENSITE_DEPART + (1 - CHRONO_INTENSITE_DEPART) * brut;
  }

  /**
   * La célérité courante : 1 au départ, CELERITE_MAX à plein régime.
   *
   * Elle multiplie les vitesses, et la gravité suit au CARRÉ — c'est ce qui
   * garde exactement les mêmes arcs, simplement parcourus plus vite.
   */
  private celerite(): number {
    return Phaser.Math.Linear(1, CELERITE_MAX, this.getIntensity());
  }

  /**
   * La gravité EFFECTIVE du moment.
   *
   * Tous les calculs de trajectoire passent par ici et non par GRAVITY_Y :
   * viser un sommet avec la constante pendant que le monde tire plus fort
   * ferait culminer les fruits trop bas, et certains sortiraient par le côté
   * avant d'être attrapables.
   */
  private gravite(): number {
    const k = this.celerite();
    return GRAVITY_Y * k * k;
  }

  /**
   * Les vagues de découverte — un fruit, puis deux — n'existent qu'en
   * Classique. Elles apprennent le jeu à qui le découvre ; en Chrono elles
   * mangeraient les dix premières secondes d'une partie qui n'en dure que
   * soixante.
   */
  private vaguesDouces(): number {
    // -1 et non 0 : les compteurs partent de zéro, donc rendre 0 laisserait
    // encore la toute première vague en fruit unique.
    return this.mode === 'chrono' ? -1 : SPAWN_GENTLE_WAVES;
  }

  private vaguesEchauffement(): number {
    return this.mode === 'chrono' ? -1 : SPAWN_WARMUP_WAVES;
  }

  /**
   * Sur-régime : ce qui se passe APRÈS le plein régime, de 0 à 1.
   *
   * Purement temporel, et c'est voulu : une fois l'intensité saturée, la
   * partie doit continuer de durcir à un rythme prévisible, que le joueur
   * tranche beaucoup ou peu. En mode Chrono il vaut toujours zéro — 60 s de
   * jeu ne laissent pas le temps d'y entrer.
   */
  private getOverdrive(): number {
    const rampMs = this.mode === 'chrono' ? INTENSITY_RAMP_CHRONO_MS : INTENSITY_RAMP_MS;
    const apres = this.scene.time.now - this.startTime - rampMs;
    return Phaser.Math.Clamp(apres / OVERDRIVE_RAMP_MS, 0, 1);
  }

  /** Intervalle avant la prochaine salve (interpolé, bruité, respiration). */
  private getSpawnInterval(): number {
    if (this.isDeluge()) {
      return DELUGE_INTERVAL_MS;
    }
    // Pendant le calme on repasse souvent, sans rien lancer : c'est ce qui
    // permet à la partie de repartir dès la fin de la fenêtre, au lieu
    // d'attendre en plus l'intervalle ordinaire d'une seconde.
    if (this.isDelugeCalm()) {
      return 250;
    }
    const base = Phaser.Math.Linear(
      SPAWN_INTERVAL_START_MS,
      SPAWN_INTERVAL_MIN_MS,
      this.getIntensity()
    );
    // Au-delà du plein régime, l'intervalle continue de se resserrer vers un
    // plancher absolu : sans cela le jeu cessait de durcir et une bonne partie
    // n'avait plus de point de rupture.
    const serre = Phaser.Math.Linear(base, SPAWN_INTERVAL_FLOOR_MS, this.getOverdrive());
    const jitter = rndFloat(1 - SPAWN_INTERVAL_JITTER, 1 + SPAWN_INTERVAL_JITTER);
    let interval = serre * jitter;
    if (this.needsBreather) {
      interval *= SPAWN_BREATHER_FACTOR;
    }
    // Découverte : les toutes premières vagues laissent franchement respirer
    return this.waveIndex < this.vaguesDouces() ? interval + 250 : interval;
  }

  /** Tirage pondéré de la forme de salve selon l'intensité. */
  private pickShape(): WaveShape {
    if (this.waveIndex <= this.vaguesDouces()) {
      return 'solo';
    }
    if (this.waveIndex <= this.vaguesEchauffement()) {
      return rnd() < 0.5 ? 'solo' : 'duo';
    }
    const intensity = this.getIntensity();
    let total = 0;
    const weights = ALL_SHAPES.map((shape) => {
      // La grappe n'apparaît qu'une fois le joueur bien lancé : proposée trop
      // tôt, elle ressemble à une punition au lieu d'une opportunité.
      if (shape === 'cluster' && intensity < CLUSTER_MIN_INTENSITY) {
        return 0;
      }
      const w = Phaser.Math.Linear(SHAPE_WEIGHTS_CALM[shape], SHAPE_WEIGHTS_INTENSE[shape], intensity);
      total += w;
      return w;
    });

    let roll = rnd() * total;
    for (let i = 0; i < ALL_SHAPES.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return ALL_SHAPES[i];
      }
    }
    return 'duo'; // garde-fou arithmétique flottante
  }

  /** Nombre de projectiles dans la salve, selon sa forme. */
  private getWaveSize(shape: WaveShape): number {
    const intensity = this.getIntensity();
    switch (shape) {
      case 'solo':
        return 1;
      case 'duo':
        return 2;
      case 'volley':
        return intensity > 0.7 ? rndBetween(3, 4) : 3;
      case 'cluster':
        return 3 + Math.round(intensity * 2);
    }
  }

  /** Vrai quand la partie a dépassé la période d'apprentissage sans menace. */
  private bombsAllowed(): boolean {
    return (
      this.waveIndex > BOMB_SAFE_WAVES &&
      this.scene.time.now - this.startTime >= BOMB_SAFE_TIME_MS
    );
  }

  /**
   * Combien de bombes cette salve doit-elle porter ?
   * Règle empruntée à Fruit Ninja : une bombe tous les N fruits lancés, N
   * décroissant avec l'intensité. Le compteur rend la menace régulière et
   * lisible, là où un tirage par fruit produisait des trous et des rafales.
   */
  private getBombCount(shape: WaveShape, size: number): number {
    if (!this.bombsAllowed() || shape === 'cluster') {
      return 0;
    }
    const every = Math.round(
      Phaser.Math.Linear(
        Phaser.Math.Linear(BOMB_EVERY_FRUITS_EASY, BOMB_EVERY_FRUITS_HARD, this.getIntensity()),
        BOMB_EVERY_FRUITS_OVERDRIVE,
        this.getOverdrive()
      )
    );
    if (this.fruitsSinceBomb < every) {
      return 0;
    }
    const canDouble = this.getIntensity() >= BOMB_DOUBLE_INTENSITY && size >= 3;
    return canDouble && rnd() < 0.3 ? 2 : 1;
  }

  /**
   * Planifie la prochaine salve. On re-planifie après chaque salve (plutôt
   * qu'un timer en boucle) pour que l'intervalle suive la difficulté en direct.
   */
  private scheduleNextWave(): void {
    if (!this.running) {
      return;
    }
    this.timer = this.scene.time.delayedCall(this.getSpawnInterval(), () => {
      this.spawnWave();
      this.scheduleNextWave();
    });
  }

  /**
   * Une salve : forme, taille et bombes sont décidées d'un coup, puis les
   * départs sont échelonnés — chaque callback revérifie `running` pour qu'un
   * game over annule les lancers encore en attente.
   */
  private spawnWave(): void {
    // LE MONDE SUIT LA CÉLÉRITÉ. Les vitesses de lancement sont calculées avec
    // this.gravite() : si la gravité réelle du monde ne suivait pas, les arcs
    // ne culmineraient pas où on les vise. On la recale donc à chaque salve —
    // la montée est assez lente pour qu'un objet déjà en vol ne voie rien.
    this.scene.physics.world.gravity.y = this.gravite();

    // Tant qu'un piment est en scène, on suspend les lancers : la frénésie
    // doit être un moment à elle. Continuer à envoyer des fruits par-dessus
    // rendait la séquence illisible et injustement difficile.
    // La condition s'auto-libère (piment explosé ou tombé hors écran), donc
    // aucun drapeau à réinitialiser : impossible de rester bloqué.
    const frenzyEnScene = this.isFrenzyOnStage();
    if (this.frenzyOnStage && !frenzyEnScene) {
      // La frénésie vient de se terminer. On recale le palier sur le score
      // ATTEINT : sans cela, les points qu'elle vient de rapporter
      // compteraient pour le piment suivante, et une bonne frénésie en
      // réarmerait presque immédiatement une autre.
      this.lastFrenzyEndedAt = this.scene.time.now;
      this.nextFrenzyAt = this.scoreManager.getScore() + this.frenzyStep();
    }
    this.frenzyOnStage = frenzyEnScene;
    if (frenzyEnScene) {
      return;
    }

    // Le déluge remplace entièrement la salve ordinaire, et sort AVANT toute
    // la mécanique de bombes, de bonus et de piment : aucune de ces trois
    // choses ne peut donc s'y glisser.
    if (this.isDeluge()) {
      this.spawnDelugeBurst();
      return;
    }

    // Le calme : on ne lance plus rien, on laisse l'écran finir de se vider.
    // La salve suivante reprendra d'elle-même, ce compteur n'étant qu'une
    // fenêtre de temps — rien à réarmer, donc rien qui puisse rester bloqué.
    if (this.isDelugeCalm()) {
      return;
    }

    this.waveIndex += 1;
    const shape = this.pickShape();
    const size = this.getWaveSize(shape);
    const bombCount = this.getBombCount(shape, size);

    // Les bombes ne prennent jamais la première place d'une salve : le joueur
    // a besoin d'un temps de lecture avant que la menace n'entre en scène.
    const bombSlots = new Set<number>();
    const firstBombSlot = size > 1 ? 1 : 0;
    while (bombSlots.size < bombCount && bombSlots.size < size) {
      bombSlots.add(rndBetween(firstBombSlot, size - 1));
    }
    if (bombCount > 0) {
      this.fruitsSinceBomb = 0;
    }

    // Une grappe part d'une base commune : tous les fruits montent côte à côte
    const clusterBaseX =
      shape === 'cluster'
        ? rndBetween(
            FRUIT_RADIUS * 2 + CLUSTER_SPREAD_PX,
            this.scene.scale.width - FRUIT_RADIUS * 2 - CLUSTER_SPREAD_PX
          )
        : 0;
    const stagger = shape === 'cluster' ? CLUSTER_STAGGER_MS : 0;

    let delay = 0;
    for (let i = 0; i < size; i++) {
      const isBomb = bombSlots.has(i);
      if (!isBomb) {
        this.fruitsSinceBomb += 1;
      }
      // Décalage horizontal des fruits d'une grappe autour de la base
      const offsetX =
        shape === 'cluster' ? (i - (size - 1) / 2) * CLUSTER_SPREAD_PX : Number.NaN;

      if (i === 0) {
        this.spawnOne(isBomb, clusterBaseX, offsetX);
      } else {
        delay +=
          stagger > 0
            ? stagger
            : rndBetween(SPAWN_STAGGER_MIN_MS, SPAWN_STAGGER_MAX_MS);
        this.scene.time.delayedCall(delay, () => {
          // Le piment peut entrer en scène APRÈS que cette salve a été
          // décidée : maybeSpawnFrenzy est appelée à la FIN de spawnWave, alors
          // que les lancers échelonnés sont déjà programmés. Sans cette
          // vérification, les fruits ET LES BOMBES de la salve en cours
          // tombaient en pleine frénésie — exactement ce que la suspension des
          // salves cherchait à éviter.
          if (this.running && !this.isFrenzyOnStage()) {
            this.spawnOne(isBomb, clusterBaseX, offsetX);
          }
        });
      }
    }

    // Une salve dense se paie d'un temps mort : c'est la respiration
    this.needsBreather = shape === 'volley' || shape === 'cluster';
    this.maybeSpawnBonus();
    this.maybeSpawnCyclone();
    this.maybeSpawnFrenzy();
  }

  /**
   * Piment de frénésie : déclenchée par PALIER DE SCORE (et non au hasard),
   * comme le pomegranate de Fruit Ninja. Elle récompense donc la progression
   * et arrive à un moment que le joueur finit par anticiper.
   */
  private maybeSpawnFrenzy(): void {
    if (this.scene.time.now - this.startTime < FRENZY_SAFE_TIME_MS) {
      return;
    }
    // Délai plancher en temps réel. C'est la seule garantie qu'un joueur qui
    // marque plus vite que prévu ne puisse pas déborder : un palier de score,
    // aussi haut soit-il, finit toujours par être atteint plus tôt.
    const gapPiment =
      this.mutation?.id === 'sezon-piment' ? FRENZY_GAP_SEZON_MS : FRENZY_MIN_GAP_MS;
    if (this.scene.time.now - this.lastFrenzyEndedAt < gapPiment) {
      return;
    }
    if (this.scoreManager.getScore() < this.nextFrenzyAt) {
      return;
    }
    // Un seul fruit spécial à la fois, et jamais deux coup sur coup : la
    // piment et le cyclone se partagent ce délai plancher.
    if (this.scene.time.now - this.lastSpecialAt < SPECIAL_MIN_GAP_MS) {
      return;
    }
    if (this.isFrenzyOnStage() || this.isCycloneOnStage() || this.isDeluge()) {
      return;
    }
    const piment = this.fruits.get() as Fruit | null;
    if (piment === null) {
      return; // pool plein : on retentera à la salve suivante, palier conservé
    }
    this.frenzyCount += 1;
    // Palier provisoire : il sera recalé sur le score réel à la fin de la
    // frénésie. Le poser dès maintenant évite qu'un échec de tir (pool plein)
    // laisse le seuil derrière le score.
    this.nextFrenzyAt = this.scoreManager.getScore() + this.frenzyStep();
    // Le délai plancher démarre dès le LANCEMENT, pas seulement à la fin.
    // La fin est détectée au tic de salve suivant ; si une frénésie très
    // courte tombait entre deux tics, la transition serait manquée et rien
    // n'espacerait plus les piments. Repartir du lancement rend le plancher
    // vrai dans tous les cas, et il ne fait que se décaler ensuite.
    this.lastFrenzyEndedAt = this.scene.time.now;
    this.lastSpecialAt = this.scene.time.now;
    const p = this.computeSideLaunch(FRENZY_VARIETY.radius);
    piment.launchAs(FRENZY_VARIETY, false, p.x, p.y, p.velocityX, p.velocityY, true);
    sfx.launch();
    this.scene.events.emit('frenzy-incoming', piment);
  }

  /**
   * La papaye cyclone : un seul coup de sabre, et le déluge commence.
   *
   * Sa cadence est PUREMENT TEMPORELLE, là où le piment est déclenché par
   * un palier de score. Les deux règles sont volontairement différentes :
   * le piment récompense la performance, donc il suit le score ; le
   * cyclone est un cadeau, donc il suit l'horloge et arrive même au joueur
   * qui rame. C'est cette différence qui justifie d'avoir deux fruits.
   *
   * Elle entre par le côté comme le piment, mais elle ne se fige pas : elle
   * TRAVERSE. Il faut aller la chercher, c'est ce qui fait sa valeur.
   */
  private maybeSpawnCyclone(): void {
    const chrono = this.mode === 'chrono';
    const depuisDebut = this.scene.time.now - this.startTime;
    if (depuisDebut < (chrono ? CYCLONE_SAFE_TIME_CHRONO_MS : CYCLONE_SAFE_TIME_MS)) {
      return;
    }
    // SAISON CYCLONE : quinze secondes au lieu d'une minute. C'est la seule
    // mutation qui RELÈVE l'objectif du jour (cf. mutations.ts) : elle offre
    // bien plus de points qu'elle n'en coûte.
    const ecart =
      this.mutation?.id === 'saison-cyclone'
        ? CYCLONE_GAP_SAISON_MS
        : chrono
          ? CYCLONE_MIN_GAP_CHRONO_MS
          : CYCLONE_MIN_GAP_MS;
    if (this.scene.time.now - this.lastCycloneAt < ecart) {
      return;
    }
    if (this.scene.time.now - this.lastSpecialAt < SPECIAL_MIN_GAP_MS) {
      return;
    }
    if (this.isFrenzyOnStage() || this.isCycloneOnStage() || this.isDeluge()) {
      return;
    }
    const cyclone = this.fruits.get() as Fruit | null;
    if (cyclone === null) {
      return; // pool plein : on retentera à la salve suivante
    }
    this.lastCycloneAt = this.scene.time.now;
    this.lastSpecialAt = this.scene.time.now;
    // TROIS ENTRÉES POSSIBLES, tirées au sort : la gauche, la droite, ou le
    // bas comme n'importe quel fruit. Avec les seuls côtés, l'œil finissait
    // par n'attendre le cyclone qu'aux bords — et la surprise, qui est tout
    // son intérêt, s'usait. Le bas le rend imprévisible sans le rendre injuste,
    // puisqu'il reste le plus gros et le seul à porter un halo.
    const parLeBas = rnd() < 0.34;
    const p = parLeBas
      ? this.computeCycloneFromBottom()
      : // 0,85 de la largeur : il traverse franchement sans jamais devenir
        // inattrapable — il reste environ deux secondes à l'écran.
        this.computeSideLaunch(CYCLONE_VARIETY.radius, 0.85);
    cyclone.launchAs(CYCLONE_VARIETY, false, p.x, p.y, p.velocityX, p.velocityY, false, true);
    sfx.launch();
    this.scene.events.emit('cyclone-incoming', cyclone);
  }

  /**
   * Le cyclone lancé par le BAS, comme un fruit ordinaire.
   *
   * Son arc est calculé sur le même principe que partout ailleurs : on vise
   * un SOMMET, jamais une montée, pour qu'il ne sorte pas par le haut. Il
   * monte plus haut qu'un fruit banal et dérive moins, de façon à rester
   * atteignable — c'est un cadeau, il ne doit pas être une loterie.
   */
  private computeCycloneFromBottom(): LaunchParams {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const p = this.launchParams;
    const rayon = CYCLONE_VARIETY.radius;

    // Jamais collé à un bord : il faut la place de l'attraper des deux côtés.
    p.x = rndBetween(Math.round(width * 0.2), Math.round(width * 0.8));
    p.y = height + rayon;
    const sommet = height * rndFloat(SIDE_SOMMET_MIN, SIDE_SOMMET_MAX);
    p.velocityY = -Math.sqrt(2 * this.gravite() * (p.y - sommet));
    // Dérive douce vers le centre, comme les grappes : il reste dans le champ.
    p.velocityX = (p.x < width / 2 ? 1 : -1) * width * rndFloat(0.05, 0.12) * this.celerite();
    return p;
  }

  /** Vrai tant qu'une papaye cyclone est en vol (parcours du pool). */
  private isCycloneOnStage(): boolean {
    const children = this.fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const fruit = children[i] as Fruit;
      if (fruit.active && fruit.isCyclone) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lancement latéral, réservé au piment : il entre par un BORD de l'écran
   * et le traverse en arc, au lieu de jaillir du bas comme tout le monde.
   * Cette trajectoire à part est le premier signal que ce fruit n'est pas un
   * fruit ordinaire — on le repère avant même de l'avoir identifié.
   */
  private computeSideLaunch(radius: number, traverse = Number.NaN): LaunchParams {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const p = this.launchParams;
    const fromLeft = rnd() < 0.5;

    p.x = fromLeft ? -radius : width + radius;
    p.y = height * rndFloat(0.64, 0.78);
    // Arc ample : elle monte franchement puis redescend, ce qui lui donne
    // près de deux secondes de présence utile à l'écran. Le sommet est visé
    // directement, donc il ne sort jamais par le haut.
    const sommet = height * rndFloat(SIDE_SOMMET_MIN, SIDE_SOMMET_MAX);
    p.velocityY = -Math.sqrt(2 * this.gravite() * Math.max(p.y - sommet, height * 0.2));
    if (Number.isNaN(traverse)) {
      // Le piment : il n'a pas besoin de traverser, on l'attrape au vol et il
      // se cale de lui-même au premier coup (cf. settlePiment).
      p.velocityX = (fromLeft ? 1 : -1) * width * FRENZY_CROSS_FACTOR * this.celerite();
    } else {
      // Le cyclone : il traverse pour de bon, donc sa vitesse se déduit de la
      // distance voulue et de sa durée de vol réelle.
      const vol = this.dureeDeVol(p.y, p.velocityY, height + radius);
      p.velocityX = ((fromLeft ? 1 : -1) * width * traverse) / vol;
    }
    return p;
  }

  /**
   * Une bouffée du déluge : un ou deux fruits entrant par un bord.
   *
   * Les deux côtés alternent par tirage plutôt que strictement : une
   * alternance régulière se lit comme un métronome au bout de trois salves.
   * L'arc et la vitesse de traversée varient aussi, sinon tous les fruits
   * suivent la même parabole et un seul geste les prend tous — ce qui serait
   * généreux, mais sans intérêt.
   */
  private spawnDelugeBurst(): void {
    const combien = rnd() < 0.55 ? 1 : 2;
    for (let i = 0; i < combien; i++) {
      const fruit = this.fruits.get() as Fruit | null;
      if (fruit === null) {
        return; // pool épuisé : on renonce plutôt que d'allouer en pleine action
      }
      const width = this.scene.scale.width;
      const height = this.scene.scale.height;
      const depuisGauche = rnd() < 0.5;
      const variete = pickRandomVariety();
      const x = depuisGauche ? -variete.radius : width + variete.radius;
      const y = height * rndFloat(DELUGE_ENTREE_MIN, DELUGE_ENTREE_MAX);
      // On vise un SOMMET, pas une montée : le point le plus haut du vol est
      // ainsi garanti dans l'écran (cf. DELUGE_SOMMET_MIN dans constants.ts).
      const sommet = height * rndFloat(DELUGE_SOMMET_MIN, DELUGE_SOMMET_MAX);
      const vy = -Math.sqrt(2 * this.gravite() * Math.max(y - sommet, height * 0.12));
      // La vitesse horizontale se DÉDUIT de la distance qu'on veut lui faire
      // parcourir : le fruit traverse vraiment l'écran, quel que soit l'arc
      // qui vient d'être tiré (cf. DELUGE_TRAVEL_MIN dans constants.ts).
      const vol = this.dureeDeVol(y, vy, height + variete.radius);
      const distance = width * rndFloat(DELUGE_TRAVEL_MIN, DELUGE_TRAVEL_MAX);
      const vx = ((depuisGauche ? 1 : -1) * distance) / vol;
      fruit.launchAs(variete, false, x, y, vx, vy);
    }
    sfx.launch();
  }

  /**
   * Durée de vol d'un projectile, de `y0` jusqu'à la ligne `yFin`.
   *
   * Racine positive de y0 + vy0·t + ½·g·t² = yFin. `vy0` étant négatif (le
   * fruit monte) et `yFin` sous le point de départ, le discriminant est
   * toujours positif : pas de cas dégénéré à traiter.
   */
  private dureeDeVol(y0: number, vy0: number, yFin: number): number {
    const c = y0 - yFin;
    return (-vy0 + Math.sqrt(vy0 * vy0 - 2 * this.gravite() * c)) / this.gravite();
  }

  /**
   * Écart de score jusqu'à la prochaine piment. Il s'éloigne à chaque
   * frénésie, parce que le joueur marque de plus en plus vite : à palier
   * constant, le piment se rapprocherait dans le temps sans jamais que rien
   * ne le demande.
   */
  private frenzyStep(): number {
    return Math.round(this.palierPimentBase() * (1 + this.frenzyCount * FRENZY_STEP_GROWTH));
  }

  /**
   * Le palier de score qui appelle un piment.
   *
   * SÉZON PIMENT le divise par trois. Agir sur le palier plutôt que d'ajouter
   * un tirage au sort garde intacte la propriété qui fait tout l'intérêt du
   * piment : il arrive à un moment que le joueur finit par anticiper, et non
   * quand le hasard le décide.
   */
  private palierPimentBase(): number {
    return this.mutation?.id === 'sezon-piment'
      ? FRENZY_SCORE_STEP / SEZON_PIMENT_DIVISEUR
      : FRENZY_SCORE_STEP;
  }

  /** Vrai tant qu'un piment de frénésie est en jeu (parcours du pool). */
  private isFrenzyOnStage(): boolean {
    const children = this.fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const fruit = children[i] as Fruit;
      if (fruit.active && fruit.isFrenzy) {
        return true;
      }
    }
    return false;
  }

  private spawnOne(isBomb: boolean, clusterBaseX: number, offsetX: number): void {
    if (isBomb) {
      this.spawnBomb();
    } else {
      this.spawnFruit(clusterBaseX, offsetX);
    }
  }

  /** Tente un combava doré : rare, pas en début de partie, unique à l'écran. */
  private maybeSpawnBonus(): void {
    if (this.scene.time.now - this.startTime < BONUS_SAFE_TIME_MS) {
      return;
    }
    if (rnd() >= BONUS_CHANCE) {
      return;
    }
    // Un seul combava actif à la fois pour préserver sa rareté
    const children = this.fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const fruit = children[i] as Fruit;
      if (fruit.active && fruit.isBonus) {
        return;
      }
    }
    const bonus = this.fruits.get() as Fruit | null;
    if (bonus === null) {
      return;
    }
    const p = this.computeLaunch();
    bonus.launchAs(BONUS_VARIETY, true, p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }

  /**
   * Calcule position et vélocités de lancement dans un objet réutilisé,
   * à partir de la taille COURANTE de l'écran (responsive) :
   * - départ juste sous le bord bas ;
   * - vélocité verticale telle que l'apex atteigne une fraction de la hauteur
   *   (v = √(2·g·apex)) — les arcs remplissent l'écran en portrait comme en
   *   paysage sans jamais sortir par le haut ;
   * - vélocité horizontale orientée vers le centre, proportionnelle à la
   *   largeur, pour que la parabole reste dans l'écran.
   *
   * Pour une grappe (`offsetX` défini), le fruit part d'une position calée sur
   * la base commune et monte quasi verticalement : les fruits restent alignés
   * en vol, donc coupables d'un seul swipe horizontal.
   */
  private computeLaunch(baseX = Number.NaN, offsetX = Number.NaN): LaunchParams {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const p = this.launchParams;
    const isCluster = !Number.isNaN(offsetX);

    p.x = isCluster
      ? Phaser.Math.Clamp(baseX + offsetX, FRUIT_RADIUS, width - FRUIT_RADIUS)
      : rndBetween(FRUIT_RADIUS * 2, width - FRUIT_RADIUS * 2);
    p.y = height + FRUIT_RADIUS;

    // Grappe : apex quasi identique pour tous → ils culminent ensemble
    const apex = isCluster
      ? 0.8 * height
      : rndFloat(APEX_FRACTION_MIN, APEX_FRACTION_MAX) * height;
    p.velocityY = -Math.sqrt(2 * this.gravite() * apex);

    if (isCluster) {
      // Dérive commune et faible : la grappe reste groupée
      p.velocityX = (baseX < width / 2 ? 1 : -1) * width * 0.04 * this.celerite();
    } else {
      const towardCenter = p.x < width / 2 ? 1 : -1;
      p.velocityX = towardCenter * rndBetween(20, Math.round(width * LAUNCH_VX_FACTOR)) * this.celerite();
    }
    return p;
  }

  private spawnFruit(baseX = Number.NaN, offsetX = Number.NaN): void {
    // get() récupère un objet inactif du pool (ou en crée un si le pool n'est pas plein)
    const fruit = this.fruits.get() as Fruit | null;
    if (fruit === null) {
      return; // pool épuisé : on saute ce spawn plutôt que d'allouer
    }
    // ALÉ-RETOUR : tout entre par les bords, plus rien ne monte du bas. On
    // réutilise la trajectoire traversante du cyclone, avec une distance tirée
    // au hasard — à traversée fixe, tous les fruits suivraient la même parabole
    // et un seul geste les prendrait tous.
    const p =
      this.mutation?.id === 'ale-retour'
        ? this.computeSideLaunch(FRUIT_RADIUS, rndFloat(0.55, 1.05))
        : this.computeLaunch(baseX, offsetX);
    fruit.launchAs(pickRandomVariety(), false, p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }

  private spawnBomb(): void {
    const bomb = this.bombs.get() as Bomb | null;
    if (bomb === null) {
      return;
    }
    const p = this.computeLaunch();
    bomb.launch(p.x, p.y, p.velocityX, p.velocityY);
    sfx.launch();
  }
}
