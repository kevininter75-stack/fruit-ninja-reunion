import Phaser from 'phaser';
import { Fruit } from '../entities/Fruit';

/**
 * Détection des coupes : teste l'intersection entre le dernier segment
 * du geste du joueur et les fruits actifs.
 *
 * Choix technique : intersection segment-cercle (Phaser.Geom.Intersects.LineToCircle)
 * plutôt que segment-rectangle. Deux raisons après comparaison des approches :
 * 1. Les fruits sont ronds : le cercle colle mieux à la silhouette réelle
 *    qu'une bounding box (moins de coupes "dans le vide" aux coins).
 * 2. Coût : un seul test distance point-segment contre 4 tests
 *    segment-segment pour un rectangle → moins de calculs par fruit.
 *
 * Les objets Line/Circle sont pré-alloués et réutilisés à chaque test
 * pour éviter toute allocation dans la boucle de jeu (objectif 60 FPS mobile).
 */
export class SliceDetector {
  private readonly line = new Phaser.Geom.Line();
  private readonly circle = new Phaser.Geom.Circle();

  /**
   * Teste le segment [x1,y1 → x2,y2] contre tous les fruits actifs du groupe
   * et appelle onHit pour chaque fruit touché.
   */
  checkSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fruits: Phaser.Physics.Arcade.Group,
    onHit: (fruit: Fruit) => void
  ): void {
    this.line.setTo(x1, y1, x2, y2);

    // getChildren() renvoie le tableau interne (pas de copie), on itère dessus
    // en vérifiant `active` car le pool contient aussi les fruits recyclés.
    const children = fruits.getChildren();
    for (let i = 0; i < children.length; i++) {
      const fruit = children[i] as Fruit;
      if (!fruit.active) {
        continue;
      }
      this.circle.setTo(fruit.x, fruit.y, fruit.sliceRadius);
      if (Phaser.Geom.Intersects.LineToCircle(this.line, this.circle)) {
        onHit(fruit);
      }
    }
  }
}
