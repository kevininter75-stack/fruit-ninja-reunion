/**
 * Renommage des clés de stockage : `fruit-ninja-reunion-*` -> `kout-sab-*`.
 *
 * LE JEU A CHANGÉ DE NOM, PAS LES JOUEURS. Renommer les clés sans rien faire
 * aurait effacé, pour chaque personne déjà installée, son record en Classique,
 * son record en Chrono, sa série de Défis et ses réglages de son. Un
 * changement de nom ne doit rien coûter à ceux qui étaient déjà là.
 *
 * La migration tourne UNE FOIS, au démarrage, avant que quoi que ce soit ne
 * lise ces clés. Elle ne déplace que ce qui n'existe pas déjà sous le nouveau
 * nom — ainsi, relancée par accident, elle n'écrase rien.
 *
 * Les anciennes clés sont supprimées après copie : les laisser traîner ferait
 * croire, dans six mois, qu'elles servent encore.
 */

const ANCIEN = 'fruit-ninja-reunion-';
const NOUVEAU = 'kout-sab-';

export function migrerStockage(): void {
  try {
    const aDeplacer: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle !== null && cle.startsWith(ANCIEN)) {
        aDeplacer.push(cle);
      }
    }
    for (const ancienne of aDeplacer) {
      const nouvelle = NOUVEAU + ancienne.slice(ANCIEN.length);
      const valeur = localStorage.getItem(ancienne);
      if (valeur !== null && localStorage.getItem(nouvelle) === null) {
        localStorage.setItem(nouvelle, valeur);
      }
      localStorage.removeItem(ancienne);
    }
  } catch {
    // Stockage indisponible : le joueur repart de zéro, ce qu'il aurait fait
    // de toute façon puisque rien n'était lisible.
  }
}
