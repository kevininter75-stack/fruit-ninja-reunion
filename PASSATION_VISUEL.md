# Kout Sab’ — passation visuelle du 6 novembre 2026

## État à reprendre

Refonte **intégrée et vérifiée localement**, sur le véritable jeu web `C:/Claude Kev/fruit-ninja-reunion`. Travail initial sur `amelioration-visuelle`, base fonctionnelle `f7a195c`. L’ancien checkpoint `98e4fe0` reste dans l’historique.

Kevin a explicitement demandé le 6 novembre de **publier la mise à jour pour tester sur mobile**. Cela autorise le push sur master et le déploiement GitHub Pages existant. Suivre le statut du workflow et vérifier le site après publication avant d’annoncer la mise en ligne.

URL : https://kevininter75-stack.github.io/fruit-ninja-reunion/

## Décisions acquises

- Version web choisie, plus récente que la refonte Unity.
- **Maquette 1** : lagon au couchant, basalte, fruits détaillés, interface turquoise/crème.
- Même jeu : règles, modes, rayons, physique, scores, salves, bonus et commandes conservés.
- Audio reporté à une autre mission ; intention future de Kevin : ambiance maloya. Aucun code de musique/bruitage modifié.
- Kevin a demandé des essais **en arrière-plan, sans agir sur l’affichage de son PC**, puis de couper le son. Navigateur intégré explicitement masqué ; aperçu local laissé **muet**. Conserver cette préférence pour les prochains essais.

## Travail livré

- Décor séparé, douze fruits entiers et leurs deux moitiés, goutte et trois éclaboussures.
- Assets WebP avec vraie transparence ; mêmes clés et cadres de textures dans Phaser.
- Éclairage supplémentaire évité sur les images déjà peintes ; repli procédural conservé.
- Lame plus fine, halo turquoise, HUD mieux lisible et boutons son/pause cohérents.
- Menu avec panneaux et titres alignés, données toujours dynamiques.
- Beau fond dès le chargement initial, puis barre de progression réelle dans Phaser. Aucune attente artificielle ajoutée.
- Pause et boutons de fin harmonisés ; libellés contenus dans leurs boutons.
- Précache PWA complété pour les nouvelles images.

Voir `ASSETS_VISUELS.md` et `design-qa.md`. Preuves portables dans `docs/visuel/`.

## Validation

Build TypeScript/Vite et `git diff --check` réussis. 28 URL de cache accessibles en HTTP. Contrôle RGBA/SVG réussi. Console de production finale sans erreurs/alertes.

Vérifications navigateur masqué : menu par clic et coupe, trois modes, vraie coupe avec score et moitiés, combos, bonus cyclone, fin, Rejouer, pause clavier/bouton, Reprendre, retour au menu, son muet persistant. Formats 1280 × 720, 844 × 390, 375 × 812 et rendu 2×. Le format 375 est une vérification de viewport non tactile, pas un essai de téléphone physique.

QA visuel final : passed. Comparaison après correction des icônes, du menu, des boutons et des éclaboussures.

## Limites à ne pas perdre

- Bug Chrono déjà constaté avant cette mission : son échéance utilise `time.now` et peut avancer pendant la pause. Aucun changement d’horloge effectué ici. À traiter séparément si Kevin le souhaite.
- Pas de benchmark sur téléphone physique, ni de test en mode avion. Le précache des images est contrôlé, ce n’est pas une preuve de fonctionnement hors réseau sur mobile.
- Les avertissements Vite sur les chemins des polices et du fond CSS sont des résolutions au runtime ; les fichiers sont présents, servis et visibles.
- Le rendu de la bombe et certaines annonces restent hérités du jeu. Ils peuvent faire l’objet d’une itération visuelle ultérieure.
- Aucun score de test envoyé volontairement au classement ; aucun pseudo saisi pendant les essais.

## Emplacements locaux

Chat : `C:/Users/maupo/Documents/Codex/2026-11-05/mission-dent-pro-visuel-de-l`.

- `outputs/maquettes-kout-sab/01-maquette.png` : cible originale.
- `outputs/verification-kout-sab/` : captures originales, comparaisons, contrôle des ressources et console.
- `work/assets/` : PNG bruts à conserver.
- `work/production/` : WebP préparés.
- Archive du 5 novembre conservée ; archive finale du 6 novembre préparée lors de la livraison.
- Aperçu de production local : http://127.0.0.1:4174/ ; serveur de développement : http://127.0.0.1:4173/.

La mission Dent Pro antérieure appartient à un autre dépôt et ne doit pas être mélangée à ce jeu.
