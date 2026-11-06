import Phaser from 'phaser';
import { SUN_FRAC_X, SUN_FRAC_Y } from './constants';
import { backgroundKey, type BgCouche } from './viewport';
import { DECOR_ILLUSTRE } from './visuels';
import {
  paintCiel,
  paintCretesLointaines,
  paintCretesProches,
  paintAvantPlan,
} from './backdrop';

/**
 * Enregistre les quatre plans du décor pour une orientation — une seule fois.
 *
 * POURQUOI À LA DEMANDE, ET PAS TOUT D'AVANCE. Le découpage en quatre plans
 * multiplie par quatre la mémoire de texture du décor : mesuré, 34,5 Mo pour
 * les deux orientations contre 8,6 Mo du temps de l'image unique. Or la moitié
 * de ce coût ne sert à rien — depuis que le jeu est tenu en paysage sur
 * téléphone (cf. systems/orientation.ts), le jeu de textures portrait n'est
 * jamais affiché là-bas, et sur un ordinateur en paysage non plus.
 *
 * On ne peint donc que l'orientation réellement utilisée. L'autre n'existera
 * que si quelqu'un tourne vraiment son écran, et elle sera peinte à ce
 * moment-là. La fonction est idempotente : elle se contente de vérifier qu'une
 * clé existe déjà, ce qui la rend sûre à appeler à chaque entrée de scène.
 *
 * Le coût de ce report est une bouffée de calcul au moment de la rotation,
 * pendant que le voile « tourne ton téléphone » est de toute façon affiché.
 * C'est exactement le moment où personne ne regarde.
 */
export function ensureBackdropTextures(
  scene: Phaser.Scene,
  portrait: boolean,
  W: number,
  H: number
): void {
  const peindre = (couche: BgCouche, trace: (ctx: CanvasRenderingContext2D) => void): void => {
    const cle = backgroundKey(couche, portrait);
    if (scene.textures.exists(cle)) {
      return;
    }
    const texture = scene.textures.createCanvas(cle, W, H);
    if (texture === null) {
      return;
    }
    trace(texture.getContext());
    texture.refresh();
  };

  if (scene.textures.exists(DECOR_ILLUSTRE)) {
    peindre('ciel', (ctx) => {
      const image = scene.textures.get(DECOR_ILLUSTRE).getSourceImage() as HTMLImageElement;
      const echelle = Math.max(W / image.width, H / image.height);
      const largeur = image.width * echelle;
      const hauteur = image.height * echelle;
      ctx.drawImage(image, (W - largeur) / 2, (H - hauteur) / 2, largeur, hauteur);
    });
    // Le décor peint porte déjà ses reliefs et son avant-plan ; les clés des
    // quatre plans restent présentes pour les scènes et les rotations existantes.
    peindre('loin', () => undefined);
    peindre('proche', () => undefined);
    peindre('avant', () => undefined);
    return;
  }

  peindre('ciel', (ctx) => paintCiel(ctx, W, H, SUN_FRAC_X, SUN_FRAC_Y));
  peindre('loin', (ctx) => paintCretesLointaines(ctx, W, H));
  peindre('proche', (ctx) => paintCretesProches(ctx, W, H));
  peindre('avant', (ctx) => paintAvantPlan(ctx, W, H, SUN_FRAC_X, SUN_FRAC_Y));
}
