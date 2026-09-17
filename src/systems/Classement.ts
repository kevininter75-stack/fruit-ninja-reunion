import type { GameMode } from '../utils/constants';
import { todayKey } from '../utils/jour';
import { getBestScore } from '../utils/bestScore';
import { getTodayResult } from './../utils/dailyChallenge';

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
 * UN PSEUDO LIBRE, ET CE N'EST PLUS ANODIN. Avec trois lettres d'arcade, la
 * base ne pouvait contenir aucune donnée personnelle — par construction. Un
 * champ libre, si : quelqu'un peut y taper son vrai nom. Il n'y a ni compte ni
 * e-mail, et rien n'est recoupé avec quoi que ce soit, mais la promesse n'est
 * plus « il n'y a rien à protéger », elle est « on n'en demande pas ».
 *
 * La contrepartie de la liberté est la modération : forme imposée, liste de
 * mots refusés, et suppression possible depuis le tableau de bord — RLS
 * n'accorde de DELETE à personne d'autre.
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
const CLE_PSEUDO = 'kout-sab-pseudo';
const CLE_FILE = 'kout-sab-envois-en-attente';
const CLE_DERNIER = 'kout-sab-dernier-resultat';
const CLE_IMPORTE = 'kout-sab-records-importes';
const CLE_CODE = 'kout-sab-code-reprise';
const CLE_DEFI_ENVOYE = 'kout-sab-defi-envoye';
/** Au-delà, on abandonne : une file qui gonfle est une fuite, pas une file. */
const FILE_MAX = 12;
/** Le jeu ne doit jamais attendre le réseau. */
const DELAI_MS = 6000;

export interface Entree {
  pseudo: string;
  score: number;
  /** null pour un record importé : le jeu ne gardait alors pas les fruits. */
  fruits: number | null;
  combo_max: number;
}

interface Envoi {
  mode: GameMode;
  jour: string | null;
  pseudo: string;
  score: number;
  fruits: number | null;
  combo_max: number;
  joueur: string;
}

