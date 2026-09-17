import type { GameMode } from '../utils/constants';
import { todayKey } from '../utils/jour';

/**
 * Le classement en ligne : trois tableaux, un par mode.
 *
 * C'EST LE PREMIER SERVICE DISTANT DU JEU, et il a été ajouté en revenant sur
 * une décision d'origine — « 100 % local, pas de backend ». Tout ce qui suit
 * découle d'une règle : le jeu doit rester ENTIÈREMENT jouable si ce service
 * n'existe pas. Réseau coupé, base en pause, clé révoquée : on n'affiche pas
 * d'erreur, on n'attend pas, on ne bloque rien. Le classement est un bonus,
 * jamais une dépendance.
 *
 * AUCUNE DONNÉE PERSONNELLE. Trois lettres façon borne d'arcade et un
 * identifiant tiré au hasard, gardé dans le navigateur. Pas de compte, pas
 * d'e-mail, pas d'adresse conservée : il n'y a rien à protéger ici, et c'est
 * le choix qui coûte le moins cher à tout le monde.
 *
 * SUR LA TRICHE, soyons honnêtes. Un jeu qui tourne dans le navigateur et qui
 * envoie son score à une API peut toujours être trompé : la clé ci-dessous est
 * publique par conception, et la requête est visible dans n'importe quel
 * navigateur. Ce qui est en place :
 *   - insertion seule — personne ne peut modifier ni effacer le score d'un
 *     autre, et c'est la seule garantie vraiment solide qu'on puisse donner ;
 *   - un plafond de plausibilité côté base — le score doit tenir dans ce que
 *     le nombre de fruits permet, ce qui rend « 999999999 » impossible ;
 *   - une limite d'envoi de quinze secondes par joueur.
 * Ça arrête les curieux, pas les déterminés. Un classement web sans compte ne
 * peut pas promettre mieux, et mieux vaut le dire que le laisser croire.
 */

/** Clé publique, destinée à être lue par tous : c'est RLS qui protège. */
const SUPABASE_URL = 'https://rktueomslxjqtvighgcg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_R20Ob1300eTJrl0r5D87Ng_4JO1w9vW';

const CLE_JOUEUR = 'kout-sab-joueur';
const CLE_INITIALES = 'kout-sab-initiales';
const CLE_FILE = 'kout-sab-envois-en-attente';
/** Au-delà, on abandonne : une file qui gonfle est une fuite, pas une file. */
const FILE_MAX = 12;
/** Le jeu ne doit jamais attendre le réseau. */
const DELAI_MS = 6000;

export interface Entree {
  initiales: string;
  score: number;
  fruits: number;
  combo_max: number;
}

interface Envoi {
  mode: GameMode;
  jour: string | null;
  initiales: string;
  score: number;
  fruits: number;
  combo_max: number;
  joueur: string;
}

function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireLocal(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Stockage refusé (navigation privée) : la session marchera quand même,
    // le joueur repartira simplement d'un identifiant neuf la prochaine fois.
  }
}

/**
 * L'identifiant de navigateur — PAS un identifiant d'utilisateur.
 *
 * Il ne sert qu'à deux choses : garder une seule entrée par personne et par
 * jour au Défi, et appliquer la limite d'envoi. Il est tiré au hasard, ne
 * quitte jamais l'appareil autrement que dans ces deux usages, et n'est
 * rattaché à rien.
 */
export function idJoueur(): string {
  const existant = lireLocal(CLE_JOUEUR);
  if (existant !== null && existant.length === 36) {
    return existant;
  }
  const neuf =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : // Repli pour les navigateurs sans randomUUID : même format, même rôle.
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  ecrireLocal(CLE_JOUEUR, neuf);
  return neuf;
}

/** Les trois lettres du joueur, ou null tant qu'il ne les a pas choisies. */
export function initiales(): string | null {
  const v = lireLocal(CLE_INITIALES);
  return v !== null && /^[A-Z]{3}$/.test(v) ? v : null;
}

export function definirInitiales(valeur: string): void {
  const propre = valeur.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'A');
  ecrireLocal(CLE_INITIALES, propre);
}

