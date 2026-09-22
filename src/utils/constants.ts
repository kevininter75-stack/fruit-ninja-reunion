import { qualityCap } from './settings';

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
 * disponibles et notre résolution logique. Le plafond vient du réglage de
 * qualité (1,5 par défaut, 2 en mode Haute) : le coût est quadratique, donc
 * un demi-cran de plus se paie bien plus cher qu'il n'y paraît — les mesures
 * sont dans settings.ts, au-dessus de qualityCap().
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
  return Math.max(1, Math.min(qualityCap(), Math.round(souhaite * 2) / 2));
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
/**
 * Rapport long côté / petit côté de l'écran, borné.
 *
 * La résolution logique était figée en 16:9 (1280x720). Or un téléphone
 * moderne tenu à l'horizontale fait 2,16:1 — mesuré 844x390 sur un téléphone
 * courant, 2,14 sur un S23 Ultra. Scale.FIT conservant le rapport, 17 % de la
 * largeur partaient donc en bandes noires sur les côtés, là où le joueur
 * cherche justement à voir arriver les fruits.
 *
 * En prenant le rapport de l'écran, le jeu remplit la dalle. Les bornes
 * évitent d'avoir à dessiner pour des formats absurdes : 1,5 couvre les
 * tablettes (4:3 tourné = 1,33 serait trop carré pour la lisibilité des
 * salves), 2,4 les téléphones les plus allongés.
 *
 * Mesuré une fois au démarrage : tourner l'appareil ne change pas le rapport
 * entre son grand et son petit côté.
 */
function computeAspect(): number {
  if (typeof window === 'undefined') {
    return 16 / 9;
  }
  const grand = Math.max(window.innerWidth, window.innerHeight);
  const petit = Math.min(window.innerWidth, window.innerHeight) || 1;
  return Math.min(2.4, Math.max(1.5, grand / petit));
}

const ASPECT = computeAspect();

/** Petit côté de référence : c'est lui qui fixe l'échelle de tout le jeu. */
const PETIT_COTE = px(720);

export const PORTRAIT_WIDTH = PETIT_COTE;
export const PORTRAIT_HEIGHT = Math.round(PETIT_COTE * ASPECT);
export const LANDSCAPE_WIDTH = Math.round(PETIT_COTE * ASPECT);
export const LANDSCAPE_HEIGHT = PETIT_COTE;

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
/**
 * Classique : plein régime vers 2 min 45.
 *
 * C'était 4 min 20, et c'était trop long — demande de Kevin, qui joue le jeu
 * bien plus souvent que quiconque. Une partie ordinaire s'arrête bien avant
 * quatre minutes : la courbe passait donc l'essentiel de son temps dans sa
 * moitié douce, et le joueur ne voyait presque jamais ce pour quoi elle avait
 * été écrite. Un tiers de moins, c'est la partie moyenne qui atteint enfin le
 * haut de la rampe.
 */
export const INTENSITY_RAMP_MS = 165_000;

/**
 * LA PHASE SANS FIN, après le plein régime.
 *
 * Écart le plus net avec Fruit Ninja : là-bas la cadence n'arrête JAMAIS
 * d'augmenter, et c'est ce qui met fin à une partie. Ici l'intensité était
 * bornée à 1, donc au-delà de 4 min 20 le jeu ne durcissait plus du tout : une
 * bonne partie devenait un test d'endurance à difficulté constante, sans
 * jamais de point de rupture.
 *
 * Le sur-régime reprend donc la main là où la rampe s'arrête, mais avec une
 * pente bien plus douce et un plancher absolu : il s'agit de ne jamais laisser
 * la partie s'installer, pas de la rendre injouable d'un coup.
 */
export const OVERDRIVE_RAMP_MS = 170_000;
/** Intervalle plancher absolu, en plein sur-régime. */
export const SPAWN_INTERVAL_FLOOR_MS = 520;
/** Densité de bombes en plein sur-régime (Fruit Ninja : environ une pour six). */
export const BOMB_EVERY_FRUITS_OVERDRIVE = 4;
/**
 * LE CHRONO NE DÉMARRE PAS À FROID.
 *
 * Le Classique et le Chrono ne racontent pas la même chose. Le Classique est
 * une endurance : il commence doucement, monte, et finit par avoir raison du
 * joueur. Le Chrono dure soixante secondes et se mesure en points — une montée
 * progressive y gaspille la moitié de la partie à ne rien proposer, et le
 * joueur n'a pas le temps d'atteindre ce pour quoi le mode existe.
 *
 * D'où le plancher : le Chrono s'ouvre à mi-régime et monte de là. Les vagues
 * de découverte (SPAWN_GENTLE_WAVES, SPAWN_WARMUP_WAVES), qui imposent un
 * fruit puis deux, sont sautées pour la même raison — elles enseignent le jeu,
 * et on ne vient pas apprendre en Chrono.
 */
export const CHRONO_INTENSITE_DEPART = 0.5;
/** Plein régime à 38 s : les vingt dernières secondes se jouent à fond. */
export const INTENSITY_RAMP_CHRONO_MS = 38_000;
/**
 * Le moteur « fruits » du Chrono, ramené à sa durée.
 *
 * Les 170 fruits du Classique sont hors d'atteinte en soixante secondes : le
 * moteur ne se serait jamais déclenché, et un joueur rapide n'aurait pas pu
 * accélérer lui-même la partie comme il le fait en Classique.
 */
export const INTENSITY_RAMP_FRUITS_CHRONO = 70;
/**
 * LA BOMBE EN CHRONO COÛTE DU TEMPS, PAS LA PARTIE.
 *
 * Terminer sur une bombe a du sens en Classique : on y joue sa survie, et la
 * bombe est la mort. En Chrono on joue un total de points sur une durée fixe —
 * y mettre fin d'un seul coup ne sanctionne pas l'erreur, ça supprime tout le
 * reste du jeu, y compris ce qui a été bien joué.
 *
 * Dix secondes sur soixante, c'est un sixième de la partie : assez cher pour
 * qu'on évite les bombes, assez peu pour qu'une erreur laisse de quoi se
 * refaire.
 */
export const CHRONO_BOMBE_PENALITE_MS = 10_000;
/**
 * Nombre de fruits tranchés qui suffit à saturer l'intensité.
 *
 * C'était un SCORE (4200 points), et c'était fragile pour la même raison que
 * le palier du piment : le score n'est pas une mesure de progression, il
 * dépend des combos, du combava qui double tout, et d'une frénésie qui verse
 * plusieurs centaines de points d'un coup. Le moindre rééquilibrage du barème
 * déplaçait donc la difficulté sans que personne ne l'ait demandé.
 *
 * Le nombre de fruits tranchés, lui, ne bouge pas : c'est la mesure que Fruit
 * Ninja utilise (la cadence y monte à mesure que l'on tranche), et elle reste
 * juste quel que soit le barème.
 *
 * 170 fruits, contre 260 : le moteur « fruits » est descendu dans la même
 * proportion que le moteur « temps », sinon l'un aurait rattrapé l'autre et
 * la rampe raccourcie n'aurait servi qu'aux joueurs lents.
 */