/** Une partie terminée avant que le joueur n'ait choisi ses initiales. */
interface Resultat {
  mode: GameMode;
  score: number;
  fruits: number;
  comboMax: number;
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

/**
 * La forme qu'un pseudo doit avoir, ici ET dans la base.
 *
 * DEUX FOIS LA MÊME RÈGLE, ET CE N'EST PAS UN OUBLI. Celle du client rend la
 * main tout de suite quand on tape, celle de la base est la seule qui compte —
 * un formulaire se contourne, une contrainte non. Si elles divergeaient un
 * jour, c'est la base qui aurait raison, et le joueur verrait un refus qu'il
 * n'a pas mérité : les garder identiques est donc une obligation.
 *
 * De 2 à 14 caractères, commençant par une lettre ou un chiffre. Lettres
 * accentuées comprises (on est à La Réunion), chiffres, espace, tiret,
 * apostrophe, point. Rien d'autre : ni URL, ni caractère invisible, ni emoji.
 */
export const PSEUDO_MOTIF = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 '.-]{1,13}$/;
export const PSEUDO_MAX = 14;

/** Vrai si ce pseudo a une chance d'être accepté par la base. */
export function pseudoValide(valeur: string): boolean {
  const propre = valeur.trim();
  return PSEUDO_MOTIF.test(propre) && !/  /.test(propre);
}

/** Le pseudo du joueur, ou null tant qu'il ne l'a pas choisi. */
export function pseudo(): string | null {
  const v = lireLocal(CLE_PSEUDO);
  return v !== null && pseudoValide(v) ? v : null;
}

export function definirPseudo(valeur: string): void {
  const propre = valeur.trim().replace(/\s+/g, ' ').slice(0, PSEUDO_MAX);
  if (pseudoValide(propre)) {
    ecrireLocal(CLE_PSEUDO, propre);
  }
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
  fruits: number | null,
  comboMax: number
): Promise<boolean> {
  const nom = pseudo();
  if (nom === null) {
    return false; // pas encore de pseudo : rien à déposer
  }
  const envoi: Envoi = {
    mode,
    jour: mode === 'daily' ? todayKey() : null,
    pseudo: nom,
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

const CHAMPS = 'pseudo,score,fruits,combo_max';

/**
 * Le classement du Défi du jour — celui du jour demandé, aujourd'hui par défaut.
 *
 * Passe par la vue `classement_defi`, qui ne garde qu'UNE ligne par joueur et
 * par jour. L'index unique de la table ne couvrait que le navigateur : la même
 * personne, sur son téléphone puis sur son ordinateur, y figurait deux fois.
 */
export function lireDefi(jour = todayKey(), limite = 20): Promise<Entree[]> {
  return lire(
    `classement_defi?jour=eq.${jour}&select=${CHAMPS}&order=score.desc&limit=${limite}`
  );
}

/**
 * Les records de tous les temps en Classique ou en Chrono.
 *
 * Passe par la vue `records`, qui ne garde que le MEILLEUR score de chaque
 * joueur. Sans elle, quelqu'un qui joue beaucoup occuperait tout le tableau
 * avec ses vingt meilleures parties, ce qui n'intéresse personne.
 *
 * Le dédoublonnage se fait sur le PSEUDO — sans accent ni majuscule — et non
 * sur l'identifiant de navigateur : la même personne sur deux appareils ne
 * doit pas occuper deux lignes.
 */
export function lireRecords(mode: 'classic' | 'chrono', limite = 20): Promise<Entree[]> {
  return lire(`records?mode=eq.${mode}&select=${CHAMPS}&order=score.desc&limit=${limite}`);
}

/**
 * Retient la dernière partie tant que le joueur n'a pas ses initiales.
 *
 * SANS ÇA, LE PREMIER SCORE EST PERDU — et c'est souvent le meilleur. Quelqu'un
 * à qui on partage le lien joue, fait un beau score, et rien ne part : il lui
 * faudrait découvrir l'écran de classement, choisir ses lettres, puis rejouer.
 * Le résultat est donc mis de côté et déposé dès que les initiales existent.
 */
export function retenirResultat(mode: GameMode, score: number, fruits: number, comboMax: number): void {
  if (pseudo() !== null) {
    return; // rien à retenir : il est déjà parti
  }
  // UNE ATTENTE PAR MODE, ET C'EST UNE CORRECTION. Il n'y en avait qu'une pour
  // tout le jeu : un joueur qui faisait son Défi du jour PUIS une partie
  // Classique voyait la seconde écraser la première, et son Défi ne montait
  // jamais. Trois modes, trois résultats en attente — ils ne se marchent plus
  // dessus.
  //
  // Et on garde le MEILLEUR de chaque mode, pas le dernier : on peut enchaîner
  // cinq parties avant de choisir son pseudo, ce serait dommage que ce soit la
  // plus mauvaise qui monte.
  const attentes = lireAttentes();
  const dejaLa = attentes[mode];
  if (dejaLa !== undefined && dejaLa.score >= score) {
    return;
  }
  attentes[mode] = { mode, score, fruits, comboMax };
  ecrireLocal(CLE_DERNIER, JSON.stringify(attentes));
}

type Attentes = Partial<Record<GameMode, Resultat>>;

function lireAttentes(): Attentes {
  try {
    const brut = lireLocal(CLE_DERNIER);
    if (brut === null || brut === '') {
      return {};
    }
    const brut2: unknown = JSON.parse(brut);
    if (typeof brut2 !== 'object' || brut2 === null) {
      return {};
    }
    // L'ANCIEN FORMAT ÉTAIT UN RÉSULTAT SEUL. Un joueur qui met à jour au
    // mauvais moment aurait perdu sa partie en attente : on le relit.
    const peutEtreUnique = brut2 as Resultat;
    if (typeof peutEtreUnique.mode === 'string' && typeof peutEtreUnique.score === 'number') {
      return { [peutEtreUnique.mode]: peutEtreUnique };
    }
    const sortie: Attentes = {};
    for (const [cle, valeur] of Object.entries(brut2 as Record<string, unknown>)) {
      const r = valeur as Resultat;
      if (r !== null && typeof r === 'object' && typeof r.score === 'number') {
        sortie[cle as GameMode] = r;
      }
    }
    return sortie;
  } catch {
    return {};
  }
}

/**
 * Dépose les records déjà en mémoire dans le navigateur, une seule fois.
 *
 * Le jeu ne gardait que le SCORE de chaque record, jamais le nombre de fruits —
 * or c'est lui qui fonde le contrôle de plausibilité. Ces records partent donc
 * avec `fruits: null`, ce que la base accepte par une voie à part : plafonnée à
 * 30 000 points, limitée à un seul import par navigateur et par mode, et
 * fermée au Défi du jour, qui se joue et ne s'importe pas.
 *
 * Le Défi est exclu pour une deuxième raison, plus importante : son classement
 * est celui du JOUR. Y verser un record d'une autre journée n'aurait aucun sens.
 */
export async function importerRecords(dejaCouverts: ReadonlySet<GameMode> = new Set()): Promise<number> {
  if (lireLocal(CLE_IMPORTE) !== null || pseudo() === null) {
    return 0;
  }
  ecrireLocal(CLE_IMPORTE, todayKey());
  let deposes = 0;
  for (const mode of ['classic', 'chrono'] as const) {
    const record = getBestScore(mode);
    if (record <= 0 || dejaCouverts.has(mode)) {
      continue;
    }
    if (await envoyer(mode, record, null, 0)) {
      deposes++;
    }
  }
  return deposes;
}

/**
 * Enregistre le pseudo ET rattrape ce qui attendait : les records déjà en
 * mémoire, puis la partie qui vient de se terminer. C'est le seul point
 * d'entrée à appeler après le choix du pseudo.
 *
 * Mesuré : moins de deux secondes. La première version en prenait plus de
 * quarante — elle attendait quinze secondes entre chaque dépôt pour contourner
 * la limite de cadence, au lieu d'exempter les imports, que l'index unique
 * borne déjà à un par mode.
 */
export async function inscrire(nom: string): Promise<void> {
  definirPseudo(nom);
  if (pseudo() === null) {
    return; // pseudo refusé par la forme : rien ne part
  }
  // L'IMPORT D'ABORD, LA PARTIE ENSUITE, et l'ordre n'est pas indifférent.
  // Les records importés échappent à la limite de cadence (l'index unique les
  // borne déjà à un par mode), la partie non. En commençant par eux, les trois
  // dépôts passent d'affilée ; dans l'autre sens, la partie aurait armé le
  // compteur de quinze secondes et les records seraient partis en file.
  // LA PARTIE EN ATTENTE D'ABORD, LES RECORDS ENSUITE — et si les deux portent
  // sur le même mode et le même score, on ne dépose que la partie : elle, au
  // moins, sait combien de fruits ont été tranchés. Un « record importé » à
  // côté d'une vraie ligne serait un doublon sans intérêt.
  const attentes = lireAttentes();
  const couverts = new Set<GameMode>();
  ecrireLocal(CLE_DERNIER, '');
  // Les trois modes partent d'affilée : la limite de cadence de la base est
  // posée par (joueur, MODE), donc ils ne se bloquent pas entre eux.
  for (const r of Object.values(attentes)) {
    if (r === undefined) {
      continue;
    }
    if (await envoyer(r.mode, r.score, r.fruits, r.comboMax)) {
      if (r.score >= getBestScore(r.mode)) {
        couverts.add(r.mode);
      }
    }
  }
  await importerRecords(couverts);
  // Et le Défi du jour déjà joué, qu'aucun autre chemin ne pourrait envoyer.
  await rattraperDefiDuJour();
}

/**
 * Faut-il déposer le résultat de cette partie ?
 *
 * SEULEMENT SI C'EST UN RECORD — sauf au Défi du jour, et cette exception n'en
 * est pas une quand on y regarde. Le Défi se classe À LA JOURNÉE : son tableau
 * est remis à zéro chaque matin, et chacun n'a qu'une tentative. Le gagner
 * exige donc d'y déposer sa partie du jour, qu'elle batte ou non le meilleur
 * Défi de sa vie. La contrainte d'unicité côté base garantit déjà qu'il n'y en
 * aura qu'une.
 *
 * Pour le Classique et le Chrono, en revanche, seul le meilleur score compte
 * et le tableau n'en montre qu'un par joueur. Déposer les parties perdantes ne
 * ferait que remplir la base sans rien changer à l'affichage.
 */
export function doitDeposer(mode: GameMode, nouveauRecord: boolean): boolean {
  return mode === 'daily' || nouveauRecord;
}

/** Le code de reprise du joueur, remis lors de la réservation de son pseudo. */
export function codeDeReprise(): string | null {
  const v = lireLocal(CLE_CODE);
  return v !== null && /^[0-9A-F]{6}$/.test(v) ? v : null;
}

/** Appelle une fonction de la base. Les erreurs remontent en texte. */
async function appeler(fonction: string, corps: object): Promise<{ ok: boolean; valeur: unknown }> {
  const controleur = new AbortController();
  const minuteur = window.setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
      method: 'POST',
      signal: controleur.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
    });
    const valeur: unknown = await r.json().catch(() => null);
    return { ok: r.ok, valeur };
  } catch {
    return { ok: false, valeur: null };
  } finally {
    window.clearTimeout(minuteur);
  }
}