function lireFile(): Envoi[] {
  try {
    const brut = lireLocal(CLE_FILE);
    if (brut === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(brut);
    return Array.isArray(parsed) ? (parsed as Envoi[]) : [];
  } catch {
    return [];
  }
}

function ecrireFile(file: Envoi[]): void {
  ecrireLocal(CLE_FILE, JSON.stringify(file.slice(-FILE_MAX)));
}

/**
 * Issue d'un envoi. TROIS ÉTATS, ET PAS DEUX.
 *
 * Un booléen mentait ici, et mon propre test l'a pris en flagrant délit : une
 * deuxième tentative du Défi le même jour est refusée par la base, mais elle
 * ne doit pas non plus être remise en file — elle sera refusée pour toujours.
 * Avec un seul booléen, « ne pas remettre en file » devenait « envoyé », donc
 * la fonction déclarait un succès là où le serveur avait dit non.
 *
 * Aucun appelant n'en dépendait encore. C'est précisément le bon moment.
 */
type Issue = 'ok' | 'refuse' | 'reessayer';

async function poster(envoi: Envoi): Promise<Issue> {
  const controleur = new AbortController();
  const minuteur = window.setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
      method: 'POST',
      signal: controleur.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(envoi),
    });
    if (reponse.ok) {
      return 'ok';
    }
    // 409 = déjà joué aujourd'hui, 400 = refusé par une contrainte. L'envoi ne
    // passera JAMAIS : on le retire de la file plutôt que de le retenter
    // éternellement. Seules les pannes réseau et les 5xx méritent une reprise.
    return reponse.status >= 400 && reponse.status < 500 ? 'refuse' : 'reessayer';
  } catch {
    return 'reessayer';
  } finally {
    window.clearTimeout(minuteur);
  }
}

/**
 * Rejoue les envois qui n'étaient pas passés.
 *
 * Appelé au lancement : une partie jouée dans l'avion remonte au prochain
 * démarrage avec du réseau. Silencieux de bout en bout — le joueur n'a pas à
 * savoir que ça existe.
 */
export async function viderLaFile(): Promise<void> {
  const file = lireFile();
  if (file.length === 0) {
    return;
  }
  const restants: Envoi[] = [];
  for (const envoi of file) {
    if ((await poster(envoi)) === 'reessayer') {
      restants.push(envoi);
    }
  }
  ecrireFile(restants);
}

/**
 * Dépose un score. Ne rejette jamais, n'attend jamais le réseau pour rendre
 * la main au jeu : en cas de panne l'envoi part dans la file et repartira au
 * prochain lancement.
 *
 * Renvoie vrai UNIQUEMENT si la ligne a été créée. Un refus du serveur — la
 * deuxième tentative du Défi dans la même journée, par exemple — renvoie faux
 * et ne va pas en file : il serait refusé à chaque reprise.
 */
export async function envoyer(
  mode: GameMode,
  score: number,
  fruits: number,
  comboMax: number
): Promise<boolean> {
  const lettres = initiales();
  if (lettres === null) {
    return false; // pas encore d'initiales : rien à déposer
  }
  const envoi: Envoi = {
    mode,
    jour: mode === 'daily' ? todayKey() : null,
    initiales: lettres,
    score,
    fruits,
    combo_max: comboMax,
    joueur: idJoueur(),
  };
  const issue = await poster(envoi);
  if (issue === 'reessayer') {
    ecrireFile([...lireFile(), envoi]);
  }
  return issue === 'ok';
}

async function lire(chemin: string): Promise<Entree[]> {
  const controleur = new AbortController();
  const minuteur = window.setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
      signal: controleur.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!reponse.ok) {
      return [];
    }
    const lignes: unknown = await reponse.json();
    return Array.isArray(lignes) ? (lignes as Entree[]) : [];
  } catch {
    // Hors ligne, base en pause, service en panne : un tableau vide. La scène
    // affichera « classement indisponible » et le jeu continuera.
    return [];
  } finally {
    window.clearTimeout(minuteur);
  }
}

const CHAMPS = 'initiales,score,fruits,combo_max';

/** Le classement du Défi du jour — celui du jour demandé, aujourd'hui par défaut. */
export function lireDefi(jour = todayKey(), limite = 20): Promise<Entree[]> {
  return lire(
    `scores?mode=eq.daily&jour=eq.${jour}&select=${CHAMPS}&order=score.desc&limit=${limite}`
  );
}

/**
 * Les records de tous les temps en Classique ou en Chrono.
 *
 * Passe par la vue `records`, qui ne garde que le MEILLEUR score de chaque
 * joueur. Sans elle, quelqu'un qui joue beaucoup occuperait tout le tableau
 * avec ses vingt meilleures parties, ce qui n'intéresse personne.
 */
export function lireRecords(mode: 'classic' | 'chrono', limite = 20): Promise<Entree[]> {
  return lire(`records?mode=eq.${mode}&select=${CHAMPS}&order=score.desc&limit=${limite}`);
}