export const INTENSITY_RAMP_FRUITS = 170;

/**
 * LA CÉLÉRITÉ : tout va légèrement plus vite à mesure que la partie monte.
 *
 * Relevé par Kevin sur Fruit Ninja : la vitesse des fruits et des bombes y
 * augmente progressivement. Chez nous, seule la CADENCE montait — on recevait
 * plus de salves, mais chaque fruit gardait exactement le même vol du début à
 * la fin. Deux choses différentes, et la seconde manquait.
 *
 * COMMENT, SANS DÉFORMER LES ARCS. Multiplier les vitesses par k ET la
 * gravité par k² donne rigoureusement la même trajectoire, parcourue k fois
 * plus vite. Le sommet reste à la même fraction de l'écran — ce qui compte,
 * car les arcs sont calés pour que rien ne sorte par le haut — mais le fruit
 * y monte et en redescend plus tôt. Monter simplement les vitesses aurait
 * envoyé les fruits hors du cadre.
 *
 * 1,18 et pas davantage : « légèrement », a dit Kevin. À plein régime le vol
 * dure 15 % de moins, ce qui se sent sans rendre le jeu injouable — et ça
 * s'ajoute à une cadence déjà à son plancher.
 */
export const CELERITE_MAX = 1.18;

/**
 * LE LONGANI GIVRÉ : le chrono s'arrête, les fruits pleuvent.
 *
 * Il remplace le piment en Chrono. Le piment suspendait les salves — sur
 * soixante secondes, c'était du jeu confisqué. Celui-ci suspend le COMPTEUR et
 * ouvre une pluie : le joueur reçoit du jeu gratuit au lieu d'en perdre.
 *
 * SIX SECONDES, comme le cyclone. Le déluge qu'il déclenche est le même
 * mécanisme, et deux durées différentes pour un même effet visuel ne feraient
 * qu'embrouiller — le joueur apprend une fois « ça dure à peu près six
 * secondes » et ça vaut pour les deux.
 */
export const GEL_DURATION_MS = 6000;
/** Points donnés à la coupe, comme le cyclone en donne. */
export const GEL_POINTS = 120;
/**
 * Pas avant la douzième seconde, et jamais deux fois en moins de vingt.
 *
 * Sur une partie de soixante secondes, ça en autorise deux au mieux. C'est
 * voulu : un gel gratuit toutes les dix secondes ferait du Chrono un mode où
 * le compteur ne descend plus, et la contrainte de temps est tout ce qui
 * distingue ce mode du Classique.
 */
export const GEL_SAFE_TIME_MS = 12_000;
export const GEL_MIN_GAP_MS = 20_000;

/**
 * LE COMBO, ET POURQUOI ON NE L'ENTENDAIT PLUS.
 *
 * L'arpège existait depuis longtemps, à 0,20 par note. Or une coupe empile
 * maintenant 0,42 de lame, 0,48 de chair et 0,75 de corps grave — et un combo,
 * par définition, en déclenche trois ou plus dans la même demi-seconde. La
 * note se retrouvait quinze décibels sous ce qui la déclenchait : elle jouait,
 * mais personne ne l'entendait.
 *
 * Le corps grave qu'on vient d'ajouter à la coupe a donc aggravé un défaut
 * qui existait déjà. On monte le niveau — et surtout on déplace le combo dans
 * la bande 5-11 kHz, la seule que la coupe laisse libre.
 */
export const COMBO_NOTE_VOLUME = 0.34;
/** L'éclat aigu posé sur chaque note, là où la coupe ne va pas. */
export const COMBO_ECLAT_VOLUME = 0.22;

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
// Le piment : le fruit rare qui déclenche un gros combo
// ------------------------------------------------------------------
// Le piment cabri tient le rôle que Fruit Ninja donne à son « pomegranate ».
// Il apparaît à des paliers de score, se fige en l'air à la première coupe,
// puis on le tranche autant de
// fois que possible pendant quelques secondes avant qu'elle n'éclate : chaque
// coup rapporte, et l'explosion emporte tous les fruits à l'écran.
/**
 * Cadence du piment.
 *
 * LE DÉFAUT. Le palier était FIXE : un piment tous les 700 points, pour
 * toujours. Mais le rythme de score, lui, ne l'est pas — les salves
 * grossissent, les combos paient plus, le combava double tout, et la frénésie
 * elle-même rapporte gros. Un palier constant en POINTS devient donc un
 * intervalle de plus en plus court en SECONDES : le piment, événement rare
 * en début de partie, finissait par revenir sans arrêt.
 *
 * Pire, les points de la frénésie comptaient pour le palier suivant : une
 * bonne frénésie réarmait presque immédiatement la prochaine.
 *
 * TROIS CORRECTIONS, qui se complètent :
 *   le palier CROÎT à chaque piment (FRENZY_STEP_GROWTH) ;
 *   il est recalé sur le score à la FIN de la frénésie, donc ce qu'elle
 *     rapporte ne compte jamais pour la suivante ;
 *   un délai plancher en temps réel (FRENZY_MIN_GAP_MS) garantit l'espacement
 *     quoi qu'il arrive. C'est la seule des trois qui ne puisse pas être
 *     débordée par un joueur qui marque plus vite que prévu.
 */
export const FRENZY_SCORE_STEP = 700; // un palier de score = un piment
/** Chaque piment recule le palier suivant de 55 %. */
export const FRENZY_STEP_GROWTH = 0.55;
/** Deux piments ne peuvent jamais être séparés de moins de 25 s. */
export const FRENZY_MIN_GAP_MS = 25_000;
/**
 * Sous « Sézon piment », le palier de score qui appelle un piment est divisé
 * par trois — et son délai plancher avec, sinon le délai deviendrait le vrai
 * régulateur et la mutation ne changerait presque rien.
 */
export const SEZON_PIMENT_DIVISEUR = 3;
export const FRENZY_GAP_SEZON_MS = 9_000;
export const FRENZY_SAFE_TIME_MS = 15_000; // jamais en tout début de partie
export const FRENZY_DURATION_MS = 4000; // durée de la frénésie une fois amorcée
export const FRENZY_HIT_COOLDOWN_MS = 70; // borne le compteur (~14 coups/s max)
export const FRENZY_POINTS_PER_SLASH = 5;

