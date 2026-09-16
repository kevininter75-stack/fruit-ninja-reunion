import { todayKey } from './jour';

/**
 * Les mutations du Défi du jour : une règle qui change, annoncée avant de jouer.
 *
 * POURQUOI IL EN FALLAIT. Le Défi tirait déjà sa séquence de fruits de la date,
 * donc tout le monde recevait la même partie — mais une séquence tirée au hasard
 * ressemble à n'importe quelle autre. Deux jours de suite étaient rigoureusement
 * indiscernables à l'œil. Le mode promettait un rendez-vous quotidien et servait
 * une partie Classique de plus.
 *
 * Wordle ne tient pas parce que sa grille est tirée au sort, il tient parce
 * qu'on VOIT qu'elle a changé. C'est ce que la mutation apporte : une règle
 * qu'on lit sur la carte du menu avant d'appuyer, dont on parle, et qui fait
 * qu'un jour ne se joue pas comme le précédent.
 *
 * Et un objectif chiffré avec elle. Sans objectif, un score n'est qu'un nombre ;
 * avec lui il y a réussite ou échec, et le partage devient ✅ ou ❌ — c'est ce
 * qui distingue un défi d'une partie.
 */

export type MutationId =
  | 'ale-retour'
  | 'sezon-piment'
  | 'saison-cyclone'
  | 'brume'
  | 'une-vie';

export interface Mutation {
  id: MutationId;
  /** Nom court, affiché sur la carte du menu. */
  nom: string;
  /** Une ligne : ce que la règle change, lisible avant de jouer. */
  description: string;
  couleur: number;
  /**
   * Barème de l'objectif. Une mutation qui étouffe le score abaisse la barre,
   * une mutation qui en offre la relève — sinon « une seule vie » serait
   * infaisable le jour où il tombe, et « saison cyclone » offert.
   */
  exigence: number;
}

/**
 * Le catalogue. Il est volontairement court : cinq règles qui tournent se
 * reconnaissent et s'anticipent, vingt règles ne seraient qu'un bruit de fond.
 *
 * NOMS À VALIDER PAR KEVIN. « Sézon piment » est de mon invention, et je ne suis
 * pas légitime là-dessus (cf. la règle posée dans utils/creole.ts) : ces noms
 * attendent sa correction, sur l'orthographe comme sur la tournure.
 */
export const MUTATIONS: readonly Mutation[] = [
  {
    id: 'ale-retour',
    nom: 'Alé-retour',
    description: 'Tout arrive par les côtés. Plus rien ne monte du bas.',
    couleur: 0x4fb3d9,
    exigence: 0.9,
  },
  {
    id: 'sezon-piment',
    nom: 'Sézon piment',
    description: 'Les piments cabri pleuvent. Trois fois plus que d’habitude.',
    couleur: 0xe03418,
    exigence: 0.85,
  },
  {
    id: 'saison-cyclone',
    nom: 'Saison cyclone',
    description: 'Le fruit cyclone passe toutes les quinze secondes.',
    couleur: 0x6f68d8,
    exigence: 1.3,
  },
  {
    id: 'brume',
    nom: 'Brume des Hauts',
    description: 'La brume monte par vagues. Les fruits sortent tard.',
    couleur: 0xa8c0cf,
    exigence: 0.8,
  },
  {
    id: 'une-vie',
    nom: 'Une seule vie',
    description: 'Un fruit manqué et c’est fini. Une seule croix.',
    couleur: 0xffcf40,
    exigence: 0.55,
  },
];

/**
 * Hachage FNV-1a d'une chaîne.
 *
 * IL NE FAUT SURTOUT PAS TIRER LA MUTATION AVEC LE HASARD DE LA PARTIE. Le Défi
 * sème le générateur du jeu avec la date pour que la séquence de fruits soit la
 * même pour tous ; y puiser un tirage de plus décalerait toute la suite. La
 * mutation se déduit donc de la date par son propre calcul, sans toucher à rien.
 */
function hachage(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * La mutation du jour.
 *
 * Le suffixe distingue ce tirage de celui de la graine de jeu : deux calculs
 * partant de la même date ne doivent pas se retrouver corrélés par accident.
 */
export function mutationDuJour(date = new Date()): Mutation {
  const index = hachage('mutation-' + todayKey(date)) % MUTATIONS.length;
  return MUTATIONS[index];
}

/** Barème de base de l'objectif, avant ajustement par la mutation. */
const OBJECTIF_BASE = 1200;
/** Amplitude du jour : l'objectif respire d'un jour à l'autre. */
const OBJECTIF_AMPLITUDE = 320;

/**
 * L'objectif du jour, en points.
 *
 * Calé sur le seuil de la médaille d'argent du Classique (1200) plutôt que sur
 * l'or : un objectif qu'on n'atteint qu'un jour sur dix cesse d'être un
 * objectif et devient une décoration. Il doit se rater, mais se rater de peu.
 */
export function objectifDuJour(date = new Date()): number {
  const m = mutationDuJour(date);
  const variation = (hachage('objectif-' + todayKey(date)) % (OBJECTIF_AMPLITUDE * 2)) - OBJECTIF_AMPLITUDE;
  const brut = (OBJECTIF_BASE + variation) * m.exigence;
  // Arrondi à la cinquantaine : un objectif à 1 147 points ne se retient pas.
  return Math.round(brut / 50) * 50;
}