/** Ce pseudo est-il encore libre ? `null` si la question n'a pas pu être posée. */
export async function pseudoLibre(nom: string): Promise<boolean | null> {
  const r = await appeler('pseudo_libre', { p_pseudo: nom });
  return r.ok && typeof r.valeur === 'boolean' ? r.valeur : null;
}

export type Reservation =
  | { ok: true; code: string }
  | { ok: false; raison: 'pris' | 'refuse' | 'forme' | 'reseau' };

/**
 * Réserve un pseudo, ou le reprend avec son code.
 *
 * UN PSEUDO APPARTIENT À QUELQU'UN, et la base le fait respecter : un score
 * portant un nom qu'on n'a pas réservé est refusé, même déposé à la main sur
 * l'API. C'est la seule façon de tenir la promesse « ton pseudo n'est pas
 * copiable » sans demander de compte.
 *
 * LE CODE DE REPRISE EXISTE PARCE QUE SANS COMPTE, « TOI » N'EST QU'UN
 * NAVIGATEUR. Une réservation sèche enfermerait le joueur dehors de son propre
 * nom dès qu'il change d'appareil ou vide son stockage. Six caractères remis
 * une fois règlent le problème sans rien imposer.
 */
export async function reserver(nom: string, code?: string): Promise<Reservation> {
  const r = await appeler('reserver_pseudo', {
    p_pseudo: nom,
    p_joueur: idJoueur(),
    p_code: code ?? null,
  });
  if (r.ok && typeof r.valeur === 'string') {
    ecrireLocal(CLE_CODE, r.valeur);
    return { ok: true, code: r.valeur };
  }
  const message =
    typeof r.valeur === 'object' && r.valeur !== null && 'message' in r.valeur
      ? String((r.valeur as { message: unknown }).message)
      : '';
  if (message.includes('deja pris')) {
    return { ok: false, raison: 'pris' };
  }
  if (message.includes('refuse')) {
    return { ok: false, raison: 'refuse' };
  }
  if (message.includes('invalide') || message.includes('reduit')) {
    return { ok: false, raison: 'forme' };
  }
  return { ok: false, raison: 'reseau' };
}

