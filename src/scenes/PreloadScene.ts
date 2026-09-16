import Phaser from 'phaser';
import {
  PORTRAIT_WIDTH,
  PORTRAIT_HEIGHT,
  LANDSCAPE_WIDTH,
  LANDSCAPE_HEIGHT,
  TEX_BOMB,
  TEX_JUICE,
  TEX_SEED,
  TEX_SPLAT_PREFIX,
  SPLAT_VARIANTS,
  BOMB_RADIUS,
  TEX_GLOW,
  TEX_SHEEN,
  SHEEN_TEX_SIZE,
  TEX_CLOUD,
  TEX_VIGNETTE,
  TEX_RING,
  TEX_CROSS,
  FONT_DIGITS,
  DIGIT_CHARS,
  DIGIT_CELL_W,
  DIGIT_CELL_H,
  DIGIT_FONT_SIZE,
  GAME_FONT,
  SPRITE_SUPERSAMPLE,
  fontPx,
  px,
  RENDER_SCALE,
} from '../utils/constants';
import {
  FRUIT_VARIETIES,
  BONUS_VARIETY,
  FRENZY_VARIETY,
  CYCLONE_VARIETY,
  type FruitVariety,
  wholeTextureKey,
  halfTextureKeys,
} from '../utils/fruitCatalog';
import { paintWhole, paintCut } from '../utils/fruitArt';
import { ensureBackdropTextures } from '../utils/backdropTextures';
import { computeViewport } from '../utils/viewport';
import { paintSphereSheen } from '../utils/surfaceShading';