/**
 * LE DÉLUGE, juste après l'explosion du piment.
 *
 * Relevé sur Fruit Ninja (mode Arcade, 45-90 s de la vidéo) : leur frénésie
 * est un DÉLUGE de fruits entrant par les côtés, sans une seule bombe, qui
 * fait tripler le rendement — 7,7 points/s avant, 26 points/s pendant. Un
 * combo de douze fruits d'un seul geste y devient possible.
 *
 * La nôtre faisait exactement l'inverse : le piment arrivait SEUL, tous les
 * lancers suspendus pour qu'il reste lisible. La lisibilité était le bon
 * choix pendant qu'on la frappe ; ce qui manquait, c'était la récompense
 * après. L'explosion tranche déjà tout ce qui vole — l'écran est donc net au
 * moment précis où le déluge commence, et rien ne gêne la lecture.
 *
 * Cadence : une salve de 1 à 2 fruits toutes les 220 ms, soit environ 7 par
 * seconde. Le pool en contient 24 et un fruit vole 2 s : on frise le plafond
 * sans jamais le crèver, et spawnFruit renonce proprement s'il y arrive.
 */
export const DELUGE_INTERVAL_MS = 220;
/**
 * SOMMET de l'arc des fruits du déluge, en fraction de hauteur DEPUIS LE HAUT
 * de l'écran. Ce n'est plus une hauteur de montée, et c'est tout le sujet.
 *
 * L'ancien réglage donnait la montée au-dessus du point de départ : 0,42 à
 * 0,74 de la hauteur. Or les fruits du déluge entrent par le côté, à une
 * hauteur elle aussi tirée au hasard. Un fruit parti à 0,55 H et montant de
 * 0,74 H culminait donc à −0,19 H, soit 137 px AU-DESSUS du haut de l'écran
 * sur une dalle de 720. Il disparaissait en plein vol, et le joueur n'avait
 * aucun moyen de savoir quand il redescendrait.
 *
 * En visant directement le SOMMET, le point le plus haut est connu d'avance
 * et toujours dans le cadre : entre 17 % et 38 % de la hauteur depuis le haut.
 * La montée s'en déduit, et elle varie donc toute seule selon la hauteur
 * d'entrée — ce qui donne même plus de variété qu'avant, sans le défaut.
 */
export const DELUGE_SOMMET_MIN = 0.17; // le plus haut autorisé
export const DELUGE_SOMMET_MAX = 0.38; // le plus bas : un arc rasant
/** Hauteur d'entrée sur le côté, en fraction de hauteur. */
export const DELUGE_ENTREE_MIN = 0.6;
export const DELUGE_ENTREE_MAX = 0.88;

/**
 * LE CALME APRÈS LE CYCLONE.
 *
 * Le déluge s'arrêtait net. Les fruits lancés à sa toute dernière seconde,
 * eux, volaient encore deux secondes de plus — et ceux-là, une fois le déluge
 * officiellement terminé, coûtaient une croix. Le joueur se prenait donc une
 * vie pour un fruit issu de la récompense elle-même.
 *
 * Pendant ce calme, deux choses : aucune nouvelle salve, et aucun fruit manqué
 * ne coûte quoi que ce soit. L'écran finit de se vider tout seul, puis la
 * partie reprend. Ce n'est pas un temps mort, c'est la fin de la vague.
 *
 * 2,6 s parce que le vol le plus long du déluge dure environ 2,3 s : il faut
 * couvrir le fruit parti au tout dernier instant, marge comprise.
 */
export const DELUGE_CALM_MS = 2600;
/**
 * TRAVERSÉE : la part de la largeur qu'un fruit du déluge parcourt pendant
 * TOUT son vol. Ce n'est pas une vitesse — c'est une distance, et c'est là
 * toute la différence.
 *
 * L'ancien modèle donnait une vitesse en fraction de largeur par seconde
 * (0,10 à 0,22). Mesuré sur un écran de 1368x720 : un fruit vole environ 2 s,
 * il parcourait donc de 274 à 602 px sur 1368 — entre 20 et 44 % de l'écran.
 * Autrement dit il entrait par la gauche et mourait dans le tiers gauche.
 * C'est exactement le défaut relevé par Kevin : « les fruits restent trop sur
 * les bords de l'écran ».
 *
 * En raisonnant en DISTANCE, on obtient ce que fait Fruit Ninja pendant sa
 * frénésie : les fruits traversent vraiment, ceux de droite vont à gauche et
 * inversement, et le joueur balaie tout l'écran au lieu de camper sur un bord.
 * La vitesse s'en déduit à chaque lancer en divisant par la durée de vol
 * réelle — donc l'arc choisi ne change plus la distance parcourue, et le
 * résultat est le même en portrait, en paysage et sur n'importe quel format.
 */
export const DELUGE_TRAVEL_MIN = 0.7; // dépasse largement le milieu
export const DELUGE_TRAVEL_MAX = 1.35; // ressort par le bord opposé
// Zone où le piment vient se caler à la première coupe, en fraction de la
// hauteur : assez haut pour ne pas gêner le HUD, assez bas pour rester à portée.
export const FRENZY_ZONE_TOP = 0.28;
export const FRENZY_ZONE_BOTTOM = 0.68;
export const FRENZY_SETTLE_MARGIN = px(24); // marge au bord, en plus du rayon
export const FRENZY_BOB_PX = px(12); // amplitude du flottement sur place
// Zoom de frénésie : la caméra se resserre sur le piment le temps du combo.
// Volontairement modeste — au-delà, le HUD sort du cadre et on perd de vue
// le reste de la scène. La caméra ne se recentre qu'à MOITIÉ sur le piment
// pour la même raison.
export const FRENZY_ZOOM = 1.22;
export const FRENZY_ZOOM_MS = 280;
export const FRENZY_PAN_RATIO = 0.5;
// Petites pulsations de caméra qui ponctuent l'action
export const COMBO_PUNCH_ZOOM = 1.06; // à la célébration d'un combo de swipe
export const COMBO_PUNCH_MS = 130;
export const FRENZY_HIT_PUNCH = 1.03; // à chaque coup porté au piment
// Entrée latérale : le piment traverse l'écran depuis un bord, en arc.
/**
 * Sommet de l'arc des fruits SPÉCIAUX entrant par le côté (piment, cyclone),
 * en fraction de hauteur depuis le haut. Même raisonnement que pour le déluge,
 * et même raison d'y venir : la papaye cyclone est le plus gros fruit du jeu
 * (88 px de rayon) et culminait à 65 px du haut — son sommet passait donc sous
 * la barre, coupé. On vise le sommet, il est dans le cadre par construction.
 */
export const SIDE_SOMMET_MIN = 0.2;
export const SIDE_SOMMET_MAX = 0.32;
export const FRENZY_CROSS_FACTOR = 0.14; // vitesse de traversée, en fraction de largeur

// Halo et ondes de choc : le vocabulaire visuel réservé au piment
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
/**
 * Fin d'un coup de sabre sans lever de doigt.
 *
 * Un coup de sabre se termine quand le GESTE s'arrête, pas quand la main
 * quitte l'écran. Sans ces deux bornes, un joueur qui gardait le doigt posé
 * et continuait à balayer restait dans un seul et même geste indéfiniment.
 *
 * L'arrêt couvre le cas normal : entre deux balayages, la main décélère
 * toujours sous la vitesse de coupe pour repartir dans l'autre sens. 150 ms,
 * soit un peu plus que la durée de vie d'un point de traînée : quand le
 * ruban a visiblement disparu, le coup est fini.
 *
 * La durée maximale couvre le cas limite : un doigt qui tourne en rond sans
 * jamais ralentir. Un vrai balayage dure 150 à 400 ms ; 700 est large, et
 * c'est voulu — cette borne n'est là que pour l'exploit, elle ne doit jamais
 * tomber sur un geste sincère.
 */
