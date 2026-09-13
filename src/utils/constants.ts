// ------------------------------------------------------------------
// Échelle de rendu
// ------------------------------------------------------------------

/**
 * Facteur multipliant la résolution LOGIQUE du jeu.
 *
 * Pourquoi il existe : dans Phaser 3, le tampon de rendu vaut exactement la
 * taille logique du jeu — vérifié dans les sources, `baseSize` est recopié de
 * `gameSize` et c'est lui qui fixe `canvas.width`. Le réglage `zoom` ne touche
 * que la taille CSS. Autrement dit, la seule façon d'obtenir plus de pixels
 * est d'agrandir la résolution logique.
 *
 * Sans ça, un jeu en 720×1280 affiché sur un écran de 1440 px de large est
 * étiré du simple au double par le navigateur. C'était, et de loin, le premier
 * facteur de flou — devant la qualité des fruits eux-mêmes.
 *
 * Le facteur se déduit de la taille PHYSIQUE de la fenêtre, pas du seul
 * devicePixelRatio : ce qui compte est le rapport entre les pixels réellement
 * disponibles et notre résolution logique. Plafonné à 2 — au-delà le gain
 * devient invisible alors que la surface à remplir continue de croître au
 * carré, ce qui se paierait sur les téléphones d'entrée de gamme.
 *
 * Toutes les constantes exprimées en PIXELS passent par px() ci-dessous. Les
 * positions relatives (w * 0.5) et les durées n'ont évidemment rien à faire.
 */
export const RENDER_SCALE: number = computeRenderScale();

function computeRenderScale(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  // Surcharge de test : ?renderScale=2 force le facteur. Indispensable pour
  // vérifier la mise en page à l'échelle haute depuis un écran qui ne la
  // déclencherait pas — sinon on ne découvre les débordements que sur le
  // téléphone, c'est-à-dire trop tard.
  const force = Number(new URLSearchParams(window.location.search).get('renderScale'));
  if (force >= 1 && force <= 3) {
    return force;
  }

  const dpr = window.devicePixelRatio || 1;
  const petitCoteCss = Math.min(window.innerWidth, window.innerHeight);
  const petitCotePhysique = petitCoteCss * dpr;

  // 720 est le petit côté de la résolution logique de référence.
  const souhaite = petitCotePhysique / 720;
  return Math.max(1, Math.min(2, Math.round(souhaite * 2) / 2));
}

/** Convertit une mesure en pixels de référence vers l'échelle de rendu. */
export function px(value: number): number {
  return Math.round(value * RENDER_SCALE);
}

/** Taille de police en pixels de référence, prête pour une style Phaser. */
export function fontPx(value: number): string {
  return `${px(value)}px`;
}

/**
 * Constantes globales du jeu.
 * Toutes les valeurs de gameplay ajustables sont centralisées ici
 * pour faciliter l'équilibrage.
 */

// Résolutions logiques : le jeu suit l'orientation du device (responsive).
// Phaser met à l'échelle via Scale.FIT et bascule entre ces deux formats à la
// rotation du téléphone (voir utils/viewport.ts et main.ts).
export const PORTRAIT_WIDTH = px(720);
export const PORTRAIT_HEIGHT = px(1280);
export const LANDSCAPE_WIDTH = px(1280);
export const LANDSCAPE_HEIGHT = px(720);

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
export const SPAWN_GENTLE_WAVES = 2;
export const SPAWN_WARMUP_WAVES = 5;
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
// Seuil bas : la grappe est l'un des moments les plus satisfaisants du jeu
// (un swipe, plusieurs fruits), et elle est plus FACILE qu'une volée. La
// réserver au milieu de partie privait le début de sa meilleure variété.
export const CLUSTER_MIN_INTENSITY = 0.08;
// Écart supérieur au diamètre d'un gros fruit : sinon la grappe se chevauche
// et ne se lit plus comme une rangée à trancher.
export const CLUSTER_SPREAD_PX = px(125); // écart horizontal entre deux fruits de grappe
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
export const FRENZY_SETTLE_MARGIN = px(24); // marge au bord, en plus du rayon
export const FRENZY_BOB_PX = px(12); // amplitude du flottement sur place
// Zoom de frénésie : la caméra se resserre sur la grenade le temps du combo.
// Volontairement modeste — au-delà, le HUD sort du cadre et on perd de vue
// le reste de la scène. La caméra ne se recentre qu'à MOITIÉ sur la grenade
// pour la même raison.
export const FRENZY_ZOOM = 1.22;
export const FRENZY_ZOOM_MS = 280;
export const FRENZY_PAN_RATIO = 0.5;
// Petites pulsations de caméra qui ponctuent l'action
export const COMBO_PUNCH_ZOOM = 1.06; // à la célébration d'un combo de swipe
export const COMBO_PUNCH_MS = 130;
export const FRENZY_HIT_PUNCH = 1.03; // à chaque coup porté à la grenade
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
export const TRAIL_MAX_HALF_WIDTH = px(9); // demi-largeur du ruban de lame à la pointe (px)

