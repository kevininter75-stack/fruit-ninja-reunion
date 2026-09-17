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
import {
  lireDefi,
  lireRecords,
  pseudo,
  pseudoValide,
  inscrire,
  PSEUDO_MAX,
  type Entree,
} from '../systems/Classement';
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

    const mien = pseudo();
    const haut = h * 0.3;
    const pas = Math.min(px(46), (h * 0.55) / LIGNES_MAX);
    const gauche = w / 2 - px(250);

    entrees.forEach((e, i) => {
      const y = haut + i * pas;
      const moi = mien !== null && e.pseudo === mien;
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
        this.add.text(gauche + px(70), y, e.pseudo, style).setOrigin(0, 0.5),
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
    const mien = pseudo();
    this.piedDePage?.setText(
      mien === null ? '▸ Choisis ton pseudo pour entrer au classement' : `Ton pseudo : ${mien}  ▸ changer`
    );
  }

  /**
   * Le choix du pseudo : un vrai champ de saisie posé sur le canvas.
   *
   * POURQUOI UN ÉLÉMENT HTML ET PAS UN CLAVIER DESSINÉ. Réécrire un clavier
   * dans Phaser, c'est réécrire aussi les accents, la sélection, le
   * copier-coller et les suggestions — pour un champ qu'on remplit UNE FOIS
   * dans la vie du joueur. Le champ du système fait tout cela, et le clavier
   * qu'il ouvre est celui que la personne connaît déjà.
   *
   * La validation est dite AVANT le refus : le bouton reste éteint tant que le
   * pseudo ne passe pas, avec la raison sous le champ. Envoyer pour apprendre
   * que c'est refusé serait la pire des deux façons.
   */
  private ouvrirSelecteur(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const voile = this.add.rectangle(0, 0, w, h, 0x05141d, 0.92).setOrigin(0).setDepth(300).setInteractive();
    const groupe: Phaser.GameObjects.GameObject[] = [voile];

    const titre = this.add
      .text(w / 2, h * 0.3, 'TON PSEUDO', {
        fontFamily: DISPLAY_FONT,
        fontSize: fontPx(52),
        color: '#ffcf40',
        stroke: '#1d2731',
        strokeThickness: px(8),
      })
      .setOrigin(0.5)
      .setDepth(301);
    groupe.push(titre);

    const champ = this.add
      .dom(w / 2, h * 0.47)
      .createFromHTML(
        `<input type="text" maxlength="${PSEUDO_MAX}" autocomplete="off" autocapitalize="words"
           spellcheck="false" placeholder="Ton nom de joueur"
           style="width:${px(520)}px;padding:${px(14)}px ${px(18)}px;border-radius:${px(12)}px;
                  border:${px(3)}px solid #7fd4ff;background:#0e2b3c;color:#ffffff;
                  font-family:${GAME_FONT};font-size:${px(34)}px;text-align:center;outline:none;">`
      )
      .setDepth(301);
    groupe.push(champ);

    const aide = this.add
      .text(w / 2, h * 0.58, '', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(22),
        color: '#ffa07a',
        align: 'center',
        wordWrap: { width: w * 0.8 },
      })
      .setOrigin(0.5)
      .setDepth(301);
    groupe.push(aide);

    const valider = this.add
      .text(w / 2, h * 0.72, 'VALIDER', {
        fontFamily: GAME_FONT,
        fontSize: fontPx(38),
        fontStyle: '700',
        color: '#0b2a3a',
        backgroundColor: '#ffcf40',
        padding: { x: px(28), y: px(12) },
      })
      .setOrigin(0.5)
      .setDepth(301);
    groupe.push(valider);

    const entree = champ.getChildByName('') as HTMLInputElement | null;
    const input = entree ?? (champ.node.querySelector('input') as HTMLInputElement);
    input.value = pseudo() ?? '';

    const verifier = (): boolean => {
      const v = input.value.trim();
      const ok = pseudoValide(v);
      aide.setText(
        v.length === 0
          ? ''
          : ok
            ? ''
            : 'De 2 à 14 caractères : lettres, chiffres, espace, tiret, apostrophe.'
      );
      valider.setAlpha(ok ? 1 : 0.35);
      return ok;
    };
    input.addEventListener('input', verifier);
    verifier();
    // Le focus à l'ouverture évite un toucher de plus, et fait monter le
    // clavier du téléphone au bon moment.
    window.setTimeout(() => input.focus(), 60);

    const soumettre = (): void => {
      if (!verifier()) {
        return;
      }
      sfx.click();
      const choisi = input.value.trim();
      for (const o of groupe) {
        o.destroy();
      }
      this.rafraichirPiedDePage();
      this.message('Inscription…\nTes records déjà enregistrés partent aussi.');
      void inscrire(choisi).then(() => {
        if (this.scene.isActive()) {
          this.rafraichirPiedDePage();
          this.charger();
        }
      });
    };

    valider.setInteractive({ useHandCursor: true }).on('pointerdown', soumettre);
    // La touche Entrée vaut validation : c'est le geste attendu dans un champ,
    // et sur téléphone c'est le bouton « OK » du clavier.
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        soumettre();
      }
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
