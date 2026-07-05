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
