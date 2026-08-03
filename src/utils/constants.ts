/**
 * Constantes globales du jeu.
 * Toutes les valeurs de gameplay ajustables sont centralisées ici
 * pour faciliter l'équilibrage.
 */

// Résolutions logiques : le jeu suit l'orientation du device (responsive).
// Phaser met à l'échelle via Scale.FIT et bascule entre ces deux formats à la
// rotation du téléphone (voir utils/viewport.ts et main.ts).
export const PORTRAIT_WIDTH = 720;
export const PORTRAIT_HEIGHT = 1280;
export const LANDSCAPE_WIDTH = 1280;
export const LANDSCAPE_HEIGHT = 720;

// Physique — gravité douce pour un vrai temps de suspension à l'apex
// (façon Fruit Ninja : le fruit "flotte" un instant, fenêtre de tir confortable).
// Pour une hauteur d'apex donnée, la durée de vol varie en 1/√g : baisser la
// gravité ralentit les fruits SANS changer la hauteur qu'ils atteignent.
export const GRAVITY_Y = 820;

// Lancement des fruits : la vélocité verticale est calculée à chaque spawn pour
// que l'apex atteigne cette fraction de la HAUTEUR COURANTE — les arcs s'adaptent
// donc automatiquement au portrait (écran haut) comme au paysage (écran large).
export const APEX_FRACTION_MIN = 0.72;
export const APEX_FRACTION_MAX = 0.9;
// Vélocité horizontale max = cette fraction de la LARGEUR courante (vers le centre).
export const LAUNCH_VX_FACTOR = 0.2;

// Spawn
export const SPAWN_INTERVAL_START_MS = 1400; // intervalle entre deux salves au début
// Plancher volontairement haut : depuis que les salves sont des volées et des
// grappes (et non plus 2-4 fruits tirés au hasard), un intervalle court
// produisait des pics à 4 fruits/seconde — injouable en Classique où chaque
// fruit manqué coûte une vie.
export const SPAWN_INTERVAL_MIN_MS = 750; // intervalle plancher (difficulté max)
// Échelonnement des lancers d'une même salve (jamais simultanés)
export const SPAWN_STAGGER_MIN_MS = 80;
export const SPAWN_STAGGER_MAX_MS = 150;
// Courbe d'introduction façon Fruit Ninja :
// vagues 1-3 : un seul fruit • vagues 4-8 : 1 à 2 fruits • ensuite : salves
export const SPAWN_GENTLE_WAVES = 3;
export const SPAWN_WARMUP_WAVES = 8;
export const BOMB_SAFE_WAVES = 8; // aucune bombe avant la 9e vague

// ------------------------------------------------------------------
// Rythme de partie : courbe de difficulté CONTINUE
// ------------------------------------------------------------------
// Une « intensité » de 0 à 1 pilote tout : intervalle entre salves,
// composition des salves et fréquence des bombes. Deux moteurs, on garde le
// plus avancé des deux — le TEMPS (la partie s'emballe même si le joueur
// marque peu) et le SCORE (un bon joueur accélère lui-même la montée).
// L'ancien système par paliers de score sautait d'un cran entier sur un seul
// coup critique : l'accélération paraissait arbitraire.
export const INTENSITY_RAMP_MS = 260_000; // Classique : plein régime vers 4 min 20
export const INTENSITY_RAMP_CHRONO_MS = 55_000; // Chrono (60 s) : montée plus vive
export const INTENSITY_RAMP_SCORE = 4200; // score suffisant pour saturer l'intensité

// Intervalle bruité de ±18 % : sans ça le spawn est un métronome, et l'oreille
// comme l'œil s'y habituent — le jeu perd toute tension.
export const SPAWN_INTERVAL_JITTER = 0.18;
// Respiration : après une salve dense, la suivante se fait attendre.
// C'est l'alternance tension/relâchement qui crée un rythme.
export const SPAWN_BREATHER_FACTOR = 1.55;

// Bombes : budget DÉTERMINISTE façon Fruit Ninja (une bombe toutes les N
// fruits lancés) au lieu d'un dé par fruit. Le hasard pur produisait des
// séquences injustes (trois bombes coup sur coup) ou des parties sans menace.
export const BOMB_EVERY_FRUITS_EASY = 10; // début de partie
export const BOMB_EVERY_FRUITS_HARD = 5; // intensité maximale
export const BOMB_DOUBLE_INTENSITY = 0.8; // au-delà, une salve peut porter 2 bombes

