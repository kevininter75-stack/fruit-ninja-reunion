/**
 * Le Défi du jour : une partie, la même pour tout le monde, une fois par jour.
 *
 * C'est la réponse au seul vrai manque du jeu — il n'y avait aucune raison d'y
 * revenir. Un record personnel se bat une fois puis s'oublie ; un défi commun
 * qui change chaque matin se compare, se raconte, et donne rendez-vous.
 *
 * Et tout cela sans serveur. La graine se déduit de la DATE, donc deux joueurs
 * à l'autre bout du monde jouent la même séquence sans que rien ne circule
 * entre eux. Pas de compte, pas de classement à héberger, pas de données
 * personnelles à protéger.
 */

import { mutationDuJour, objectifDuJour } from './mutations';
import { todayKey } from './jour';

export { todayKey };

const HISTORY_KEY = 'fruit-ninja-reunion-daily';
const MAX_HISTORY = 120;

export interface DailyResult {
  /** Date locale au format AAAA-MM-JJ. */
  date: string;
  score: number;
}


/**
 * Graine du jour. Le préfixe évite qu'une date serve par hasard de graine à
 * autre chose plus tard, et le suffixe de version permet de rejouer un
 * historique si l'équilibrage change au point de rendre les scores passés
 * incomparables.
 */
export function dailySeed(date = new Date()): string {
  return `koutsab-v1-${todayKey(date)}`;
}

function readHistory(): DailyResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is DailyResult =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as DailyResult).date === 'string' &&
        typeof (entry as DailyResult).score === 'number'
    );
  } catch {
    // Stockage indisponible ou contenu corrompu : on repart d'un historique
    // vide plutôt que d'empêcher le joueur de jouer.
    return [];
  }
}

function writeHistory(history: DailyResult[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {
    // Le résultat du jour vaudra pour la session en cours seulement.
  }
}

/** Résultat déjà enregistré aujourd'hui, ou null si le défi reste à jouer. */
export function getTodayResult(): DailyResult | null {
  const key = todayKey();
  return readHistory().find((entry) => entry.date === key) ?? null;
}

export function isTodayPlayed(): boolean {
  return getTodayResult() !== null;
}

/**
 * Enregistre le score du jour. Une seule tentative compte : si un résultat
 * existe déjà, on le GARDE, même si le nouveau est meilleur.
 *
 * C'est volontaire. Autoriser à rejouer jusqu'à obtenir un bon score viderait
 * le défi de son sens — il ne mesurerait plus que la patience. Un entraînement
 * libre reste accessible par les modes Classique et Chrono.
 */
export function saveTodayResult(score: number): DailyResult {
  const existing = getTodayResult();
  if (existing) {
    return existing;
  }

  const result: DailyResult = { date: todayKey(), score };
  const history = readHistory();
  history.push(result);
  history.sort((a, b) => a.date.localeCompare(b.date));
  writeHistory(history);
  return result;
}

/**
 * Nombre de jours consécutifs joués, en remontant depuis aujourd'hui (ou
 * depuis hier si le défi du jour n'est pas encore fait — sinon la série
 * paraîtrait rompue chaque matin au réveil).
 */
export function getStreak(): number {
  const history = readHistory();
  if (history.length === 0) {
    return 0;
  }

  const dates = new Set(history.map((entry) => entry.date));
  const curseur = new Date();
  if (!dates.has(todayKey(curseur))) {
    curseur.setDate(curseur.getDate() - 1);
  }

  let serie = 0;
  while (dates.has(todayKey(curseur))) {
    serie++;
    curseur.setDate(curseur.getDate() - 1);
  }
  return serie;
}

/** Meilleur score jamais réalisé sur un Défi du jour. */
export function getBestDaily(): number {
  return readHistory().reduce((best, entry) => Math.max(best, entry.score), 0);
}

/**
 * Texte à partager, façon Wordle : un résultat qui se colle dans un message
 * sans rien révéler de la partie à qui ne l'a pas encore jouée.
 */
export function buildShareText(score: number, fruitsSliced: number): string {
  const [, mois, jour] = todayKey().split('-');
  const serie = getStreak();
  const sabres = '🔪'.repeat(Math.min(5, 1 + Math.floor(score / 400)));
  const ligneSerie = serie > 1 ? ` · série ${serie} 🔥` : '';
  // La regle du jour et le verdict font tout le sel du partage : « 850 pts »
  // ne se compare a rien, « objectif manque sous Brume des Hauts » se raconte.
  // Le score reste dedans, mais il n'est plus seul a porter le message.
  const objectif = objectifDuJour();
  const verdict = score >= objectif ? '✅' : '❌';
  const mutation = mutationDuJour();
  return `Kout Sab' — Défi du ${jour}/${mois}
${mutation.nom}
${sabres} ${verdict} ${score}/${objectif} pts · ${fruitsSliced} fruits${ligneSerie}`;
}