export const STROKE_BREAK_MS = 150;
export const STROKE_MAX_MS = 700;

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
export const HITSTOP_PIMENT_MS = 95;
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

/**
 * LA VOIX DU JEU : titre, exclamations créoles, bandeaux de récompense.
 *
 * Deux polices, et le partage n'est pas arbitraire. Le guide de style du jeu
 * (STYLE.md) exclut explicitement « le vectoriel plat » et « l'icône système »
 * — or Fredoka est exactement cela : une géométrique régulière, sans main.
 * Elle ne contredisait rien de ce qu'on voit, elle ne disait simplement rien
 * du couchant peint autour d'elle.
 *
 * Shrikhand a des pleins et des déliés, une inclinaison, un contraste de
 * plume. Elle a été dessinée pour le gujarati autant que pour le latin, et sur
 * un jeu réunionnais cette filiation indienne n'est pas un ornement : elle est
 * dans l'île. C'est le même raisonnement que le calendrier des saisons du
 * catalogue — un détail que personne ne peut copier depuis ailleurs.
 *
 * FREDOKA GARDE LES CHIFFRES, et ce n'est pas un compromis mou. La planche du
 * HUD est fabriquée à partir de GAME_FONT ; un caractère d'affichage aussi
 * gras que Shrikhand rendrait 6, 8 et 9 confus au petit corps, et un score
 * qu'on lit mal est pire qu'un score sans caractère. Chacune à son poste :
 * DISPLAY_FONT parle, GAME_FONT informe.
 */
export const DISPLAY_FONT = '"Shrikhand", "Fredoka", "Trebuchet MS", sans-serif';

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
/**
 * La bombe du Chrono, marquée « -10 » au lieu du X rouge.
 *
 * La croix dit « ne touche pas », et en Classique c'est vrai : la bombe met
 * fin à la partie. En Chrono elle ne tue plus, elle coûte dix secondes — la
 * croix y devient un mensonge, et un mensonge qui fait hésiter le joueur sur
 * le seul objet dont il doit juger le prix instantanément. Le chiffre dit ce
 * prix exact.
 */
export const TEX_BOMB_CHRONO = 'bomb_chrono';
/**
 * Le pétard est le plus gros objet du jeu, devant la papaye cyclone (88).
 * C'est délibéré et c'est même la seule chose qui doit l'être : il coûte la
 * partie entière, donc il ne doit jamais pouvoir être confondu avec un fruit
 * ni surgir sans qu'on l'ait vu venir. Passé de 64 à 72 à la demande de Kevin.
 */
export const BOMB_RADIUS = px(72);
export const BOMB_POOL_SIZE = 8;
export const BOMB_SAFE_TIME_MS = 5000; // aucune bombe dans les premières secondes
export const BOMB_GAMEOVER_DELAY_MS = 700; // durée du flash avant l'écran de fin

// Particules de jus
export const TEX_JUICE = 'juice';
/** Graine de piment : projetée en gerbe quand le piment cabri éclate. */
export const TEX_SEED = 'seed';
/** Graines lâchées à l'explosion. Généreux : un piment en est PLEIN. */
export const SEED_BURST_COUNT = 34;
export const JUICE_PARTICLE_COUNT = 14;

// Éclaboussures persistantes sur le décor (Étape 1 du polish "feel")
export const TEX_SPLAT_PREFIX = 'splat_';
export const SPLAT_VARIANTS = 3; // nb de formes de taches générées
export const SPLAT_POOL_SIZE = 12;
export const SPLAT_FADE_MS = 7000; // durée avant disparition complète d'une tache

// Assombrissement du décor pendant la partie : voile sombre translucide
// qui désature/atténue le fond pour que les fruits claquent visuellement
// (le décor complet reste éclatant au menu). Étape 3 du polish "feel".
/**
 * Marge de débordement des nappes plein écran.
 *
 * Borner la caméra au monde ne suffit pas : dans Phaser, la SECOUSSE est
 * appliquée APRÈS le bornage (Camera.preRender borne le défilement, puis
 * appelle shakeEffect.preRender). À zoom 1 il n'y a aucune marge, donc la
 * moindre secousse découvre le vide au bord — jusqu'à 28 px à l'explosion
 * d'une bombe, dont la secousse vaut 0,022 de la largeur.
 *
 * Le décor, le voile sombre, le vignettage et le flash blanc débordent donc
 * de cette marge. Elle passe par px() : elle grandit avec la résolution,
 * exactement comme l'amplitude de la secousse, qui est une fraction de la
 * largeur.
 */
export const SCREEN_BLEED = px(36);

export const GAME_DARKEN_COLOR = 0x0a1a26;
export const GAME_DARKEN_ALPHA = 0.4;

// Profondeurs de rendu (depth) : fond 0 < voile < taches < moitiés < fruits < jus < UI
export const DEPTH_DARKEN = 1;
export const DEPTH_SPLAT = 2;
export const DEPTH_HALF = 5;
export const DEPTH_FRUIT = 6;
/**
 * Reflet des fruits : juste au-dessus du fruit, sous tout le reste.
 *
 * Il doit passer par-dessus la peau (c'est un reflet) mais rester sous le
 * jus, les taches et le HUD — un reflet qui brillerait par-dessus une
 * éclaboussure mettrait la lumière devant la matière.
 */
export const DEPTH_SHEEN = 7;
export const DEPTH_JUICE = 40;
/**
 * Graines projetées par l'explosion du piment.
 *
 * JUSTE AU-DESSUS DU JUS, et c'est voulu : la même explosion lance les deux au
 * même endroit, à la même seconde. Une graine est un objet solide, le jus est
 * une projection — la graine passe donc devant, sinon la gerbe se perd dedans.
 *
 * Elles étaient à DEPTH_FRUIT + 1, c'est-à-dire exactement DEPTH_SHEEN : deux
 * choses différentes sur la même profondeur, dont l'ordre de tracé ne dépendait
 * plus que de l'ordre de création. Un nombre nommé, lui, ne peut pas entrer en
 * collision par accident.
 */
export const DEPTH_SEED = 41;



// Mode Chrono
export const CHRONO_DURATION_MS = 60_000;

// Pool de textes de feedback flottants (+10, Combo x2…)
// Passé de 10 à 24 : les récompenses arrivent désormais par gerbes de deux
// ou trois, et pendant un déluge plusieurs gerbes se chevauchent. À 10, le
// pool saturait et showPopup renonçait silencieusement — on perdait
// justement les récompenses des moments les plus intenses.
// Mesuré en plein déluge, tous les fruits tranchés : 13 récompenses visibles
// en même temps, en quatre couleurs et cinq tailles. 24 laisse la marge.
export const POPUP_POOL_SIZE = 24;

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