// Grappes : plusieurs fruits lancés côte à côte et quasi simultanément, pour
// qu'UN seul swipe puisse tous les trancher. Le combo devient un objectif de
// design offert au joueur, plus un coup de chance. Jamais de bombe dedans :
// une grappe invite au grand geste, y cacher une bombe serait un piège.
export const CLUSTER_MIN_INTENSITY = 0.35;
// Écart supérieur au diamètre d'un gros fruit : sinon la grappe se chevauche
// et ne se lit plus comme une rangée à trancher.
export const CLUSTER_SPREAD_PX = 125; // écart horizontal entre deux fruits de grappe
export const CLUSTER_STAGGER_MS = 45; // départs très rapprochés

// Vie regagnée tous les N points (façon « extra life » de Fruit Ninja) :
// une croix de strike s'efface. Si les 3 vies sont intactes, le palier
// rapporte des points à la place — un bonus ne doit jamais tomber à plat.
export const EXTRA_LIFE_SCORE_STEP = 1000;
export const EXTRA_LIFE_FALLBACK_POINTS = 50;

// ------------------------------------------------------------------
// La grenade : le fruit rare qui déclenche un gros combo
// ------------------------------------------------------------------
// Reprise du « pomegranate » de Fruit Ninja. Elle apparaît à des paliers de
// score, se fige en l'air à la première coupe, puis on la tranche autant de
// fois que possible pendant quelques secondes avant qu'elle n'éclate : chaque
// coup rapporte, et l'explosion emporte tous les fruits à l'écran.
export const FRENZY_SCORE_STEP = 700; // un palier de score = une grenade
export const FRENZY_SAFE_TIME_MS = 15_000; // jamais en tout début de partie
export const FRENZY_DURATION_MS = 4000; // durée de la frénésie une fois amorcée
export const FRENZY_HIT_COOLDOWN_MS = 70; // borne le compteur (~14 coups/s max)
export const FRENZY_POINTS_PER_SLASH = 5;
// Zone où la grenade vient se caler à la première coupe, en fraction de la
// hauteur : assez haut pour ne pas gêner le HUD, assez bas pour rester à portée.
export const FRENZY_ZONE_TOP = 0.28;
export const FRENZY_ZONE_BOTTOM = 0.68;
export const FRENZY_SETTLE_MARGIN = 24; // marge au bord, en plus du rayon
export const FRENZY_BOB_PX = 12; // amplitude du flottement sur place
// Entrée latérale : la grenade traverse l'écran depuis un bord, en arc.
export const FRENZY_APEX_FRACTION = 0.55; // hauteur de l'arc, en fraction d'écran
export const FRENZY_CROSS_FACTOR = 0.14; // vitesse de traversée, en fraction de largeur

// Halo et ondes de choc : le vocabulaire visuel réservé à la grenade
export const TEX_RING = 'ring';
export const RING_POOL_SIZE = 8;
export const DEPTH_FRENZY_AURA = 4; // sous les moitiés (5) et les fruits (6)
export const FRENZY_AURA_SCALE = 2.8; // taille du halo, en multiples du rayon

// Découpe
export const SLICE_BUFFER_SIZE = 12; // nb max de points conservés pour la traînée
export const SLICE_POINT_MAX_AGE_MS = 200; // durée de vie d'un point de traînée
export const SLICE_MIN_SPEED = 0.35; // vitesse min du geste (px/ms) pour qu'une coupe soit valide
export const TRAIL_MAX_HALF_WIDTH = 9; // demi-largeur du ruban de lame à la pointe (px)

// Fruits
export const FRUIT_RADIUS = 62; // rayon du placeholder et du cercle de collision
export const HALF_LIFETIME_MS = 1000; // durée avant disparition des moitiés coupées
export const FRUIT_POOL_SIZE = 24;
export const HALF_POOL_SIZE = 48;

// Score & vies
export const SCORE_PER_FRUIT = 10;
export const STARTING_LIVES = 3;

// Fenêtre de combo (Phase 2) : délai max entre deux coupes pour chaîner un combo
export const COMBO_WINDOW_MS = 300;

// Couleur de la traînée de coupe
export const COLOR_TRAIL = 0xffffff;

// ------------------------------------------------------------------
// Phase 2 — Feel & polish
// ------------------------------------------------------------------

/** Modes de jeu disponibles. */
export type GameMode = 'classic' | 'chrono';

/** Cause de fin de partie (affichage adapté sur l'écran de fin). */
export type GameOverReason = 'lives' | 'bomb' | 'time';

