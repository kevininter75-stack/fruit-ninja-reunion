import Phaser from 'phaser';
import {
  GAME_FONT,
  DISPLAY_FONT,
  px,
  fontPx,
  type GameMode,
} from '../utils/constants';
import { addVignette, fadeIn, fadeToScene } from '../utils/ui';
import { AnimatedBackground } from '../entities/AnimatedBackground';
import { SceneGrading } from '../systems/SceneGrading';
import { sfx } from '../systems/SfxManager';
import { lireDefi, lireRecords, initiales, inscrire, type Entree } from '../systems/Classement';
import { mutationDuJour } from '../utils/mutations';

/**
 * L'écran de classement : trois tableaux, un par mode.
 *
 * TROIS ÉTATS À DESSINER, ET C'EST TOUT L'ENJEU. Un classement en ligne n'est
 * pas une liste, c'est une liste QUI PEUT NE PAS ARRIVER. Chargement, vide,
 * indisponible : chacun a son message, et aucun ne ressemble à une panne du
 * jeu. Un joueur hors ligne doit comprendre que c'est le classement qui dort,
 * pas Kout Sab' qui est cassé.
 *
 * Le choix des trois lettres vit ici plutôt que sur l'écran de fin. C'est au
 * moment où l'on regarde le tableau qu'on a envie d'y figurer — et l'écran de
 * fin est déjà chargé de son titre, de son score, de sa médaille et de ses
 * boutons.
 */

const ONGLETS: ReadonlyArray<{ mode: GameMode; libelle: string }> = [
  { mode: 'classic', libelle: 'CLASSIQUE' },
  { mode: 'chrono', libelle: 'CHRONO' },
  { mode: 'daily', libelle: 'DÉFI DU JOUR' },
];