// Fruits
export const FRUIT_RADIUS = px(62); // rayon du placeholder et du cercle de collision
export const HALF_LIFETIME_MS = 1000; // durée avant disparition des moitiés coupées
export const FRUIT_POOL_SIZE = 24;
export const HALF_POOL_SIZE = 48;

// Score & vies
export const SCORE_PER_FRUIT = 10;
export const STARTING_LIVES = 3;

// Fenêtre de combo (Phase 2) : délai max entre deux coupes pour chaîner un combo
export const COMBO_WINDOW_MS = 300;

// Traînée de coupe : trois passes concentriques, du halo froid au cœur chaud.
// Un ruban entièrement blanc paraissait plat ; le dégradé de température lui
// donne l'éclat d'une vraie lame.
export const COLOR_TRAIL = 0xffffff;
export const COLOR_TRAIL_GLOW = 0x7fd4ff; // halo extérieur, bleuté
export const COLOR_TRAIL_CORE = 0xffffff; // corps du ruban
export const COLOR_TRAIL_SPARK = 0xfff3c4; // éclat central, chaud

// ------------------------------------------------------------------
// Game feel
// ------------------------------------------------------------------
// Hit-stop : micro-gel du jeu à l'impact. C'est la technique de « juice »
// la plus efficace — c'est cette pause qui fait qu'un coup CLAQUE au lieu
// de simplement se produire. Durées proportionnées à l'importance du coup.
export const HITSTOP_CRIT_MS = 45;
export const HITSTOP_COMBO_MS = 70;
export const HITSTOP_GRENADE_MS = 95;
export const HITSTOP_BOMB_MS = 130;

// Squash & stretch : les moitiés jaillissent étirées dans l'axe de la coupe
// puis reprennent leur forme. « La technique qui fait le plus pour la
// vivacité » — et elle ne coûte qu'un tween.
export const HALF_SQUASH_X = 1.34;
export const HALF_SQUASH_Y = 0.7;
export const HALF_SQUASH_MS = 210;

// Fondus entre scènes : une coupure sèche fait « page web qui change »
export const SCENE_FADE_MS = 260;

// ------------------------------------------------------------------
// Écran de fin
// ------------------------------------------------------------------
// Médailles : paliers de score par mode. Le Chrono dure 60 s alors qu'une
// partie Classique peut s'éterniser, ses seuils sont donc plus bas.
export const MEDAL_THRESHOLDS: Record<GameMode, readonly [number, number, number]> = {
  classic: [400, 1200, 2500],
  chrono: [300, 800, 1600],
  // Le Défi du jour se joue aux règles du Classique : mêmes seuils, pour que
  // les deux scores restent comparables d'un coup d'œil.
  daily: [400, 1200, 2500],
};
export const MEDAL_COLORS = [0xcd7f32, 0xc0c8d0, 0xffcf40] as const; // bronze, argent, or
export const MEDAL_LABELS = ['BRONZE', 'ARGENT', 'OR'] as const;
// Le score se dévoile en défilant : un total qui s'affiche d'un coup ne se
// savoure pas. Durée fixe, indépendante du score, pour ne pas faire attendre.
export const GAMEOVER_COUNT_MS = 900;
export const GAMEOVER_STEP_MS = 130; // décalage entre deux éléments révélés

