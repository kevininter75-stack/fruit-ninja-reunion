import Phaser from 'phaser';

/**
 * Survivre à une rotation d'écran.
 *
 * LE PROBLÈME. Tourner le téléphone change la forme du monde : le paysage et
 * le portrait n'ont ni la même largeur ni la même hauteur logiques. La seule
 * façon honnête de réagencer une scène entière est de la reconstruire — et
 * c'est ce que fait `scene.restart()`.
 *
 * Sauf qu'une scène reconstruite repart de ses données de départ. En pleine
 * partie, cela voulait dire score, vies et chrono remis à zéro : une rotation
 * accidentelle coûtait la partie en cours. Sur l'écran de fin, c'était plus
 * discret mais tout aussi faux — le score affiché retombait à 0.
 *
 * LA SOLUTION. On ne change pas la façon de réagencer (reconstruire reste le
 * plus sûr : le code de mise en page est déjà juste dans les deux
 * orientations, et il n'existe qu'à un seul endroit). On change ce qu'on lui
 * redonne : chaque scène qui porte un état photographie ce qu'il faut pour
 * repartir à l'identique, et le récupère à la reconstruction.
 *
 * Ce qui est volontairement PERDU : les fruits en vol, et le multiplicateur du
 * combava. Les premiers seraient de toute façon à des positions qui n'existent
 * plus dans la nouvelle forme d'écran ; le second dure cinq secondes. Le score,
 * les vies, le chrono et la difficulté, eux, sont conservés — ce sont eux qui
 * représentent le travail du joueur.
 */
export interface RelayoutableScene extends Phaser.Scene {
  /** Ce qu'il faut redonner à cette scène pour qu'elle reprenne où elle en est. */
  captureState(): object | undefined;
}

function porteUnEtat(scene: Phaser.Scene): scene is RelayoutableScene {
  return typeof (scene as Partial<RelayoutableScene>).captureState === 'function';
}

/**
 * Reconstruit toutes les scènes actives à la nouvelle taille, en rendant à
 * chacune l'état qu'elle a demandé à conserver.
 */
export function relayoutActiveScenes(game: Phaser.Game): void {
  for (const scene of game.scene.getScenes(true)) {
    const etat = porteUnEtat(scene) ? scene.captureState() : undefined;
    scene.scene.restart(etat);
  }
}
