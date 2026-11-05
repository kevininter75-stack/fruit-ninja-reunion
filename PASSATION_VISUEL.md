# Reprise Kout Sab’ — sauvegarde du 5 novembre 2026

## Demande et décisions acquises

Kevin autorise l’intégration des améliorations visuelles dans la version web existante, en conservant les mêmes fonctionnalités : modes, règles, bonus, commandes, scores et logique de jeu. **Maquette 1 explicitement choisie** dans la réponse à la question de sélection. Le périmètre est **uniquement visuel** ; musique et bruitages seront traités plus tard. Les tests et le navigateur doivent rester en arrière-plan.

Kevin a demandé de sauvegarder le travail puis de faire une pause avant la limite d’utilisation de sa session. La refonte n’est donc pas terminée. Ne pas présenter les maquettes comme une version jouable intégrée.

## Projet

- Dépôt : `C:\Claude Kev\fruit-ninja-reunion`
- GitHub : https://github.com/kevininter75-stack/fruit-ninja-reunion
- Base examinée : `f7a195c19ae475b6081d8d8d305292e6bfa4f3cc` sur `master`, dernier commit du 22 septembre 2026.
- Branche locale de travail créée : `amelioration-visuelle`.
- `git fetch origin` effectué ; le dépôt était propre au départ.
- Pas d’AGENTS.md ni de CLAUDE.md trouvé à la racine du projet ou dans les parents examinés.
- Ne pas pousser sur `master` sans demande : le README annonce un déploiement GitHub Pages automatique sur les pushes de cette branche.

## Emplacements de travail

Racine de ce chat :

`C:\Users\maupo\Documents\Codex\2026-11-05\mission-dent-pro-visuel-de-l`

Ce nom de dossier vient de la première mission du chat et ne change pas le projet actif : c’est bien Kout Sab’ / Fruit Ninja Réunion.

- Maquette retenue : `outputs/maquettes-kout-sab/01-maquette.png`.
- Les trois maquettes et leurs prompts : `outputs/maquettes-kout-sab/`.
- Proposition détaillée pour chaque fruit et les coupes : `outputs/maquettes-kout-sab/direction-visuelle.md`.
- Audit initial et six captures du jeu actuel : `outputs/audit-kout-sab/`.
- Brouillons d’intégration : `work/jeu/src/`.
- Images de production brutes : `work/assets/`.
- Archive de sauvegarde complète : `outputs/SAUVEGARDE_KOUT_SAB_2026-11-05.zip`.
- Patch des brouillons : `outputs/code-prepare-kout-sab.patch`.

L’archive inclut ce document, les références, les images déjà sauvegardées, les brouillons du code et le patch. Elle ne contient ni node_modules, ni secrets, ni données de classement.

## État réel à la pause

### Déjà fait

1. Analyse des deux dépôts ; la version web est plus récente que la refonte Unity.
2. Essais navigateur en arrière-plan : menu, lancement Classique/Chrono, pause, fin et format téléphone paysage.
3. Trois maquettes générées ; la première est retenue.
4. Décor de production généré séparément, sans fruits, lame, HUD ni texte : `work/assets/decor-lagon.png`.
5. Plusieurs triptyques de fruits produits et inspectés : un fruit entier et deux moitiés assorties, fond transparent, style de la maquette choisie. L’inventaire exact est dans `outputs/inventaire-sauvegarde.json` et dans l’archive.
6. Dépendances du dépôt installées avec `npm ci` et **build de référence avant changement réussi** avec `npm run build` (TypeScript + Vite). Vite signale les chemins des deux polices comme résolus au runtime ; avertissement déjà présent au build de référence.
7. Brouillons du chargement des images et de l’adaptation visuelle préparés dans le dossier du chat.

### Pas encore fait

- Les brouillons du code ne sont **pas encore appliqués** aux fichiers source du dépôt.
- Les PNG bruts ne sont pas encore normalisés ni optimisés en WebP dans `public/assets/`.
- Aucun build de la version visuellement modifiée ni test navigateur de cette version.
- Aucune validation finale de fidélité ; aucun `design-qa.md` « passed ».
- Aucun changement de musique/bruitage ; aucun déploiement.

## Brouillons du code

Les fichiers sont copiés dans `work/jeu/src/` pour préparation et inspection. Le patch ne comprend que ceux qui diffèrent de la base.

- `utils/visuels.ts` (nouveau) : registre des douze planches, mêmes clés de texture publiques et mêmes dimensions de texture calculées depuis les rayons existants ; copie des trois cellules dans les textures de jeu puis libération de la source haute définition.
- `scenes/PreloadScene.ts` : préchargement du décor et des planches via `import.meta.env.BASE_URL`, progression de chargement et repli sur le dessin procédural si une planche manque.
- `utils/backdropTextures.ts` : peinture du décor importé en mode cover, clés des autres plans conservées ; repli sur le décor procédural existant.
- `entities/AnimatedBackground.ts` : pas de seconde lumière/nuages grossiers par-dessus le décor peint ; légère dérive uniquement hors partie, respect du mouvement réduit.
- `entities/SheenLayer.ts`, `scenes/MenuScene.ts`, `scenes/GameScene.ts` : éviter de doubler le modelé déjà peint des nouvelles images avec l’ancien éclairage procédural.
- `utils/constants.ts` : unique valeur visuelle préparée, `GAME_DARKEN_ALPHA` de 0.4 à 0.14, à ajuster visuellement.
- `utils/ui.ts` et `systems/PauseController.ts` sont des copies de référence encore inchangées.