// Bombes
export const TEX_BOMB = 'bomb';
export const BOMB_RADIUS = 64; // suit l'agrandissement des fruits (×1,2)
export const BOMB_POOL_SIZE = 8;
export const BOMB_SAFE_TIME_MS = 5000; // aucune bombe dans les premières secondes
export const BOMB_GAMEOVER_DELAY_MS = 700; // durée du flash avant l'écran de fin

// Particules de jus
export const TEX_JUICE = 'juice';
export const JUICE_PARTICLE_COUNT = 14;

// Éclaboussures persistantes sur le décor (Étape 1 du polish "feel")
export const TEX_SPLAT_PREFIX = 'splat_';
export const SPLAT_VARIANTS = 3; // nb de formes de taches générées
export const SPLAT_POOL_SIZE = 12;
export const SPLAT_FADE_MS = 7000; // durée avant disparition complète d'une tache

// Assombrissement du décor pendant la partie : voile sombre translucide
// qui désature/atténue le fond pour que les fruits claquent visuellement
// (le décor complet reste éclatant au menu). Étape 3 du polish "feel".
export const GAME_DARKEN_COLOR = 0x0a1a26;
export const GAME_DARKEN_ALPHA = 0.4;

// Profondeurs de rendu (depth) : fond 0 < voile < taches < moitiés < fruits < jus < UI
export const DEPTH_DARKEN = 1;
export const DEPTH_SPLAT = 2;
export const DEPTH_HALF = 5;
export const DEPTH_FRUIT = 6;
export const DEPTH_JUICE = 40;

// Combo : points bonus par coupe supplémentaire dans la fenêtre COMBO_WINDOW_MS
export const COMBO_BONUS_PER_STEP = 5;

// Mode Chrono
export const CHRONO_DURATION_MS = 60_000;

// Pool de textes de feedback flottants (+10, Combo x2…)
export const POPUP_POOL_SIZE = 10;

// ------------------------------------------------------------------
// Phase 3 — Contenu réunionnais
// ------------------------------------------------------------------

// Fruit bonus (combava doré) : score x2 temporaire
export const BONUS_CHANCE = 0.035; // probabilité par salve de tenter un combava
export const BONUS_SAFE_TIME_MS = 10_000; // pas de bonus en tout début de partie
export const BONUS_X2_FACTOR = 2;
export const BONUS_X2_DURATION_MS = 5000;

// ------------------------------------------------------------------
// Étape 4 — Théâtralité
// ------------------------------------------------------------------

// Drame de la bombe : zoom caméra + ralenti (bullet-time) au moment fatal
export const BOMB_ZOOM = 1.5;
export const BOMB_ZOOM_MS = 500;
export const BOMB_PHYSICS_SLOWMO = 2.4; // timeScale Arcade (>1 = plus lent) sur les fruits en vol
// Mèche qui crépite : étincelles émises au bout de la mèche des bombes en vol
export const FUSE_SPARK_TINT = 0xffb347;
export const FUSE_SPARK_EVERY = 2; // une salve d'étincelles toutes N frames

// Coups critiques : une coupe sur ~11 rapporte gros, avec feedback appuyé
export const CRIT_CHANCE = 0.09;
export const CRIT_MULTIPLIER = 3;

// Combo par geste : nombre de fruits tranchés dans UN même swipe (façon
// Fruit Ninja). Célébré en grand à partir du seuil, avec bonus par fruit.
export const GESTURE_COMBO_MIN = 3;
export const GESTURE_COMBO_BONUS = 15;

// ------------------------------------------------------------------
// Fond animé
// ------------------------------------------------------------------
export const TEX_GLOW = 'glow';
export const TEX_CLOUD = 'cloud';
// Position du soleil (fraction de l'écran) — partagée entre le décor baké
// et le halo animé pour qu'ils coïncident dans les deux orientations.
export const SUN_FRAC_X = 0.66;
export const SUN_FRAC_Y = 0.52;
export const BG_CLOUD_COUNT = 5;
// Profondeurs du fond animé (sous tout le reste, sous le voile sombre)
export const DEPTH_BG_BASE = -20;
export const DEPTH_BG_GLOW = -18;
export const DEPTH_BG_CLOUD = -16;
export const DEPTH_BG_MOTE = -14;

// ------------------------------------------------------------------
// Polish visuel global
// ------------------------------------------------------------------
// Vignettage : cadre sombre discret sur les bords → rendu cinématique
export const TEX_VIGNETTE = 'vignette';
export const DEPTH_VIGNETTE = 45; // au-dessus du jeu et du jus, sous le HUD (50)
// HUD en cartouches translucides arrondis
export const HUD_PANEL_COLOR = 0x0b2a3a;
export const HUD_PANEL_ALPHA = 0.4;