// ------------------------------------------------------------------
// Typographie
// ------------------------------------------------------------------
/**
 * Suréchantillonnage de la génération des sprites, ADAPTÉ à l'échelle de rendu.
 *
 * Les deux jouent sur la même chose — la densité de pixels du relief — et les
 * cumuler au maximum ferait exploser le temps de génération pour un gain
 * invisible : le coût croît comme le CARRÉ de leur produit. On vise donc une
 * densité effective d'environ 4, quel que soit l'appareil.
 *
 * Les textures de fruits sont peintes à SPRITE_SUPERSAMPLE fois leur taille
 * finale, puis réduites. La taille de texture ne change PAS : rien à reprendre
 * dans la mise en page, aucun facteur d'échelle à propager aux entités.
 *
 * Ce qui change, c'est la qualité du relief. Les écailles calculées pixel par
 * pixel crénelaient à 1x — à cette échelle, un sillon fait un pixel de large et
 * se met à scintiller. Réduites depuis 3x, elles sont lissées proprement.
 *
 * Coût : neuf fois plus de pixels à calculer, au CHARGEMENT uniquement. En
 * partie, exactement rien.
 */
export const SPRITE_SUPERSAMPLE: number = RENDER_SCALE >= 2 ? 2 : 3;

// Police d'affichage du jeu (Fredoka, SIL OFL, embarquée dans public/fonts).
// Ronde et généreuse, avec des chiffres très lisibles en petit — critère
// décisif pour un score sur mobile. La pile de repli garantit un rendu
// correct si la webfont ne se charge pas.
export const GAME_FONT = '"Fredoka", "Trebuchet MS", sans-serif';

// Planche de chiffres du HUD : générée une fois au préchargement puis
// utilisée en BitmapText. Un objet Text Phaser reconstruit sa texture canvas
// et la renvoie au GPU À CHAQUE changement — inacceptable pour un score qui
// bouge à chaque fruit tranché.
export const FONT_DIGITS = 'hud_digits';
export const DIGIT_CHARS = '0123456789';
export const DIGIT_CELL_W = px(62); // largeur de cellule de la planche
export const DIGIT_CELL_H = px(86);
export const DIGIT_FONT_SIZE = px(72); // taille de tracé dans la planche

// Croix de vie peintes (remplacent le glyphe ✕, qui faisait « page web »)
export const TEX_CROSS = 'cross_splat';
export const CROSS_COLOR_LIT = 0xff3b3b; // strike encaissé
// Ardoise sombre, et non le gris-bleu d'origine : entre 0x6d8496 et le rouge,
// le contraste ne valait que 1,10:1 — deux états qu'un daltonien, ou n'importe
// qui en plein soleil, ne pouvait pas distinguer. WCAG demande 3:1 pour un
// élément graphique porteur d'information ; celui-ci atteint 3,30:1.
// La couleur ne fait de toute façon que RENFORCER la différence de taille :
// aucune information du jeu ne doit reposer sur elle seule.
export const CROSS_COLOR_DIM = 0x2b3a47; // vie encore disponible

/** Côté d'une croix de strike allumée, en pixels. */
export const CROSS_SIZE_LIT = px(42);
/** Côté d'une croix éteinte. L'écart de taille est le signal principal. */
export const CROSS_SIZE_DIM = px(27);

// ------------------------------------------------------------------
// Phase 2 — Feel & polish
// ------------------------------------------------------------------

/** Modes de jeu disponibles. */
export type GameMode = 'classic' | 'chrono' | 'daily';

/** Cause de fin de partie (affichage adapté sur l'écran de fin). */
export type GameOverReason = 'lives' | 'bomb' | 'time';

// Bombes
export const TEX_BOMB = 'bomb';
export const BOMB_RADIUS = px(64); // suit l'agrandissement des fruits (×1,2)
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
