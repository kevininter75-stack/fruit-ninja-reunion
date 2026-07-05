/**
 * Constantes globales du jeu.
 * Toutes les valeurs de gameplay ajustables sont centralisées ici
 * pour faciliter l'équilibrage.
 */

// Résolution logique du jeu (portrait, mobile-first).
// Phaser met à l'échelle via Scale.FIT, donc ces valeurs sont une base de calcul stable.
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// Physique
export const GRAVITY_Y = 1400;

// Lancement des fruits (vélocités initiales)
export const LAUNCH_VELOCITY_Y_MIN = -1550;
export const LAUNCH_VELOCITY_Y_MAX = -1750;
export const LAUNCH_VELOCITY_X_MAX = 260; // vélocité horizontale max (vers le centre)

// Spawn
export const SPAWN_INTERVAL_START_MS = 1400; // intervalle entre deux salves au début
export const SPAWN_INTERVAL_MIN_MS = 550; // intervalle plancher (difficulté max)
export const SPAWN_SCORE_STEP = 500; // palier de score qui augmente la difficulté
export const SPAWN_INTERVAL_DECREMENT_MS = 150; // réduction d'intervalle par palier
export const SPAWN_MAX_FRUITS_PER_WAVE_START = 1;
export const SPAWN_MAX_FRUITS_PER_WAVE_CAP = 4;

// Découpe
export const SLICE_BUFFER_SIZE = 10; // nb max de points conservés pour la traînée
export const SLICE_POINT_MAX_AGE_MS = 180; // durée de vie d'un point de traînée
export const SLICE_MIN_SPEED = 0.35; // vitesse min du geste (px/ms) pour qu'une coupe soit valide

// Fruits
export const FRUIT_RADIUS = 52; // rayon du placeholder et du cercle de collision
export const HALF_LIFETIME_MS = 1000; // durée avant disparition des moitiés coupées
export const FRUIT_POOL_SIZE = 24;
export const HALF_POOL_SIZE = 48;

// Score & vies
export const SCORE_PER_FRUIT = 10;
export const STARTING_LIVES = 3;

// Fenêtre de combo (Phase 2) : délai max entre deux coupes pour chaîner un combo
export const COMBO_WINDOW_MS = 300;

// Couleurs de la direction artistique (dégradé tropical)
export const COLOR_SKY_TOP = 0x1e90b4; // bleu lagon
export const COLOR_SKY_BOTTOM = 0xf2803c; // orange coucher de soleil
export const COLOR_MOUNTAIN = 0x2d3a4a; // silhouette volcanique
export const COLOR_TRAIL = 0xffffff;

// Clés de textures placeholder
export const TEX_FRUIT_WHOLE = 'litchi_whole';
export const TEX_FRUIT_HALF_LEFT = 'litchi_half_left';
export const TEX_FRUIT_HALF_RIGHT = 'litchi_half_right';

// ------------------------------------------------------------------
// Phase 2 — Feel & polish
// ------------------------------------------------------------------

/** Modes de jeu disponibles. */
export type GameMode = 'classic' | 'chrono';

/** Cause de fin de partie (affichage adapté sur l'écran de fin). */
export type GameOverReason = 'lives' | 'bomb' | 'time';

// Bombes
export const TEX_BOMB = 'bomb';
export const BOMB_RADIUS = 54;
export const BOMB_POOL_SIZE = 8;
export const BOMB_CHANCE_BASE = 0.07; // probabilité qu'un spawn soit une bombe (début de partie)
export const BOMB_CHANCE_PER_TIER = 0.015; // augmentation par palier de difficulté
export const BOMB_CHANCE_CAP = 0.16; // plafond : la bombe ne doit jamais devenir injuste
export const BOMB_SAFE_TIME_MS = 5000; // aucune bombe dans les premières secondes
export const BOMB_GAMEOVER_DELAY_MS = 700; // durée du flash avant l'écran de fin

// Particules de jus
export const TEX_JUICE = 'juice';
export const JUICE_PARTICLE_COUNT = 14;

// Combo : points bonus par coupe supplémentaire dans la fenêtre COMBO_WINDOW_MS
export const COMBO_BONUS_PER_STEP = 5;

// Mode Chrono
export const CHRONO_DURATION_MS = 60_000;

// Pool de textes de feedback flottants (+10, Combo x2…)
export const POPUP_POOL_SIZE = 10;