**Attention à la clé technique** : le longani s’appelle `longane_givre` dans le catalogue. Le brouillon du registre a été corrigé en conséquence.

## Assets et préparation restante

Les triptyques générés ont généralement **2172 × 724 pixels**, donc trois cellules carrées de 724 px, malgré une cible de génération de 1536 × 512. Ne pas découper à 512 px sans consulter les dimensions réelles. Les éléments ne se chevauchent pas entre cellules.

Il faut préparer les images mécaniquement : délimiter les trois cellules, contrôler les marges alpha et l’échelle, conserver les proportions, puis composer les cadres aux dimensions prévues. Le jeu actuel donne à chaque texture une marge calculée : `size = variety.radius * 2 + px(64)`. La préparation des images doit respecter le corps visuel et cette marge pour ne pas changer la cible de coupe.

Des pixels alpha très faibles existent parfois loin des silhouettes : les ignorer pour mesurer les bords, sans abîmer l’arête du fruit. Le pitaya a nécessité une seconde passe de transparence ; contrôler impérativement le fichier final avant utilisation.

Chemins attendus par le brouillon de chargement :

```text
public/assets/decors/lagon-v1.webp
public/assets/fruits/illustres/letchi-v1.webp
public/assets/fruits/illustres/goyavier-v1.webp
public/assets/fruits/illustres/ananas-v1.webp
public/assets/fruits/illustres/mangue-v1.webp
public/assets/fruits/illustres/passion-v1.webp
public/assets/fruits/illustres/pitaya-v1.webp
public/assets/fruits/illustres/corossol-v1.webp
public/assets/fruits/illustres/carambole-v1.webp
public/assets/fruits/illustres/combava-v1.webp
public/assets/fruits/illustres/piment-v1.webp
public/assets/fruits/illustres/cyclone-v1.webp
public/assets/fruits/illustres/longani-v1.webp
```

Le décor propre est déjà sauvegardé. La papaye cyclone n’a pas encore été produite au moment de cette note : préserver sa silhouette, son bleu indigo/turquoise et son motif de cyclone, avec le nouveau niveau de matière. Vérifier l’inventaire pour le pitaya et le longani, dont les opérations déjà en cours étaient en voie de sauvegarde au moment de la demande de pause.

Les agents d’assets ont reçu l’ordre de terminer seulement leur opération en cours, de sauvegarder puis de s’arrêter. Ne pas compter sur une génération non sauvegardée.

## Suite proposée à la reprise

1. Lire ce document et `outputs/inventaire-sauvegarde.json`, vérifier branche et état Git. Ne pas écraser des changements apparus depuis la pause.
2. Ouvrir la maquette retenue et les PNG bruts, vérifier ce qui manque, terminer seulement les assets manquants.
3. Normaliser/optimiser les douze triptyques et le décor ; vérifier les moitiés, la transparence, l’échelle et les couleurs des bonus.
4. Revoir le patch, puis appliquer les brouillons au dépôt. Conserver physique, rayons, scores, fréquences de spawn, modes et effets fonctionnels.
5. Intégrer une famille cohérente d’icônes/boutons si nécessaire pour rejoindre la maquette ; préserver les actions. Affiner la lame, le jus et l’éclat sans masquer les fruits.
6. Exécuter `npm run build`, puis démarrer le jeu avec `npm run dev` et vérifier dans le navigateur intégré **caché**. Aucun serveur de développement n’était laissé actif à la pause.
7. Tester menu, les trois modes, coupe réelle avec score, moitiés, pause/reprise, bonus, fin, retour au menu, format téléphone et chargement des images sans erreurs. Ne pas envoyer de score au classement pour les essais.
8. Comparer des captures au rendu cible : même format, comparer la qualité des assets et la composition ; les positions aléatoires et les vrais chiffres du jeu doivent rester dynamiques. Produire le QA de fidélité, corriger les écarts, puis commiter sur la branche de travail.
9. Livrer l’aperçu local vérifié. Un push sur master ou une publication ne fait pas partie de l’autorisation actuelle.

## Points connus hors périmètre

Un bug de pause du Chrono a été observé lors de l’audit : l’échéance utilise `time.now`, qui avance malgré la pause des événements temporisés. Ce constat est documenté dans l’audit. **Ne pas le corriger au milieu de cette mission purement visuelle sans l’annoncer** : la demande est de conserver les fonctionnalités et de différer l’audio. La documentation ancienne contient aussi des descriptions de règles dépassées ; le code actuel fait foi.

Les compétences Product Design / image-to-code et imagegen ont été lues. La production parallèle d’assets provient de la consigne de la compétence image-to-code. Ne pas refaire un projet de démonstration ou une page statique : il s’agit bien d’améliorer le jeu Phaser existant.