/**
 * LE SON DE LA MÈCHE, tant qu'un pétard est en vol.
 *
 * Un objet qui va vous tuer doit s'entendre avant d'être vu. C'est la seule
 * information du jeu qui ne dépend pas de l'endroit où l'on regarde — et sur
 * un écran où sept fruits volent en même temps, c'est précisément ce qui
 * manquait.
 *
 * Deux couches, et la seconde fait tout le travail. Un souffle filtré tenu
 * n'est pas une mèche : c'est une radio mal réglée, on l'a déjà appris avec
 * la lame. Ce qui fait entendre une mèche, ce sont les CRÉPITEMENTS — de
 * minuscules claquements irréguliers. Le souffle ne fait que les porter.
 */
/**
 * La planche de tranchage : six coups de couteau, deux éclatements humides.
 *
 * Source des coups : « Cut vegetables and fruits » de JARASNAT, sur Pixabay,
 * sous Pixabay Content License. Source du jus : « Squish impact » de Bertsz,
 * sur Freesound, en CC0. Les deux sont cités dans public/assets/sfx/CREDITS.txt.
 *
 * LA PLANCHE À DÉCOUPER A ÉTÉ RETIRÉE, et c'est la bonne décision : dans le jeu
 * le fruit est EN L'AIR. Le « boum » du couteau qui touche le bois est un
 * artefact de studio qui n'a rien à faire ici — et c'était de loin la partie la
 * plus longue et la plus sonore de chaque échantillon.
 *
 * Elle se repère au basculement du timbre. En comparant l'énergie au-dessus de
 * 2,5 kHz à celle sous 700 Hz, le craquement de la peau et des fibres sort
 * clair (tilt positif ou proche de zéro) et l'impact sur le bois sort sourd
 * (tilt franchement négatif). Sur le premier coup : tilt +6 / +4 / +6 pendant
 * l'entrée, +2 au pic, puis −5 dès la 20e milliseconde. C'est là qu'on coupe.
 * Mesuré sur les huit coups, la planche entre entre 20 et 42 ms.
 *
 * Deux coups sur huit ont été écartés : l'un n'avait aucun basculement net,
 * l'autre était plat (7 dB de facteur de crête, souffle à 9 dB sous le pic) —
 * du bruit, pas un craquement. Les six qui restent ont 14 à 17,6 dB de crête.
 *
 * NORMALISÉS SUR LE RMS, PAS SUR LE PIC. Une fois la planche partie il ne reste
 * que des transitoires de 20 à 42 ms, de formes très différentes : normalisés
 * au pic, leurs niveaux PERÇUS s'étalaient sur 16 dB, si bien que certaines
 * coupes auraient été inaudibles et d'autres fortes. Le RMS mesure ce que
 * l'oreille entend ; un plafond à 0,95 évite l'écrêtage sur les plus pointus.
 *
 * Résultat : 74 Ko au lieu de 170, pour un son plus juste.
 *
 * FORMAT WAV, ET C'EST VOULU. Un mp3 se décode avec un bourrage d'encodeur en
 * tête, qui décalerait toute la table ci-dessous de quelques millisecondes — or
 * on découpe ce fichier à l'échantillon près.
 */
export const TEX_TRANCHE_FICHIER = 'assets/sfx/tranche.wav';
/** Position et durée de chaque coup, en secondes, dans la planche. */
export const TRANCHE_COUPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.02],
  [0.04, 0.0274],
  [0.0874, 0.0299],
  [0.1373, 0.0324],
  [0.1898, 0.0324],
  [0.2422, 0.0424],
];

// 0,42 et non 0,34 : retirer la planche a fait perdre 1,8 dB de niveau
// perçu (RMS moyen 0,092 -> 0,075). On le rend, sinon la coupe s'entendrait
// moins bien alors qu'elle sonne mieux.
export const TRANCHE_VOLUME = 0.42;
/**
 * L'éclatement humide, posé SOUS le coup de couteau.
 *
 * Source : « Squish impact » de Bertsz, sur Freesound, en CC0 — domaine public,
 * donc aucune question à se poser sur un dépôt ouvert. L'auteur le décrit comme
 * du vrai fruit servant à composer un squish, et c'est exactement ce qui
 * manquait : le premier son est la LAME (sec, craquant, la planche derrière),
 * celui-ci est la CHAIR. Les deux ensemble font une coupe ; l'un sans l'autre
 * n'en fait que la moitié.
 *
 * Traité par un simple coupe-bas à 150 Hz. Mesuré : l'énergie utile passe de
 * 73,8 % à 91,8 % sans que l'équilibre du son bouge — on ne retire que
 * l'infra-grave qu'aucun haut-parleur de téléphone ne restitue et qui ne
 * servait qu'à manger de la marge avant normalisation.
 */
export const TRANCHE_JUS: ReadonlyArray<readonly [number, number]> = [
  [0.3046, 0.15], // court : pour les petits fruits
  [0.4746, 0.36], // long : la papaye pisse plus longtemps que le letchi
];
export const TRANCHE_JUS_VOLUME = 0.48;
/**
 * Le retard du jus sur la lame — le réglage le plus délicat des deux sons.
 *
 * TROIS VALEURS, ET CHACUNE A APPRIS QUELQUE CHOSE.
 *
 *   18 ms — le jus s'entendait à peine. Pas un problème de volume : la lame
 *      culmine entre 19 et 38 ms selon le coup, et le jus partait juste avant.
 *      Comparés fenêtre par fenêtre, le jus dominait sur 30 fenêtres sur 36,
 *      mais le trou tombait pile au pic de la lame, 8 dB dessous. Vingt
 *      millisecondes de masquage seulement — sauf que ce sont celles qui
 *      suivent l'attaque, c'est-à-dire là où l'oreille décide de ce qu'elle
 *      vient d'entendre.
 *   42 ms — le masquage disparaît (36 fenêtres sur 36), mais Kevin entend
 *      « deux sons collés ». Et il a raison : entre 20 et 50 ms d'écart, deux
 *      sons sont TROP LOIN pour fusionner en un seul événement et TROP PRÈS
 *      pour se lire comme une suite. C'est la pire zone des deux.
 *   85 ms — au-delà de cette zone, l'oreille enchaîne d'elle-même : la lame
 *      coupe, PUIS le fruit éclate. Un lien de cause à effet, pas un doublon.
 *   55 ms — VALEUR ACTUELLE, et le retrait de la planche à découper l'impose.
 *      Les trois valeurs ci-dessus se mesuraient contre une lame qui durait
 *      97 à 197 ms ; sans le bois, elle n'en dure plus que 20 à 42. À 85 ms le
 *      jus arrivait bien après la fin du craquement, donc trop détaché. À 55 ms
 *      il part une quinzaine de millisecondes après, ce qui garde l'enchaînement
 *      sans recoller les deux sons.
 *
 * Divisé par la vitesse de lecture à l'usage : un gros fruit joue tout plus
 * lentement et met plus longtemps à céder. Mesuré : 63 ms sur un letchi,
 * 105 ms sur une papaye.
 */