/**
 * Génération des assets placeholder.
 *
 * Aucun fichier image n'est requis : toutes les textures sont générées
 * procéduralement (canvas 2D). Chaque fruit du catalogue reçoit trois
 * textures ([key]_whole, [key]_half_left, [key]_half_right) — les moitiés
 * sont le même dessin découpé par clipping, avec la chair visible le long
 * de la coupe. Quand les vrais assets arriveront (public/assets/fruits/),
 * il suffira de remplacer ces générations par des this.load.image() :
 * les clés de texture ne changeront pas.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  private taches: Array<{ libelle: string; run: () => void }> = [];
  private tacheCourante = 0;
  private barre?: Phaser.GameObjects.Rectangle;
  private legende?: Phaser.GameObjects.Text;

  create(): void {
    this.buildLoadingScreen();

    // Les textures sont générées EN TÂCHES, une par frame, au lieu d'un seul
    // bloc. Mesuré : 852 ms rien que pour les fruits, suréchantillonnage
    // compris. En un bloc, le navigateur ne repeint rien pendant tout ce
    // temps : la barre de progression resterait figée à zéro puis le jeu
    // apparaîtrait — autant ne pas en mettre.
    this.taches = [
      { libelle: 'Le décor', run: () => {
        // Seulement l'orientation en cours : l'autre sera peinte si quelqu'un
        // tourne vraiment son écran (cf. utils/backdropTextures.ts).
        const portrait = computeViewport().isPortrait;
        ensureBackdropTextures(
          this,
          portrait,
          portrait ? PORTRAIT_WIDTH : LANDSCAPE_WIDTH,
          portrait ? PORTRAIT_HEIGHT : LANDSCAPE_HEIGHT
        );
      } },
    ];

    for (const variety of FRUIT_VARIETIES) {
      this.taches.push({
        libelle: variety.displayName,
        run: () => this.createVarietyTextures(variety),
      });
    }

    this.taches.push({ libelle: BONUS_VARIETY.displayName, run: () => this.createVarietyTextures(BONUS_VARIETY) });
    this.taches.push({ libelle: FRENZY_VARIETY.displayName, run: () => this.createVarietyTextures(FRENZY_VARIETY) });
    this.taches.push({ libelle: CYCLONE_VARIETY.displayName, run: () => this.createVarietyTextures(CYCLONE_VARIETY) });
    this.taches.push({ libelle: 'La lame et le jus', run: () => {
      this.createBombTexture();
      this.createJuiceTexture();
      this.createSeedTexture();
      this.createSplatTextures();
    } });
    this.taches.push({ libelle: 'Les finitions', run: () => {
      this.createGlowTexture();
      this.createSheenTexture();
      this.createCloudTexture();
      this.createVignetteTexture();
      this.createRingTexture();
      this.createCrossTexture();
      this.createDigitFont();
    } });
  }

  update(): void {
    if (this.tacheCourante >= this.taches.length) {
      return;
    }

    const tache = this.taches[this.tacheCourante];
    this.tacheCourante++;
    tache.run();

    const avancement = this.tacheCourante / this.taches.length;
    this.barre?.setScale(avancement, 1);
    this.legende?.setText(tache.libelle);

    if (this.tacheCourante >= this.taches.length) {
      // Une frame de plus avant de basculer : la barre doit atteindre le bout
      // visiblement, sinon le chargement paraît s'interrompre à 90 %.
      this.time.delayedCall(140, () => this.scene.start('MenuScene'));
    }
  }

  /**
   * Écran de chargement. Volontairement sobre : il est fait de rectangles et
   * de texte, sans aucune texture — puisque c'est précisément les textures
   * qu'il attend.
   */
  private buildLoadingScreen(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(0, 0, w, h, 0x0b2a3a).setOrigin(0);

    this.add
      .text(w / 2, h * 0.4, "Kout Sab'", {
        fontFamily: GAME_FONT,
        fontSize: fontPx(64),
        color: '#fff3e0',
      })
      .setOrigin(0.5);

    const largeur = Math.min(w * 0.6, 460);
    this.add
      .rectangle(w / 2, h * 0.56, largeur, 10, 0xffffff, 0.16)
      .setOrigin(0.5);

    // La barre grandit par setScale depuis son bord gauche : redimensionner un
    // rectangle centré le ferait grandir des deux côtés.
    this.barre = this.add
      .rectangle(w / 2 - largeur / 2, h * 0.56, largeur, 10, 0xffd76a)
      .setOrigin(0, 0.5)
      .setScale(0, 1);

    this.legende = this.add
      .text(w / 2, h * 0.62, '', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(24),
        color: '#9fb8c8',
      })
      .setOrigin(0.5);
  }

  /**
   * Croix de vie « peinte » : deux coups de pinceau croisés aux bords
   * irréguliers, plus quelques gouttelettes. Générée en blanc et teintée à
   * l'affichage (rouge = strike encaissé, gris-bleu = vie disponible).
   * Le caractère ✕ d'une police faisait « page web » ; un tracé peint parle
   * le même langage visuel que les éclaboussures de jus du jeu.
   */
  private createCrossTexture(): void {
    // Le canevas suit la résolution, le TRACÉ reste en coordonnées logiques :
    // la mise à l'échelle du contexte fait le pont. Sans elle, monter la
    // résolution donnerait une grande image contenant un petit dessin.
    const size = 128;
    const tex = this.textures.createCanvas(TEX_CROSS, px(size), px(size));
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.fillStyle = '#ffffff';

    // Un trait effilé aux extrémités : on assemble deux courbes de Bézier
    // qui s'écartent au centre, ce qui donne le renflement du pinceau.
    const stroke = (x1: number, y1: number, x2: number, y2: number, w: number): void => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len; // normale unitaire au trait
      const ny = dx / len;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + nx * w, my + ny * w, x2, y2);
      ctx.quadraticCurveTo(mx - nx * w * 0.82, my - ny * w * 0.82, x1, y1);
      ctx.closePath();
      ctx.fill();
    };

    const m = 24; // marge : le trait ne doit pas toucher le bord du canvas
    stroke(m, m, size - m, size - m, 13);
    stroke(size - m, m + 4, m + 4, size - m, 12);

    // Éclaboussures : ce sont elles qui font « peint » plutôt que « dessiné »
    for (const [cx, cy, r] of [
      [size - m + 6, m - 6, 5],
      [m - 8, size - m + 8, 4],
      [size * 0.5 + 26, size * 0.5 - 30, 3.5],
      [size * 0.5 - 30, size * 0.5 + 24, 3],
      [size - m + 12, size * 0.5 + 6, 2.5],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  }

  /**
   * Planche de chiffres du HUD : les dix chiffres tracés dans la police du
   * jeu, avec dégradé, contour sombre et reflet — puis déclarée à Phaser
   * comme police bitmap à chasse fixe (RetroFont).
   *
   * Double bénéfice : un rendu de chiffres bien plus riche qu'un simple
   * objet Text, et surtout aucune reconstruction de texture quand le score
   * change (un Text refait son canvas et le renvoie au GPU à chaque appel).
   */
  private createDigitFont(): void {
    const w = DIGIT_CELL_W;
    const h = DIGIT_CELL_H;
    const count = DIGIT_CHARS.length;
    const tex = this.textures.createCanvas(FONT_DIGITS, w * count, h);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.font = `700 ${DIGIT_FONT_SIZE}px ${GAME_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (let i = 0; i < count; i++) {
      const cx = i * w + w / 2;
      const cy = h / 2 + 2;
      const char = DIGIT_CHARS[i];

      // Ombre portée douce : détache le chiffre du décor sans le salir
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = '#26313d';
      ctx.lineWidth = 11;
      ctx.strokeText(char, cx, cy);
      ctx.restore();

      // Corps : dégradé vertical crème → or, comme la chair d'un fruit mûr
      const grad = ctx.createLinearGradient(0, cy - DIGIT_FONT_SIZE * 0.5, 0, cy + DIGIT_FONT_SIZE * 0.5);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#ffe9a8');
      grad.addColorStop(1, '#f7b733');
      ctx.fillStyle = grad;
      ctx.fillText(char, cx, cy);

      // Reflet sur la moitié haute : donne le relief bombé
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * w, 0, w, h * 0.42);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(char, cx, cy);
      ctx.restore();
    }
    tex.refresh();

    // Déclaration en police bitmap à chasse fixe : les chiffres partagent la
    // même largeur, la planche est donc régulière et se découpe simplement.
    this.cache.bitmapFont.add(
      FONT_DIGITS,
      Phaser.GameObjects.RetroFont.Parse(this, {
        image: FONT_DIGITS,
        width: w,
        height: h,
        chars: DIGIT_CHARS,
        charsPerRow: count,
        'offset.x': 0,
        'offset.y': 0,
        'spacing.x': 0,
        'spacing.y': 0,
        lineSpacing: 0,
      })
    );
  }

  /** Onde de choc : anneau clair à bord fondu, agrandi puis effacé en tween. */
  private createRingTexture(): void {
    const size = px(256);
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_RING, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    // Dégradé radial resserré sur le bord : un trait net donnerait un cercle
    // de géométrie, pas une onde.
    const g = ctx.createRadialGradient(c, c, size * 0.3, c, c, size * 0.5);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.72, 'rgba(255, 255, 255, 0.85)');
    g.addColorStop(0.86, 'rgba(255, 255, 255, 0.5)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** Vignettage : cadre radial sombre (transparent au centre, sombre aux bords). */
  private createVignetteTexture(): void {
    const size = px(512);
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_VIGNETTE, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(c, c, size * 0.34, c, c, size * 0.63);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(6, 15, 22, 0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** Halo lumineux radial : le "glow" animé placé sur le soleil du décor. */
  private createGlowTexture(): void {
    const size = px(520);
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_GLOW, size, size);
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255, 238, 190, 0.85)');
    g.addColorStop(0.4, 'rgba(255, 220, 150, 0.35)');
    g.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /**
   * Reflet de sphère partagé par tous les fruits.
   *
   * Une seule texture pour dix variétés : le reflet ne dépend que de la
   * lumière et de la forme sphérique, jamais de la peau. Elle est peinte à
   * la résolution de l'écran puis réduite à la taille de chaque fruit — un
   * reflet réduit reste net, un reflet agrandi baverait.
   */
  private createSheenTexture(): void {
    const cote = px(SHEEN_TEX_SIZE);
    const tex = this.textures.createCanvas(TEX_SHEEN, cote, cote);
    if (tex === null) {
      return;
    }
    paintSphereSheen(tex.getContext(), cote, cote / 2);
    tex.refresh();
  }

  /** Nuage doux : amas de cercles flous (bord adouci par shadowBlur). */
  private createCloudTexture(): void {
    const w = 360;
    const h = 150;
    const tex = this.textures.createCanvas(TEX_CLOUD, px(w), px(h));
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 28;
    for (const [cx, cy, r] of [
      [110, 95, 42],
      [165, 72, 54],
      [225, 90, 46],
      [150, 98, 48],
      [205, 98, 44],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  }

  // ------------------------------------------------------------------
  // Décor : coucher de soleil tropical, volcan, océan, palmiers
  // ------------------------------------------------------------------


  // ------------------------------------------------------------------
  // Fruits : 3 textures par variété (entier + 2 moitiés par clipping)
  // ------------------------------------------------------------------

  private createVarietyTextures(variety: FruitVariety): void {
    // Marge élargie : place pour feuilles/couronnes/halo ET pour l'ombre
    // portée douce qui détache le fruit du décor assombri.
    const size = variety.radius * 2 + px(64);
    const variants: Array<'whole' | 'left' | 'right'> = ['whole', 'left', 'right'];
    const halves = halfTextureKeys(variety);

    for (const variant of variants) {
      const key =
        variant === 'whole' ? wholeTextureKey(variety) : variant === 'left' ? halves.left : halves.right;
      const texture = this.textures.createCanvas(key, size, size);
      if (texture === null) {
        continue;
      }
      // Suréchantillonnage : on peint dans un canevas SPRITE_SUPERSAMPLE fois
      // plus grand, puis on le réduit dans la texture. La texture garde donc
      // exactement sa taille — rien à reprendre dans la mise en page — mais son
      // relief, calculé pixel par pixel, cesse de créneler.
      const ss = SPRITE_SUPERSAMPLE;
      const grand = document.createElement('canvas');
      grand.width = size * ss;
      grand.height = size * ss;
      const ctx = grand.getContext('2d')!;
      ctx.scale(ss, ss);

      ctx.save();
      // Les moitiés sont le MÊME dessin que l'entier, clippé au fil du
      // couteau : silhouette et motifs restent donc parfaitement cohérents
      // entre le fruit en vol et ses deux moitiés.
      if (variant === 'left') {
        ctx.beginPath();
        ctx.rect(0, 0, size / 2, size);
        ctx.clip();
      } else if (variant === 'right') {
        ctx.beginPath();
        ctx.rect(size / 2, 0, size / 2, size);
        ctx.clip();
      }
      // Ombre portée symétrique (offset 0) : un halo sombre entoure toute la
      // silhouette pour la faire ressortir. Offset nul → l'ombre reste
      // correcte même quand le sprite tourne en vol. paintWhole la coupe
      // dès le corps peint, pour que les détails internes restent nets.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 13;
      paintWhole(ctx, variety, size);

      // La chair est peinte DANS le clip de la moitié : elle recouvre
      // l'intérieur de la peau et laisse une bande d'écorce sur le pourtour.
      if (variant !== 'whole') {
        paintCut(ctx, variety, size, variant);
      }
      ctx.restore();

      // Réduction : c'est ici que le suréchantillonnage devient du lissage.
      const cible = texture.getContext();
      cible.clearRect(0, 0, size, size);
      cible.imageSmoothingEnabled = true;
      cible.imageSmoothingQuality = 'high';
      cible.drawImage(grand, 0, 0, size, size);
      texture.refresh();
    }
  }

  // ------------------------------------------------------------------
  // Bombe et particules
  // ------------------------------------------------------------------

  /** Bombe placeholder : sphère noire, reflet, mèche et étincelle. */
  /**
   * LE PÉTARD CHINOIS, à la place de la bombe noire.
   *
   * POURQUOI CE CHANGEMENT. Une bombe ronde à mèche est le vocabulaire du jeu
   * de plateforme américain ; elle ne dit rien d'ici. Le pétard, lui, est un
   * objet que tout le monde connaît à La Réunion — c'est celui du Nouvel An
   * chinois, et la communauté sino-réunionnaise fait partie de l'île depuis
   * le XIXe siècle. Il explose, il a une mèche, il fait peur au bon moment :
   * il remplit exactement le même office, en parlant créole.
   *
   * NOIR À CROIX ROUGE, et non rouge et or. Le rouge et or était le vrai
   * pétard de fête ; c'est justement le problème — il ressemblait à quelque
   * chose qu'on ramasse. Le noir barré de rouge ne se lit que d'une seule
   * façon, et c'est la bonne pour un objet qui coûte la partie entière.
   *
   * CE QUI EST CONTRAINT, ET POURQUOI. Le corps doit tenir DANS le cercle de
   * détection (BOMB_RADIUS), jamais en dépasser. Un objet dessiné plus large
   * que sa zone de coupe se fait trancher « à côté » — impardonnable pour un
   * objet dont le contact coûte la partie. Sa demi-diagonale est donc calculée
   * pour rester sous le rayon, le joueur étant toujours avantagé.
   *
   * Le bout de mèche reste EXACTEMENT au même endroit qu'avant (r+17, 8) :
   * c'est de là que Bomb.fuseTip fait crépiter les étincelles, et cette
   * position est codée en dur dans l'entité.
   *
   * Peint clair, comme le reste : la teinte d'éclairage multiplie la couleur
   * à l'affichage (cf. surfaceShading), donc un rouge peint à sa valeur finale
   * ressortirait sombre et boueux.
   */
  private createBombTexture(): void {
    const r = BOMB_RADIUS;
    const size = r * 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Cylindre : nettement plus haut que large, comme un vrai pétard.
    const demiLargeur = r * 0.42;
    const demiHauteur = r * 0.66;
    const cx = r;
    const cy = r + px(6);
    const gauche = cx - demiLargeur;
    const haut = cy - demiHauteur;
    const largeur = demiLargeur * 2;
    const hauteur = demiHauteur * 2;

    // Corps NOIR, galbe peint à la main par bandes verticales.
    //
    // POURQUOI PAS UN DÉGRADÉ. `fillGradientStyle` de Phaser ne s'applique PAS
    // à `fillRoundedRect` : le rectangle sort rempli de la dernière couleur
    // unie posée. Constaté à l'écran lors du premier jet, qui est ressorti
    // entièrement doré. Des bandes verticales d'alpha croissant font le même
    // travail et ne dépendent d'aucun comportement incertain.
    //
    // Peint plus clair qu'il ne doit paraître : la teinte d'éclairage multiplie
    // la couleur à l'affichage (cf. surfaceShading). Un noir posé à sa valeur
    // finale deviendrait une silhouette plate, sans volume.
    g.fillStyle(0x2c2c34, 1);
    g.fillRoundedRect(gauche, haut, largeur, hauteur, px(10));

    // Les bandes sont rentrées verticalement du rayon des coins : sans cela
    // elles dépasseraient de l'arrondi et le tube aurait les angles carrés.
    const BANDES = 9;
    const hautBande = haut + px(10);
    const hauteurBande = hauteur - px(20);
    for (let i = 0; i < BANDES; i++) {
      const t = i / (BANDES - 1); // 0 à gauche, 1 à droite
      // Cylindre éclairé depuis la gauche : sombre au bord gauche, clair au
      // tiers, puis assombri vers le bord droit qui fuit.
      const clarte = Math.sin(t * Math.PI) * 0.9 - Math.abs(t - 0.32) * 0.35;
      const x = gauche + t * (largeur - largeur / BANDES);
      if (clarte > 0) {
        g.fillStyle(0x8d8da0, clarte * 0.3);
      } else {
        g.fillStyle(0x000000, -clarte * 0.8);
      }
      g.fillRect(x, hautBande, largeur / BANDES + 1, hauteurBande);
    }

    // Bagues d'un gris à peine plus clair, en haut et en bas. Elles ne se
    // voient presque pas, et c'est le but : elles ne servent qu'à dire que
    // l'objet est un CYLINDRE et non un rectangle posé à plat.
    g.fillStyle(0x4a4a56, 1);
    g.fillRoundedRect(gauche, haut, largeur, px(11), px(5));
    g.fillRoundedRect(gauche, haut + hauteur - px(11), largeur, px(11), px(5));

    // LA CROIX ROUGE. C'est elle, et elle seule, qui dit « ne touche pas ».
    //
    // En diagonale plutôt qu'en croix droite : une croix droite sur fond
    // sombre se lit comme un signe médical, donc comme quelque chose qu'on
    // ramasse. Un X est le seul signe que personne ne confond avec un bonus.
    //
    // Elle est bordée de noir avant d'être tracée en rouge : sur un corps
    // sombre, un trait rouge pur perd son contour et bave. Le liseré le
    // détache, exactement comme le contour sombre détache les fruits du ciel.
    const brasX = demiLargeur * 0.52;
    const brasY = demiHauteur * 0.34;
    for (const [epaisseur, couleur, alpha] of [
      [px(14), 0x14060a, 0.9],
      [px(9), 0xe02434, 1],
      [px(3), 0xff8f9a, 0.85],
    ] as Array<[number, number, number]>) {
      g.lineStyle(epaisseur, couleur, alpha);
      g.beginPath();
      g.moveTo(cx - brasX, cy - brasY);
      g.lineTo(cx + brasX, cy + brasY);
      g.moveTo(cx + brasX, cy - brasY);
      g.lineTo(cx - brasX, cy + brasY);
      g.strokePath();
    }

    // Contour sombre, et un liseré clair par-dessus : le pétard est noir, or
    // le décor comporte des montagnes noires. Sans ce liseré, sa silhouette
    // disparaîtrait au moment précis où il passe devant elles.
    g.lineStyle(px(5), 0x0a0a10, 0.9);
    g.strokeRoundedRect(gauche, haut, largeur, hauteur, px(10));
    g.lineStyle(px(2), 0x9aa0b8, 0.55);
    g.strokeRoundedRect(gauche + px(2), haut + px(2), largeur - px(4), hauteur - px(4), px(9));

    // Mèche tressée, qui part du haut du pétard vers la droite.
    g.lineStyle(px(6), 0xd9c49a, 1);
    g.beginPath();
    g.moveTo(cx, haut + px(2));
    g.lineTo(cx + px(8), px(14));
    g.lineTo(cx + px(14), px(8));
    g.strokePath();

    // Étincelle au bout de la mèche — position inchangée (cf. Bomb.fuseTip).
    g.fillStyle(0xffb347, 1);
    g.fillCircle(cx + px(17), px(8), px(7));
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(cx + px(17), px(8), px(3));

    g.generateTexture(TEX_BOMB, size, size);
    g.destroy();
  }

  /**
   * GRAINE DE PIMENT, projetée par poignées à l'explosion.
   *
   * Un disque flou teinté aurait suffi à faire « des particules » — c'est
   * d'ailleurs ce que fait la goutte de jus juste en dessous. Mais on ne
   * verrait pas des GRAINES : à l'explosion du piment, ce qui doit voler, ce
   * sont des objets nets, plats et identifiables, pas une brume colorée.
   *
   * D'où une ellipse aux bords FRANCS, avec son liseré brun et son petit
   * reflet — exactement la graine dessinée dans la chair du piment coupé
   * (cf. fruitArt.ts). Celle qui vole et celle qu'on voit dans la tranche
   * sont la même, et c'est ce qui fait tenir l'illusion.
   *
   * Elle n'est PAS teintée à l'émission, contrairement aux autres particules :
   * une graine de piment est crème, toujours, quelle que soit la couleur du
   * fruit. Elle porte donc ses vraies couleurs dans la texture.
   */
  private createSeedTexture(): void {
    const w = 22;
    const h = 16;
    const tex = this.textures.createCanvas(TEX_SEED, px(w), px(h));
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    const cx = w / 2;
    const cy = h / 2;
    // Corps : dégradé très doux, du crème clair vers le doré.
    const g = ctx.createRadialGradient(cx - w * 0.12, cy - h * 0.16, 1, cx, cy, w * 0.5);
    g.addColorStop(0, '#fff6d2');
    g.addColorStop(0.6, '#f0dc9a');
    g.addColorStop(1, '#dcc072');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.44, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Liseré brun : sans lui, la graine se dissout sur un ciel clair.
    ctx.strokeStyle = 'rgba(138, 100, 34, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Reflet : une graine de piment est lisse et un peu luisante.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.13, cy - h * 0.15, w * 0.13, h * 0.11, -0.4, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  /** Goutte de jus : disque à dégradé radial doux (bord fondu), teinté à l'émission. */
  private createJuiceTexture(): void {
    const size = 28;
    const c = size / 2;
    const tex = this.textures.createCanvas(TEX_JUICE, px(size), px(size));
    if (tex === null) {
      return;
    }
    const ctx = tex.getContext();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.55, 'rgba(255, 255, 255, 0.85)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /**
   * Taches de jus persistantes : blobs irréguliers blancs (teintés à la
   * couleur du fruit à l'affichage). Motifs déterministes — plusieurs
   * variantes pour que deux taches voisines ne se ressemblent pas.
   */
  private createSplatTextures(): void {
    const size = 180;
    const c = size / 2;
    for (let variant = 0; variant < SPLAT_VARIANTS; variant++) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.setScale(RENDER_SCALE);
      // Corps principal de la tache
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(c, c, 34 + variant * 3);
      // Lobes autour du corps (angles décalés par variante)
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 + variant * 0.7;
        const dist = 26 + ((i * 13 + variant * 5) % 22);
        const radius = 7 + ((i * 7 + variant * 3) % 12);
        g.fillCircle(c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, radius);
      }
      // Gouttelettes projetées plus loin
      g.fillStyle(0xffffff, 0.7);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + variant * 1.3 + 0.4;
        const dist = 62 + ((i * 11 + variant * 7) % 20);
        g.fillCircle(c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, 4 + (i % 3) * 2);
      }
      g.generateTexture(`${TEX_SPLAT_PREFIX}${variant}`, px(size), px(size));
      g.destroy();
    }
  }
}
