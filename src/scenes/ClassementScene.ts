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
  reserver,
  codeDeReprise,
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
  /**
   * Onglet ouvert par défaut : le CLASSIQUE.
   *
   * C'est le mode principal du jeu, celui auquel on pense quand on dit
   * « le classement » — et son tableau est un record de tous les temps, donc
   * il y a toujours quelque chose à y voir. Le Défi du jour, lui, est vide
   * chaque matin jusqu'à ce que quelqu'un le relève : ouvrir dessus donnait
   * l'impression d'un classement désert.
   */
  private modeAffiche: GameMode = 'classic';
  /** Tout ce qui se redessine à chaque changement d'onglet. */
  private zoneListe: Phaser.GameObjects.GameObject[] = [];
  private onglets: Phaser.GameObjects.Container[] = [];
  /** Le tirage en cours : sa valeur invalide les réponses arrivées en retard. */
  private requete = 0;
  private piedDePage: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'ClassementScene' });
  }

  /** Vrai quand on arrive ici pour s'inscrire, pas pour regarder. */
  private saisieAuLancement = false;

  init(data: { mode?: GameMode; saisir?: boolean }): void {
    this.modeAffiche = data.mode ?? 'classic';
    this.saisieAuLancement = data.saisir === true;
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
    // Venu de l'écran de fin pour s'inscrire : le panneau s'ouvre tout seul.
    // Le faire chercher un lien en bas d'écran alors qu'il vient de cliquer
    // « Entrer au classement » serait lui demander de le dire deux fois.
    if (this.saisieAuLancement && pseudo() === null) {
      this.time.delayedCall(260, () => this.ouvrirSelecteur());
    }
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
   * Le choix du pseudo : un panneau, et un vrai champ de saisie.
   *
   * DEUX DÉFAUTS CORRIGÉS ICI, ET AUCUN N'ÉTAIT UNE QUESTION DE GOÛT.
   *
   *   1. Le texte sortait à 13,3 px — la taille par défaut d'un <input> dans
   *      le navigateur, c'est-à-dire AUCUN style appliqué. La cause : les
   *      styles étaient écrits dans un attribut `style="…"` où j'interpolais
   *      GAME_FONT, qui vaut `"Fredoka", "Trebuchet MS", sans-serif` — avec des
   *      guillemets DOUBLES. Le premier fermait l'attribut, et tout ce qui
   *      suivait (taille, alignement) partait à la poubelle. Les styles sont
   *      donc posés en propriétés JavaScript : plus aucun texte à échapper,
   *      donc plus aucune façon de se faire piéger.
   *
   *   2. LE PANNEAU SE MESURE EN PARTS D'ÉCRAN, jamais en tailles fixes.
   *      C'est ce qui le rend juste aussi bien sur un téléphone que sur un
   *      moniteur : tout ici est une fraction de `pw` et `ph`, eux-mêmes des
   *      fractions de la scène.
   *
   *      Et le champ HTML se mesure DANS LA MÊME UNITÉ que le reste. Phaser
   *      applique au conteneur DOM la même échelle qu'au canvas — vérifié, sa
   *      transform vaut exactement le facteur d'affichage (0,5417 sur un
   *      téléphone en paysage). Le dimensionner en pixels d'écran, comme je
   *      l'avais d'abord fait, appliquait donc la réduction DEUX FOIS : le
   *      champ occupait 48 % de la largeur sur grand écran et 19 % sur
   *      téléphone, pour un réglage censé être le même.
   */
  private ouvrirSelecteur(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const voile = this.add.rectangle(0, 0, w, h, 0x05141d, 0.93).setOrigin(0).setDepth(300).setInteractive();
    const groupe: Phaser.GameObjects.GameObject[] = [voile];

    // Le panneau occupe une PART de l'écran, jamais une taille fixe : c'est ce
    // qui le rend juste aussi bien sur un téléphone que sur un moniteur.
    const pw = Math.min(w * 0.8, h * 1.25);
    const ph = h * 0.62;
    const px0 = w / 2;
    const py0 = h / 2;
    const cadre = this.add.graphics().setDepth(301);
    cadre.fillStyle(0x0e2b3c, 1);
    cadre.fillRoundedRect(px0 - pw / 2, py0 - ph / 2, pw, ph, px(22));
    cadre.lineStyle(px(4), 0x7fd4ff, 0.85);
    cadre.strokeRoundedRect(px0 - pw / 2, py0 - ph / 2, pw, ph, px(22));
    groupe.push(cadre);

    const titre = this.add
      .text(px0, py0 - ph * 0.34, 'TON PSEUDO', {
        fontFamily: DISPLAY_FONT,
        fontSize: `${Math.round(ph * 0.14)}px`,
        color: '#ffcf40',
        stroke: '#1d2731',
        strokeThickness: px(8),
      })
      .setOrigin(0.5)
      .setDepth(302);
    groupe.push(titre);

    const consigne = this.add
      .text(px0, py0 - ph * 0.19, 'Il apparaîtra à côté de ton score dans le classement.', {
        fontFamily: GAME_FONT,
        fontSize: `${Math.round(ph * 0.062)}px`,
        color: '#cfe3ef',
        align: 'center',
        wordWrap: { width: pw * 0.86 },
      })
      .setOrigin(0.5)
      .setDepth(302);
    groupe.push(consigne);

    // --- Le champ, dimensionné comme tout le reste : en unités logiques ---
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = PSEUDO_MAX;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Ton nom de joueur';
    Object.assign(input.style, {
      width: `${Math.round(pw * 0.74)}px`,
      padding: `${Math.round(ph * 0.035)}px ${Math.round(pw * 0.04)}px`,
      borderRadius: `${Math.round(ph * 0.03)}px`,
      border: `${Math.max(2, Math.round(ph * 0.008))}px solid #7fd4ff`,
      background: '#07202d',
      color: '#ffffff',
      fontFamily: GAME_FONT,
      fontSize: `${Math.round(ph * 0.105)}px`,
      textAlign: 'center',
      outline: 'none',
      boxSizing: 'border-box',
    });
    const champ = this.add.dom(px0, py0 + ph * 0.02, input).setDepth(302);
    groupe.push(champ);

    const aide = this.add
      .text(px0, py0 + ph * 0.22, '', {
        fontFamily: GAME_FONT,
        fontSize: `${Math.round(ph * 0.055)}px`,
        color: '#ffa07a',
        align: 'center',
        wordWrap: { width: pw * 0.86 },
      })
      .setOrigin(0.5)
      .setDepth(302);
    groupe.push(aide);

    const valider = this.add
      .text(px0, py0 + ph * 0.38, 'VALIDER', {
        fontFamily: GAME_FONT,
        fontSize: `${Math.round(ph * 0.1)}px`,
        fontStyle: '700',
        color: '#0b2a3a',
        backgroundColor: '#ffcf40',
        padding: { x: Math.round(pw * 0.06), y: Math.round(ph * 0.035) },
      })
      .setOrigin(0.5)
      .setDepth(302);
    groupe.push(valider);

    input.value = pseudo() ?? '';

    const verifier = (): boolean => {
      const v = input.value.trim();
      const ok = pseudoValide(v);
      aide.setText(v.length === 0 || ok ? '' : 'De 2 à 14 caractères : lettres, chiffres, espace, tiret, apostrophe.');
      valider.setAlpha(ok ? 1 : 0.35);
      return ok;
    };
    input.addEventListener('input', verifier);
    verifier();
    window.setTimeout(() => input.focus(), 60);

    // --- Le champ du code de reprise, caché tant qu'il ne sert pas ---
    //
    // Il n'apparaît QUE si le pseudo demandé appartient déjà à quelqu'un. Le
    // montrer d'emblée obligerait tout le monde à se demander ce que c'est,
    // pour un cas qui ne concerne qu'un joueur sur dix.
    const champCode = document.createElement('input');
    champCode.type = 'text';
    champCode.maxLength = 6;
    champCode.autocomplete = 'off';
    champCode.placeholder = 'CODE';
    Object.assign(champCode.style, {
      width: `${Math.round(pw * 0.3)}px`,
      padding: `${Math.round(ph * 0.03)}px`,
      borderRadius: `${Math.round(ph * 0.03)}px`,
      border: `${Math.max(2, Math.round(ph * 0.008))}px solid #ffa07a`,
      background: '#07202d',
      color: '#ffffff',
      fontFamily: GAME_FONT,
      fontSize: `${Math.round(ph * 0.09)}px`,
      textAlign: 'center',
      textTransform: 'uppercase',
      outline: 'none',
      boxSizing: 'border-box',
    });
    const boiteCode = this.add.dom(px0, py0 + ph * 0.21, champCode).setDepth(302).setVisible(false);
    groupe.push(boiteCode);
    let modeReprise = false;

    const soumettre = (): void => {
      if (!verifier()) {
        return;
      }
      sfx.click();
      const choisi = input.value.trim();
      const code = modeReprise ? champCode.value.trim() : undefined;
      aide.setText('Vérification…').setColor('#cfe3ef');
      valider.setAlpha(0.35);

      void reserver(choisi, code).then((issue) => {
        if (!this.scene.isActive()) {
          return;
        }
        if (!issue.ok) {
          valider.setAlpha(1);
          aide.setColor('#ffa07a');
          if (issue.raison === 'pris') {
            // Le pseudo appartient à quelqu'un. Deux issues pour le joueur :
            // c'est le sien et il a son code, ou il en choisit un autre.
            modeReprise = true;
            boiteCode.setVisible(true);
            champCode.value = codeDeReprise() ?? '';
            aide.setText(
              'Ce pseudo est déjà pris.\nSi c\'est le tien, entre ton code de reprise. Sinon, choisis-en un autre.'
            );
            valider.setText('REPRENDRE');
          } else if (issue.raison === 'refuse') {
            aide.setText('Ce pseudo n\'est pas accepté. Essaie autre chose.');
          } else if (issue.raison === 'forme') {
            aide.setText('De 2 à 14 caractères : lettres, chiffres, espace, tiret, apostrophe.');
          } else {
            aide.setText('Impossible de joindre le classement. Réessaie plus tard.');
          }
          return;
        }

        const retenu = issue.code;
        for (const o of groupe) {
          o.destroy();
        }
        this.rafraichirPiedDePage();
        this.message('Inscription…\nTes records déjà enregistrés partent aussi.');
        void inscrire(choisi).then(() => {
          if (!this.scene.isActive()) {
            return;
          }
          this.rafraichirPiedDePage();
          // LE CODE S'AFFICHE, ET ON LAISSE LE TEMPS DE LE NOTER. C'est la
          // seule fois où le joueur le voit : la base ne le rend plus jamais,
          // pas même à lui, pour qu'une lecture de l'API ne puisse pas servir
          // à voler un pseudo.
          this.message(
            'Pseudo réservé : ' + choisi + '\n\nTon code de reprise : ' + retenu +
              '\nNote-le : il te servira à reprendre ce pseudo sur un autre appareil.',
            '#ffcf40'
          );
          this.time.delayedCall(8000, () => {
            if (this.scene.isActive()) {
              this.charger();
            }
          });
        });
      });
    };

    valider.setInteractive({ useHandCursor: true }).on('pointerdown', soumettre);
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