export const TRANCHE_JUS_RETARD = 0.055;
/**
 * Exposant d'atténuation du jus en rafale.
 *
 * Le carré était trop brutal — sur un combo, la chair disparaissait presque.
 * 1,5 garde l'intention (le jus s'efface plus vite que la lame, pour que
 * treize coupes fassent un combo et non de la bouillie) sans la vider.
 */
export const TRANCHE_JUS_EXPOSANT = 1.5;

export const MECHE_VOLUME = 0.055;
/** Probabilité de crépitement par image (~3 par seconde et par pétard). */
export const MECHE_CREPITEMENT = 0.05;

// Coups critiques : une coupe sur ~11 rapporte gros, avec feedback appuyé
export const CRIT_CHANCE = 0.09;
export const CRIT_MULTIPLIER = 3;

// Combo par geste : nombre de fruits tranchés dans UN même swipe (façon
// Fruit Ninja). Célébré en grand à partir du seuil, avec bonus par fruit.
export const GESTURE_COMBO_MIN = 3;
/**
 * À partir de combien de fruits le combo SECOUE l'écran.
 *
 * À ne pas confondre avec le fait d'être NOMMÉ : tout combo porte un nom dès
 * trois fruits, c'est la définition même du combo chez Fruit Ninja (« three or
 * more fruit in a single swiping motion »). Ce seuil-ci ne régit que l'impact
 * physique — gel de l'image, coup de caméra, secousse, gerbe dorée.
 *
 * Il a d'abord servi à masquer les x3 entièrement, pour que « Woulala » cesse
 * de servir à tout. C'était le mauvais levier : la distribution mesurée (x3
 * 18 %, RIEN entre quatre et cinq, x6 9 %) fait que le seuil tombait dans un
 * trou, et les noms de combo ont tout simplement disparu du jeu. La
 * répétition se règle en faisant varier le MOT (cf. utils/creole.ts), pas en
 * supprimant l'occasion de le dire.
 *
 * Reste qu'un x3 arrive toutes les quelques secondes : lui donner le gel et
 * la secousse ferait trembler l'image en permanence. D'où ce palier, qui ne
 * garde que la gradation qui avait du sens.
 */
export const GESTURE_IMPACT_MIN = 4;
/**
 * À partir de combien de fruits le jeu crie PLUS FORT.
 *
 * Le troisième palier, obtenu sans troisième mot. Fruit Ninja gradue six rangs
 * nommés, mais il ne gradue pas que les noms : à chaque rang les tambours
 * montent d'un cran. Les exclamations créoles validées étant au nombre de
 * deux, et ne s'inventant pas, la montée se joue ici sur la PRÉSENCE — même
 * mot, bannière plus grande, tenue plus longue, gel et secousse appuyés.
 */
export const GESTURE_HUGE_MIN = 7;
/**
 * Bonus par fruit d'un combo, versé en une fois à la fin du coup de sabre.
 *
 * Monté de 15 à 25 en même temps que disparaît l'ancien bonus cumulatif par
 * fruit. Sur un combo de cinq, l'ancien système donnait 100 (escalade) + 75
 * (bonus) = 175 ; le nouveau donne 50 + 125 = 175. L'échelle des scores est
 * donc préservée, et les seuils de médailles restent valables — seul
 * disparaît ce qui pouvait croître sans fin.
 */
export const GESTURE_COMBO_BONUS = 25;

// ------------------------------------------------------------------
// Fond animé
// ------------------------------------------------------------------
/** Nombre d'éclats de lame simultanés. Un combo de cinq fruits en tire cinq. */
export const SLICE_FLASH_POOL_SIZE = 8;
/** Durée de l'éclat de lame. Au-delà, l'œil y lit un objet, pas un éclat. */
export const SLICE_FLASH_MS = 190;

export const TEX_GLOW = 'glow';
/** Calque de reflet fixe posé sur les fruits en rotation (cf. paintSphereSheen). */
export const TEX_SHEEN = 'sheen';
/** Côté de la texture de reflet, en pixels logiques. */
export const SHEEN_TEX_SIZE = 256;
export const TEX_CLOUD = 'cloud';
// Position du soleil (fraction de l'écran) — partagée entre le décor baké
// et le halo animé pour qu'ils coïncident dans les deux orientations.
/**
 * Position du soleil dans le décor, en fractions de l'écran.
 *
 * Il était à 0,66 — c'est-à-dire à DROITE — alors que les fruits sont
 * éclairés depuis le HAUT-GAUCHE : c'est la direction de la lumière clé du
 * moteur d'ombrage (surfaceShading), celle du reflet verni (addGloss) et
 * celle du dégradé de sphère (sphereGradient).
 *
 * Une image où le soleil est d'un côté et les ombres de l'autre se lit comme
 * un montage, même si personne ne sait dire pourquoi. C'est le défaut le
 * plus coûteux en crédibilité et le moins cher à corriger.
 *
 * On déplace le soleil plutôt que la lumière des fruits : dix variétés ont
 * été peintes à la main autour de ce haut-gauche (jusqu'à la joue rouge de
 * la mangue, placée à droite précisément parce que le reflet occupe l'autre
 * côté). Une constante contre dix peintures à reprendre.
 */
export const SUN_FRAC_X = 0.34;
export const SUN_FRAC_Y = 0.52;
export const BG_CLOUD_COUNT = 5;
/**
 * LES QUATRE PLANS DU DÉCOR, du plus lointain au plus proche.
 *
 * Chacun porte un `scrollFactor` : la part du déplacement de la caméra que le
 * plan suit. À 1 il colle au monde, à 0 il reste vissé à l'écran. Le décalage
 * entre les plans EST la profondeur — c'est le repère de distance le plus fort
 * dont dispose l'œil, et le moins cher à produire.
 *
 * LES VALEURS SONT TOUTES SOUS 1, ET C'EST AUSSI PLUS SÛR QU'AVANT. Le décor
 * d'hier était une image unique à scrollFactor 1 : elle suivait la caméra au
 * pixel près, d'où le débord SCREEN_BLEED pour qu'une secousse ne découvre pas
 * le vide. Un plan qui bouge MOINS que le monde ne peut, par construction, pas
 * découvrir davantage. Le découpage réduit donc le risque au lieu de l'ajouter.
 *
 * L'écart entre les plans compte plus que leurs valeurs absolues : 0,03 contre
 * 0,30, c'est un rapport de dix entre le ciel et les palmiers. C'est ce rapport
 * qu'on voit quand la caméra se resserre sur un fruit spécial.
 */
export const BG_CIEL_SCROLL = 0.03;
export const BG_LOIN_SCROLL = 0.09;
export const BG_PROCHE_SCROLL = 0.18;
export const BG_AVANT_SCROLL = 0.3;

