import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { computeViewport } from './utils/viewport';
import { GAME_FONT, DISPLAY_FONT } from './utils/constants';
import { installAppLifecycle } from './systems/appLifecycle';
import { relayoutActiveScenes } from './utils/relayout';
import { installLandscapeGate } from './systems/orientation';
import { viderLaFile } from './systems/Classement';

/**
 * Attend que la police d'affichage soit réellement disponible.
 *
 * Phaser ne précharge pas les webfonts. Sans cette attente, non seulement les
 * textes s'afficheraient d'abord dans la police système, mais surtout la
 * planche de chiffres du HUD — générée une fois pour toutes au préchargement —
 * serait tracée dans la mauvaise police et figée ainsi dans sa texture.
 * En cas d'échec (police bloquée, navigateur ancien), on démarre quand même :
 * la pile de repli `Trebuchet MS, sans-serif` prend le relais.
 */
const FONT_TIMEOUT_MS = 3000;

async function waitForFont(): Promise<void> {
  if (!('fonts' in document)) {
    return;
  }
  // Délai de garde : sans lui, un réseau capricieux laisserait le joueur
  // devant un écran noir. Passé ce délai on démarre avec la police de repli
  // — un jeu un peu moins joli vaut mieux qu'un jeu qui ne démarre pas.
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, FONT_TIMEOUT_MS));
  const loaded = (async (): Promise<void> => {
    // Chaque graisse utilisée doit être prête avant le premier tracé
    await Promise.all([
      document.fonts.load(`500 40px ${GAME_FONT}`),
      document.fonts.load(`600 40px ${GAME_FONT}`),
      document.fonts.load(`700 40px ${GAME_FONT}`),
      // La voix du jeu doit être prête elle aussi : un bandeau tracé avant son
      // arrivée sortirait dans la police de repli, et le premier combo d'une
      // partie est justement celui qu'on regarde le plus.
      document.fonts.load(`400 40px ${DISPLAY_FONT}`),
    ]);
    await document.fonts.ready;
  })().catch(() => undefined);

  await Promise.race([loaded, timeout]);
}

/**
 * Point d'entrée. Le jeu n'est instancié qu'une fois la police chargée : c'est
 * plus simple et plus sûr que de retarder le démarrage des scènes après coup.
 */
async function boot(): Promise<void> {
  await waitForFont();
  const game = new Phaser.Game(gameConfig);

  // Fruit Ninja se joue à l'horizontale, et Kout Sab' aussi. La porte du
  // paysage demande le verrouillage au premier toucher et, à défaut, retient
  // le jeu derrière un voile plutôt que de basculer en portrait.
  const portePaysage = installLandscapeGate(game);

  // Arrêt de tout ce qui doit s'arrêter quand le joueur quitte l'application.
  // Phaser met sa boucle en pause tout seul ; la musique, elle, tourne sur une
  // horloge du navigateur qui l'ignore.
  installAppLifecycle();

  // Les scores qui n'ont pas pu partir (avion, tunnel, base en pause) repartent
  // ici, en fond. Volontairement non attendu : le jeu ne doit jamais retarder
  // son démarrage pour un service qui n'est pas indispensable.
  void viderLaFile();

  // Accès au jeu depuis la console, en DÉVELOPPEMENT UNIQUEMENT.
  // import.meta.env.DEV est remplacé par false au build et la branche entière
  // disparaît : rien de tout ceci n'existe dans la version publiée.
  // Sert à piloter une partie depuis la console pour vérifier un comportement
  // sans dépendre de clics aux coordonnées, que le redimensionnement du canvas
  // rend peu fiables.
  if (import.meta.env.DEV) {
    (window as unknown as { koutSab?: Phaser.Game }).koutSab = game;
  }

  // Responsive : le jeu suit l'orientation du device. Quand elle change, on
  // bascule la résolution logique (portrait ↔ paysage) et on relance la scène
  // active pour qu'elle se réagence à la nouvelle taille.
  let currentPortrait = computeViewport().isPortrait;

  const applyViewport = (): void => {
    portePaysage.rafraichir();
    // Retenu derrière le voile : on ne bascule SURTOUT pas en portrait. La
    // partie reste telle quelle, en paysage, endormie — et elle repart intacte
    // dès que l'appareil revient dans le bon sens. C'est ce qui remplace la
    // reconstruction de scène, et c'est mieux : plus rien n'est perdu, pas
    // même les fruits en vol.
    if (portePaysage.estBloque()) {
      return;
    }
    const vp = computeViewport();
    if (vp.isPortrait !== currentPortrait) {
      currentPortrait = vp.isPortrait;
      game.scale.setGameSize(vp.width, vp.height);
      // Reconstruction à la nouvelle taille, en rendant à chaque scène
      // l'avancement qu'elle demande à conserver (cf. utils/relayout.ts).
      // Tourner l'écran ne coûte plus la partie en cours.
      relayoutActiveScenes(game);
    }
    // INDISPENSABLE : setGameSize change la taille LOGIQUE mais ne re-mesure
    // pas le conteneur. Sans ce refresh, le canvas reste mis à l'échelle
    // d'après l'ANCIENNE largeur d'écran et n'occupe qu'une fraction de la
    // place disponible après une rotation (constaté : 420 px de large au lieu
    // de 747 sur un écran de 860).
    game.scale.refresh();
  };

  const handleOrientation = (): void => {
    // Les navigateurs mobiles émettent l'événement AVANT d'avoir mis à jour
    // les dimensions du viewport : une seule mesure tomberait sur les
    // anciennes valeurs. On re-mesure donc sur plusieurs échéances — les
    // appels redondants sont sans effet (l'orientation ne bascule qu'une fois,
    // et refresh() est idempotent).
    applyViewport();
    window.requestAnimationFrame(applyViewport);
    window.setTimeout(applyViewport, 150);
    window.setTimeout(applyViewport, 500);
  };
  window.addEventListener('resize', handleOrientation);
  window.addEventListener('orientationchange', handleOrientation);

  // Poignée de debug exposée en développement uniquement :
  // permet d'inspecter/piloter le jeu depuis la console ou des tests navigateur.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
}

void boot();

// PWA : service worker enregistré uniquement sur le build de production
// (en dev, il fausserait le rechargement à chaud de Vite).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Si un service worker nous contrôlait déjà, un changement de contrôleur
    // signifie qu'une nouvelle version vient de s'activer → on recharge une
    // seule fois pour servir le contenu frais. Sans ça, un joueur déjà venu
    // resterait sur la version en cache jusqu'à un vidage manuel.
    const hadController = navigator.serviceWorker.controller !== null;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) {
        return; // pas de rechargement au tout premier enregistrement
      }
      refreshing = true;
      window.location.reload();
    });

    // Chemin relatif : le SW garde la bonne portée même hébergé en sous-chemin
    navigator.serviceWorker.register('sw.js').catch(() => {
      // L'enregistrement peut échouer (contexte non sécurisé…) :
      // le jeu fonctionne alors simplement sans mode hors-ligne.
    });
  });
}