/**
 * Rattrape le Défi du jour déjà joué mais jamais monté au classement.
 *
 * LE PIÈGE QU'IL FALLAIT OUVRIR. Le Défi ne se joue QU'UNE FOIS par jour, et le
 * jeu le sait : une fois la tentative enregistrée en local, il refuse de la
 * rejouer. Un joueur qui fait son Défi PUIS choisit son pseudo se retrouvait
 * donc avec un score qu'aucun chemin ne pouvait plus envoyer — ni en rejouant,
 * puisque c'est interdit, ni en s'inscrivant, puisque l'inscription ne
 * regardait que les parties mises de côté.
 *
 * On lit donc directement l'historique du Défi. Le témoin garde la date du
 * dernier envoi : relancé dix fois, ça n'envoie qu'une fois par jour, et la
 * base refuserait le doublon de toute façon.
 */
export async function rattraperDefiDuJour(): Promise<boolean> {
  if (pseudo() === null) {
    return false;
  }
  const resultat = getTodayResult();
  if (resultat === null || lireLocal(CLE_DEFI_ENVOYE) === resultat.date) {
    return false;
  }
  ecrireLocal(CLE_DEFI_ENVOYE, resultat.date);
  // Le nombre de fruits n'a pas été conservé par l'historique du Défi, qui est
  // antérieur au classement : il part comme un record importé.
  return envoyer('daily', resultat.score, null, 0);
}