// Profondeurs du fond animé (sous tout le reste, sous le voile sombre).
// L'ordre relatif de la lueur, des nuages et des poussières est conservé :
// ils restent AU-DESSUS du décor, comme avant le découpage.
export const DEPTH_BG_CIEL = -24;
export const DEPTH_BG_LOIN = -23;
export const DEPTH_BG_PROCHE = -22;
export const DEPTH_BG_AVANT = -21;
export const DEPTH_BG_GLOW = -20;
export const DEPTH_BG_CLOUD = -19;
export const DEPTH_BG_MOTE = -18;

// ------------------------------------------------------------------
// Polish visuel global
// ------------------------------------------------------------------
// Vignettage : cadre sombre discret sur les bords → rendu cinématique
export const TEX_VIGNETTE = 'vignette';
/**
 * Le voile de brume de la mutation « Brume des Hauts ».
 *
 * Au-dessus du jus (40) pour qu'elle passe devant les éclaboussures, sous la
 * vignette (45) et le HUD : le score doit rester net quoi qu'il arrive à
 * l'image. Une brume qui masquerait les chiffres ne serait plus une ambiance,
 * ce serait une panne.
 */
export const DEPTH_BRUME = 42;
/** Part basse de l'écran que le voile recouvre — la brume monte d'en bas. */
export const BRUME_HAUTEUR = 0.62;
/** Opacité au creux et à la crête d'une vague. */
export const BRUME_ALPHA_MIN = 0.1;
export const BRUME_ALPHA_MAX = 0.74;
/**
 * Durée d'une respiration complète.
 *
 * Onze secondes : assez lent pour qu'on la subisse sans pouvoir l'attendre au
 * métronome, assez court pour qu'une éclaircie revienne avant l'agacement.
 */
export const BRUME_PERIODE_MS = 11_000;

export const DEPTH_VIGNETTE = 45; // au-dessus du jeu et du jus, sous le HUD (50)
// HUD en cartouches translucides arrondis
export const HUD_PANEL_COLOR = 0x0b2a3a;
export const HUD_PANEL_ALPHA = 0.4;

// ------------------------------------------------------------------
// Le fruit cyclone : la frénésie en un seul coup de sabre
// ------------------------------------------------------------------
/**
 * POURQUOI UN DEUXIÈME FRUIT SPÉCIAL, alors que le piment existe déjà.
 *
 * Fruit Ninja en a deux, et ils ne font pas le même métier. Le piment (leur
 * pomegranate) est un MINI-JEU : on la frappe en boucle, elle récompense
 * l'endurance du poignet. La banane de frénésie est un CADEAU : un seul coup
 * de sabre, et le déluge commence. La première se mérite, la seconde se
 * cueille — et c'est la seconde qui donne à la partie ses pics de folie.
 *
 * Il nous manquait la seconde. Notre déluge n'existait qu'au bout des quatre
 * secondes de piment, donc seulement pour qui tenait le rythme jusqu'au
 * bout. Le fruit cyclone le rend accessible d'un geste.
 *
 * POURQUOI LA PAPAYE. Il fallait un fruit qu'on ne puisse pas confondre avec
 * un fruit ordinaire — un fruit spécial qui ressemble à un fruit normal est
 * un piège, pas une récompense. La papaye est déjà peinte dans fruitArt.ts
 * (entière, en deux moitiés, face de coupe) mais elle a été RETIRÉE du
 * catalogue ordinaire : elle ne peut donc jamais sortir comme fruit banal.
 * Elle arrive en plus par le côté, avec un halo — trois signaux d'affilée.
 */
export const CYCLONE_DURATION_MS = 6000;

/**
 * Espacement entre deux fruits cyclone. Kevin : « peut-être une fois par
 * minute ». C'est le bon ordre de grandeur pour le Classique, qui dure aussi
 * longtemps que le joueur tient.
 *
 * Le Chrono, lui, ne dure que 60 secondes : au même espacement, une partie
 * entière pourrait n'en voir aucun. On le resserre donc à 22 s, ce qui en
 * donne un ou deux par partie — la proportion exacte du mode Arcade de Fruit
 * Ninja, où la banane de frénésie passe deux à trois fois en une minute.
 */
export const CYCLONE_MIN_GAP_MS = 58_000;
/**
 * Cadence du cyclone sous la mutation « Saison cyclone » du Défi du jour.
 *
 * Quinze secondes : assez pour qu'il redevienne un événement entre deux
 * passages, trop peu pour qu'on souffle. C'est la seule mutation qui rend la
 * partie plus généreuse, d'où l'objectif du jour relevé qui l'accompagne.
 */
export const CYCLONE_GAP_SAISON_MS = 15_000;
export const CYCLONE_MIN_GAP_CHRONO_MS = 22_000;
/** Jamais en tout début de partie : on laisse le joueur entrer dans le jeu. */
export const CYCLONE_SAFE_TIME_MS = 28_000;
export const CYCLONE_SAFE_TIME_CHRONO_MS = 9_000;
/**
 * Délai plancher entre DEUX fruits spéciaux quelconques, piment et cyclone
 * confondus. Sans lui, les deux cadences étant indépendantes, elles finissent
 * par tomber ensemble : deux frénésies coup sur coup, et le jeu n'a plus de
 * relief. C'est une seule règle pour deux mécaniques, et c'est voulu.
 */
export const SPECIAL_MIN_GAP_MS = 14_000;
/** Points rapportés par le fruit cyclone lui-même, en plus du déluge. */
export const CYCLONE_POINTS = 50;

// ------------------------------------------------------------------
// Récompenses simultanées (façon Fruit Ninja)
// ------------------------------------------------------------------
/**
 * Sur la vidéo de référence, à 1 min 04, CINQ récompenses sont à l'écran en
 * même temps — « 13 fruit combo », « +10 critical », « +3 lime bonus »,
 * « Berry Blast +5 », « Hyper Blitz +25 » — à cinq endroits différents, dans
 * trois tailles et trois couleurs. C'est ce fourmillement qui donne à leur
 * frénésie sa sensation d'abondance.
 *
 * Chez nous tout arrivait en un seul bandeau centré. Un bandeau, si gros
 * soit-il, reste UNE chose : l'œil la lit et passe. Cinq objets qui
 * apparaissent à 70 ms d'intervalle, eux, donnent l'impression que l'écran
 * n'arrive plus à suivre — et c'est exactement l'effet recherché.
 *
 * Le décalage compte autant que le nombre : tout faire apparaître à la même
 * image donne une bouillie illisible, tandis qu'une cascade se lit.
 */
export const REWARD_STAGGER_MS = 70;
/** Rayon de dispersion des récompenses autour du point du geste. */
export const REWARD_SPREAD_PX = px(150);