const LIGNES_MAX = 10;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class ClassementScene extends Phaser.Scene {
  private modeAffiche: GameMode = 'daily';
  /** Tout ce qui se redessine à chaque changement d'onglet. */
  private zoneListe: Phaser.GameObjects.GameObject[] = [];
  private onglets: Phaser.GameObjects.Container[] = [];
  /** Le tirage en cours : sa valeur invalide les réponses arrivées en retard. */
  private requete = 0;
  private piedDePage: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'ClassementScene' });
  }

  init(data: { mode?: GameMode }): void {
    this.modeAffiche = data.mode ?? 'daily';
    this.zoneListe = [];
    this.onglets = [];
    this.requete = 0;
    this.piedDePage = null;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    new SceneGrading(this);
    new AnimatedBackground(this, true);
    this.add.rectangle(0, 0, w, h, 0x0b2a3a, 0.72).setOrigin(0);
    addVignette(this);

    this.add
      .text(w / 2, h * 0.09, 'CLASSEMENT', {
        fontFamily: DISPLAY_FONT,
        fontSize: fontPx(64),
        color: '#ffcf40',
        stroke: '#1d2731',
        strokeThickness: px(9),
      })
      .setOrigin(0.5);

    this.creerOnglets();
    this.creerPiedDePage();
    this.creerBoutonRetour();
    this.charger();
    fadeIn(this);
  }

  private creerOnglets(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const largeur = Math.min(px(280), (w - px(40)) / 3 - px(8));
    const pas = largeur + px(10);
    const depart = w / 2 - pas;

    ONGLETS.forEach((onglet, i) => {
      const x = depart + i * pas;
      const y = h * 0.19;
      const actif = onglet.mode === this.modeAffiche;
      const conteneur = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(actif ? 0xffcf40 : 0x1d3a4d, actif ? 1 : 0.85);
      g.fillRoundedRect(-largeur / 2, -px(26), largeur, px(52), px(26));
      g.lineStyle(px(3), 0xffffff, actif ? 0.9 : 0.35);
      g.strokeRoundedRect(-largeur / 2, -px(26), largeur, px(52), px(26));
      conteneur.add(g);
      conteneur.add(
        this.add
          .text(0, 0, onglet.libelle, {
            fontFamily: GAME_FONT,
            fontSize: fontPx(24),
            fontStyle: '700',
            color: actif ? '#3a2a00' : '#cfe3ef',
          })
          .setOrigin(0.5)
      );
      conteneur
        .setSize(largeur, px(52))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.modeAffiche === onglet.mode) {
            return;
          }
          sfx.click();
          this.modeAffiche = onglet.mode;
          this.onglets.forEach((c) => c.destroy());
          this.onglets = [];
          this.creerOnglets();
          this.charger();
        });
      this.onglets.push(conteneur);
    });
  }

  /** Efface la liste précédente. Appelé avant chaque nouveau rendu. */
  private viderListe(): void {
    for (const o of this.zoneListe) {
      o.destroy();
    }
    this.zoneListe = [];
  }

  private message(texte: string, couleur = '#cfe3ef'): void {
    this.viderListe();
    this.zoneListe.push(
      this.add
        .text(this.scale.width / 2, this.scale.height * 0.5, texte, {
          fontFamily: GAME_FONT,
          fontSize: fontPx(28),
          color: couleur,
          align: 'center',
          wordWrap: { width: this.scale.width * 0.8 },
        })
        .setOrigin(0.5)
    );
  }

  private charger(): void {
    const mien = ++this.requete;
    const mode = this.modeAffiche;
    this.message('Chargement…');

    const promesse =
      mode === 'daily' ? lireDefi(undefined, LIGNES_MAX) : lireRecords(mode, LIGNES_MAX);

    void promesse.then((entrees) => {
      // Une réponse qui arrive après un changement d'onglet ne doit RIEN
      // peindre : sans ce test, un réseau lent afficherait le classement du
      // Chrono par-dessus celui du Défi qu'on est en train de regarder.
      if (mien !== this.requete || !this.scene.isActive()) {
        return;
      }
      this.afficher(entrees);
    });
  }

  private afficher(entrees: Entree[]): void {
    this.viderListe();
    const w = this.scale.width;
    const h = this.scale.height;

    if (entrees.length === 0) {
      this.message(
        this.modeAffiche === 'daily'
          ? 'Personne n’a encore relevé le défi du jour.\nÀ toi de l’ouvrir !'
          : 'Aucun score pour l’instant.\nLe premier à jouer prend la tête.',
        '#ffd9a0'
      );
      return;
    }

    if (this.modeAffiche === 'daily') {
      const m = mutationDuJour();
      this.zoneListe.push(
        this.add
          .text(w / 2, h * 0.255, m.nom, {
            fontFamily: GAME_FONT,
            fontSize: fontPx(22),
            fontStyle: '700',
            color: '#ffd9a0',
          })
          .setOrigin(0.5)
      );
    }

    const mes = initiales();
    const haut = h * 0.3;
    const pas = Math.min(px(46), (h * 0.55) / LIGNES_MAX);
    const gauche = w / 2 - px(250);

    entrees.forEach((e, i) => {
      const y = haut + i * pas;
      const moi = mes !== null && e.initiales === mes;
      const couleur = moi ? '#ffcf40' : i === 0 ? '#ffe9b0' : '#e8f1f7';

      if (moi) {
        // Le sien se repère d'un coup d'œil : c'est la seule chose qu'on
        // cherche vraiment en ouvrant un classement.
        const fond = this.add
          .rectangle(w / 2, y, px(520), pas - px(4), 0xffcf40, 0.14)
          .setOrigin(0.5);
        this.zoneListe.push(fond);
      }
      const style = {
        fontFamily: GAME_FONT,
        fontSize: fontPx(28),
        fontStyle: moi ? ('700' as const) : ('500' as const),
        color: couleur,
      };
      this.zoneListe.push(
        this.add.text(gauche, y, `${i + 1}`.padStart(2, ' '), style).setOrigin(0, 0.5),
        this.add.text(gauche + px(70), y, e.initiales, style).setOrigin(0, 0.5),
        // Les chiffres alignés à droite : un classement se lit en colonne.
        this.add.text(gauche + px(330), y, `${e.score}`, style).setOrigin(1, 0.5),
        this.add
          .text(
            gauche + px(500),
            y,
            // Un record importé d'avant le classement n'a pas de compte de
            // fruits : on le dit, plutôt que d'afficher « 0 fruits ».
            e.fruits === null ? 'record importé' : `${e.fruits} fruits`,
            { ...style, fontSize: fontPx(20), color: '#9fb4c2' }
          )
          .setOrigin(1, 0.5)
      );
    });
  }

  private creerPiedDePage(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.piedDePage = this.add
      .text(w / 2, h * 0.9, '', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(24),
        color: '#cfe3ef',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx.click();
        this.ouvrirSelecteur();
      });
    this.rafraichirPiedDePage();
  }

  private rafraichirPiedDePage(): void {
    const mes = initiales();
    this.piedDePage?.setText(
      mes === null ? '▸ Choisis tes initiales pour entrer au classement' : `Tes initiales : ${mes}  ▸ changer`
    );
  }

  /**
   * Le sélecteur de trois lettres, façon borne d'arcade.
   *
   * Pas de champ de saisie : un clavier virtuel qui s'ouvre sur un jeu en
   * plein écran paysage casse la mise en page, et laisse taper n'importe quoi.
   * Trois molettes de lettres ne peuvent produire qu'une valeur valide.
   */
  private ouvrirSelecteur(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const depart = initiales() ?? 'AAA';
    const choix = [...depart].map((c) => Math.max(0, LETTRES.indexOf(c)));

    const voile = this.add.rectangle(0, 0, w, h, 0x05141d, 0.9).setOrigin(0).setDepth(300).setInteractive();
    const groupe: Phaser.GameObjects.GameObject[] = [voile];
    // Tous les objets posés ici sont des Text ou des Rectangle : ils ont bien
    // une profondeur. Le type le dit, plutôt qu'un appel optionnel qui masquait
    // la question.
    const ajouter = <T extends Phaser.GameObjects.Text>(o: T): T => {
      o.setDepth(301);
      groupe.push(o);
      return o;
    };

    ajouter(
      this.add
        .text(w / 2, h * 0.28, 'TES INITIALES', {
          fontFamily: DISPLAY_FONT,
          fontSize: fontPx(48),
          color: '#ffcf40',
          stroke: '#1d2731',
          strokeThickness: px(8),
        })
        .setOrigin(0.5)
    );

    const lettres: Phaser.GameObjects.Text[] = [];
    const ecart = px(110);
    for (let i = 0; i < 3; i++) {
      const x = w / 2 + (i - 1) * ecart;
      const lettre = ajouter(
        this.add
          .text(x, h * 0.5, LETTRES[choix[i]], {
            fontFamily: DISPLAY_FONT,
            fontSize: fontPx(86),
            color: '#ffffff',
            stroke: '#2d3a4a',
            strokeThickness: px(9),
          })
          .setOrigin(0.5)
      );
      lettres.push(lettre);

      const fleche = (dy: number, sens: number): void => {
        ajouter(
          this.add
            .text(x, h * 0.5 + dy, sens > 0 ? '▲' : '▼', {
              fontFamily: GAME_FONT,
              fontSize: fontPx(44),
              color: '#7fd4ff',
            })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              sfx.click();
              choix[i] = (choix[i] + sens + LETTRES.length) % LETTRES.length;
              lettre.setText(LETTRES[choix[i]]);
            })
        );
      };
      fleche(-px(90), 1);
      fleche(px(90), -1);
    }

    const valider = ajouter(
      this.add
        .text(w / 2, h * 0.76, 'VALIDER', {
          fontFamily: GAME_FONT,
          fontSize: fontPx(38),
          fontStyle: '700',
          color: '#0b2a3a',
          backgroundColor: '#ffcf40',
          padding: { x: px(28), y: px(12) },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
    );
    valider.on('pointerdown', () => {
      sfx.click();
      for (const o of groupe) {
        o.destroy();
      }
      this.rafraichirPiedDePage();
      this.message('Inscription…\nTes records déjà enregistrés partent aussi.');
      // inscrire() dépose la dernière partie puis les records en mémoire. Il
      // attend entre deux envois (la base refuse deux dépôts à moins de quinze
      // secondes), donc on redessine le tableau APRÈS — sinon il s'afficherait
      // encore vide alors que les scores sont en route.
      void inscrire(choix.map((k) => LETTRES[k]).join('')).then(() => {
        if (this.scene.isActive()) {
          this.rafraichirPiedDePage();
          this.charger();
        }
      });
    });
  }

  private creerBoutonRetour(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const bouton = this.add.container(w / 2, h * 0.965);
    const g = this.add.graphics();
    g.fillStyle(0x2d3a4a, 1);
    g.fillRoundedRect(-px(110), -px(28), px(220), px(56), px(28));
    g.lineStyle(px(3), 0xffffff, 0.8);
    g.strokeRoundedRect(-px(110), -px(28), px(220), px(56), px(28));
    bouton.add(g);
    bouton.add(
      this.add
        .text(0, 0, 'Menu', { fontFamily: GAME_FONT, fontSize: fontPx(32), fontStyle: '700', color: '#ffffff' })
        .setOrigin(0.5)
    );
    bouton
      .setSize(px(220), px(56))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx.click();
        fadeToScene(this, 'MenuScene');
      });
  }
}
