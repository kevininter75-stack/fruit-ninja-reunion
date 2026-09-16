/**
 * La date du jour, telle que le jeu la compte.
 *
 * MODULE À PART, ET POUR UNE RAISON PRÉCISE. Le Défi du jour et les mutations
 * ont tous deux besoin de cette clé — le premier pour semer sa séquence de
 * fruits, les secondes pour tirer la règle — et le premier a aussi besoin des
 * secondes pour composer son texte de partage. Laisser `todayKey` chez l'un des
 * deux fabriquait un cycle d'imports entre eux.
 *
 * Il aurait fonctionné : ni l'un ni l'autre n'appelle quoi que ce soit au
 * chargement du module. Mais c'est une propriété fragile, qu'une seule constante
 * calculée au niveau du fichier suffirait à casser — et le symptôme serait alors
 * un `undefined` à l'exécution, pas une erreur de compilation. Une feuille dans
 * le graphe de dépendances ne peut pas avoir ce problème.
 */

/**
 * Date du jour en heure LOCALE, pas UTC.
 *
 * Volontaire : à La Réunion (UTC+4), un défi calé sur UTC changerait à 4 h du
 * matin, en plein milieu d'une soirée de jeu. Le joueur doit voir le défi
 * changer quand SA journée change.
 */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