/** Couleurs des récompenses, une par nature — la couleur dit le type. */
export const COLOR_POINTS = '#ffffff';
export const COLOR_CRIT = '#ffd700';
export const COLOR_COMBO = '#ffe066';
/**
 * Le temps perdu sur une bombe, en Chrono.
 *
 * PAS EN ROUGE, et c'est une correction. La bombe porte déjà « -10 » peint en
 * rouge sur son corps : voir deux « -10 » rouges au même instant, l'un sur
 * l'objet et l'autre qui s'en échappe, ne dit pas si l'on vient de perdre dix
 * secondes ou si l'on lit simplement l'étiquette de la bombe.
 *
 * Le cyan est celui du libellé « TEMPS » du bandeau : la bulle appartient
 * visiblement au compteur, donc à la seule chose qu'elle fait bouger. Il ne
 * peut pas non plus se confondre avec les points, qui sortent en blanc, ni
 * avec les critiques, en or.
 */
export const COLOR_TEMPS_PERDU = '#9fd0e6';
export const COLOR_CYCLONE = '#ff8c5a';
export const COLOR_BONUS = '#8ef2c8';

/**
 * Taille du halo du cyclone, en multiples de son rayon — plus grand que celui
 * du piment (FRENZY_AURA_SCALE), et pour une raison mesurée.
 *
 * À 2,8, le halo d'une papaye de 88 px de rayon ne dépassait la silhouette que
 * de 40 %. Mesuré sur la couronne autour du fruit, image avec halo contre
 * image sans : 2,1 niveaux d'écart moyen sur 255, soit 0,8 %. Autrement dit le
 * halo existait dans le code et nulle part à l'écran — et sur un ciel de fin
 * de journée, une lueur chaude en fusion additive est justement ce qui se voit
 * le moins.
 *
 * Le halo est le seul des trois signaux du cyclone qui fonctionne quelle que
 * soit la distance : la silhouette et la trajectoire demandent qu'on regarde
 * déjà au bon endroit.
 */
export const CYCLONE_AURA_SCALE = 4.2;
export const CYCLONE_AURA_ALPHA_MIN = 0.3;
export const CYCLONE_AURA_ALPHA_MAX = 0.62;

/**
 * LA BOUCLE MALOYA.
 *
 * Huit mesures à 121 BPM, synthétisées instrument par instrument : roulèr,
 * kayamb, pikèr, et une basse modale. Rien n'y est emprunté — ni enregistrement
 * ni mélodie —, donc aucune question de licence ne se pose, jamais.
 *
 * TOUT EST EN SECONDES, PAS EN ÉCHANTILLONS. decodeAudioData rééchantillonne le
 * fichier à la fréquence du contexte, qui est de 44 100 Hz sur une partie des
 * appareils : un décompte en échantillons y serait faux d'un dixième. C'est la
 * même raison qui fait que la table des régions de tranche.wav est en secondes.
 */
export const MUSIQUE_FICHIER = 'assets/music/maloya.mp3';
/** Durée utile : 761 653 échantillons à 48 kHz, la longueur exacte du rendu. */
export const MUSIQUE_DUREE = 761653 / 48000;
/**
 * Le silence que l'encodeur MP3 pose devant, et le surplus total qu'il ajoute.
 *
 * LAME décale de 1 105 échantillons et complète la fin jusqu'à la trame
 * suivante : mesuré sur ce fichier, 763 776 échantillons décodés au lieu de
 * 761 653, soit 2 123 de trop. Boucler ça tel quel ferait un blanc à chaque
 * tour — d'où les points de boucle posés à la main dans MusicManager.
 *
 * Vérifié après encodage : l'écart au raccord tombe à 0,0078 contre 0,0091
 * d'écart moyen entre deux échantillons, donc sous le bruit de fond du signal.
 * À 96 kbit/s il montait à 0,0290 et s'entendait : c'est ce qui a fixé le débit
 * à 128.
 */
export const MUSIQUE_RETARD = 1105 / 48000;
export const MUSIQUE_SURPLUS = 2123 / 48000;

/**
 * LE CORPS DE LA CHAIR — le poids sous la coupe.
 *
 * CE QUI MANQUAIT, ET COMMENT ON L'A SU. Mesuré sur un enregistrement de Fruit
 * Ninja fourni par Kevin : leurs découpes portent 44 à 56 % de leur énergie
 * entre 400 et 1200 Hz, avec un centre de gravité entre 640 et 1970 Hz. La
 * nôtre en portait 7,4 %, centre à 4393 Hz.
 *
 * Autrement dit, on avait construit un SIFFLEMENT là où il faut un CHOC. C'est
 * aussi l'explication du « le jus est pas assez » de Kevin : on a monté le
 * volume, puis le retard, puis encore le volume — en travaillant un son qui
 * n'était pas dans le bon registre. Monter un sifflement ne le rend pas charnu.
 *
 * Le corps est du bruit passé dans une bande étroite qui DESCEND, parce qu'un
 * fruit qui cède ne claque pas à hauteur fixe : il s'écrase.
 */
export const TRANCHE_CORPS_VOLUME = 0.75;
/**
 * Montée de 16 ms, posée sur le même retard que le jus.
 *
 * Le pic du corps tombe donc 71 ms après la lame — dans la fenêtre 65-80 ms
 * mesurée entre le coup de lame et l'impact sur la référence. Ce n'est pas un
 * réglage à l'oreille : c'est là que l'impact tombe chez eux.
 */
export const TRANCHE_CORPS_MONTEE = 0.016;
export const TRANCHE_CORPS_EXTINCTION = 0.038;
/**
 * Le centre du corps suit la taille du fruit, entre 500 et 950 Hz.
 *
 * Un letchi s'effondre plus haut qu'une papaye, comme un petit tambour sonne
 * plus haut qu'un grand. Bornes choisies pour rester dans la bande qu'un
 * haut-parleur de téléphone restitue — sous 400 Hz on n'entendrait rien.
 */
export const TRANCHE_CORPS_BASE = 1204;
export const TRANCHE_CORPS_PENTE = 7.6;
export const TRANCHE_CORPS_MIN = 500;
export const TRANCHE_CORPS_MAX = 950;
/**
 * POURQUOI ON NE TOUCHE PAS AU BRILLANT DU JUS, alors que la mesure y invitait.
 *
 * Notre échantillon de chair porte 32 % de son énergie au-dessus de 3,5 kHz,
 * là où la référence n'en a que 2 à 12 %. Un toit à 5 kHz sur le jus faisait
 * passer la bande du choc de 34 % à 46 %, donc pile dans la fourchette de
 * Fruit Ninja (44-56 %).
 *
 * Kevin a comparé les deux à l'oreille et a choisi de GARDER LE BRILLANT. La
 * référence sonne mat ; Kout Sab' n'a aucune obligation de l'être, et le
 * mordant fait partie de ce qu'il veut. On s'arrête donc à 34 % : le poids
 * qui manquait est là, le tranchant n'a pas été payé pour l'obtenir.
 *
 * Le réglage reste disponible dans outils/coupe-rendu.mjs (4e argument) si on
 * veut y revenir — c'est sa place, pas celle du jeu.
 */
