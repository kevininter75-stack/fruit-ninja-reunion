# Vérification visuelle — Kout Sab’, 6 novembre 2026

final result: passed

Validation du périmètre **visuel**, avec les règles du jeu existant conservées.

## Référence et preuves

- Cible : maquette 1 explicitement retenue par Kevin, `docs/visuel/cible.jpg` (original 1672 × 941 dans le dossier de travail du chat).
- Jeu réel : `docs/visuel/jeu.webp`, capture du build de production local, 1280 × 720 CSS et pixels capturés ; tampon Phaser adapté à la densité du poste.
- Comparaison réunissant cible et jeu : `docs/visuel/comparaison.jpg`. Cible ramenée proportionnellement à 1280 × 720 ; jeu conservé à cette taille. Deux images côte à côte dans le même fichier.
- Détails réunis : `docs/visuel/details.jpg` : HUD, icône et letchi coupé.
- États supplémentaires : `docs/visuel/menu.webp`, `chargement.webp`, `mobile.webp`, `portrait-375.webp`, `pause.webp`, `fin.webp` et `catalogue.jpg`.
- Originaux et captures intermédiaires : `C:/Users/maupo/Documents/Codex/2026-11-05/mission-dent-pro-visuel-de-l/outputs/verification-kout-sab/`.

État comparé : partie Chrono, compteur normal et coupe. Les chiffres, positions, variétés tirées, angles et opacités de disparition sont ceux d’une vraie partie ; les valeurs de démonstration de la maquette ne sont pas reproduites. Le son est muet à la demande de Kevin.

## Résultat des cinq surfaces

- **Typographie** : Fredoka pour les informations, Shrikhand pour la voix du jeu ; polices locales existantes conservées. Chiffres crème rapprochés, hiérarchie et alignement du temps corrigés aux échelles de rendu supérieures. Libellés des boutons de fin ajustés à leur largeur.
- **Disposition** : HUD aux coins, centre dégagé, commandes symétriques. Menu avec trois panneaux, titres alignés, fruit de Chrono réduit pour libérer l’instruction. Pas de débordement horizontal aux formats 1280 × 720, 844 × 390 et 375 × 812. À 375 px, contrôle non tactile du format vertical existant ; les vrais téléphones conservent leur fonctionnement en paysage et leur porte d’orientation existante.
- **Couleurs** : lagon turquoise, lumière chaude, basalte, interfaces bleu-vert à bord clair et textes crème. Les couleurs d’alerte et les couleurs distinctives des bonus sont conservées.
- **Images** : décor généré séparément, douze fruits et leurs deux moitiés sur alpha réel, goutte et trois éclaboussures liquides. Contrôle des 36 images de fruits dans le navigateur. WebP optimisés ; pas de rectangle opaque ni de damier incrusté visible. Ancien éclairage supplémentaire désactivé pour les seuls sprites déjà peints.
- **Contenu** : modes, records, objectif et règle du Défi restent dynamiques. Aucun chiffre de la maquette n’est figé dans l’interface. Chargement lié à la progression réelle, sans attente artificielle ajoutée.

Les fruits du jeu sont volontairement plus petits que les fruits de présentation de la maquette : leurs cadres et rayons historiques restent identiques. La composition aléatoire reste libre. Le décor est une illustration de production assortie, et non une copie pixel pour pixel du décor de la maquette. Ce sont des adaptations nécessaires au jeu demandé, pas une scène de démonstration figée.

## Historique des corrections

1. **P1 — icônes noires / SVG invalide après recoloration** : remplacement correct de `currentColor` par blanc dans les SVG Phosphor, puis teinte crème par Phaser. Rechargement de production réussi ; preuves son muet et écran final, console sans erreur.
2. **P2 — titres de modes décalés et ananas trop proche de l’instruction** : panneaux cohérents, base des titres commune et taille/position de l’ananas ajustées. Revérifié sur `menu.webp` et `mobile.webp`.
3. **P2 — texte du bouton de classement débordant** : graisse/taille adaptées et réduction si nécessaire à la largeur disponible. Vérifié en fin de Chrono et de Défi, `fin.webp` et capture intermédiaire `25-defi.png`.
4. **P2 — taches rondes trop simples auprès des fruits peints** : vrais sprites de liquide, avec mêmes clés, tailles de texture et émetteurs. Coupe réelle avec score et moitiés contrôlée dans `jeu.webp` ; comparaison finale reprise après cette correction.

Aucun P0/P1/P2 visuel encore ouvert. P3 possible : affiner plus tard la bombe et les effets d’annonce hérités pour prolonger cette direction artistique. La ligne de règle du Défi reste plus dense que les deux autres cartes lorsqu’elle est longue.

## Vérifications techniques et interactions

- `npm run build` : TypeScript et Vite réussis.
- `git diff --check` : réussi.
- 28 URL de précache : HTTP 200, avec types de fichiers vérifiés ; 12 planches RGBA 1536 × 512 et 3 SVG valides.
- Navigateur intégré caché : choix par clic et par coupe ; Classique, Chrono et Défi ; coupe avec score, moitiés, combos, bonus cyclone observé ; fin, Rejouer, pause par clavier et bouton, Reprendre, retour au menu ; bouton muet et persistance après rechargement.
- Contrôle de résolution 2× : tampon 2560 × 1440 pour un affichage 1280 × 720.
- Console de production finale : aucune erreur ni alerte capturée (`console-finale.json` dans les preuves originales).
- Fichiers de catalogue, corps de fruits/bombes, génération des salves, calcul des coupes, musique, bruitages et stockage non modifiés. Dans GameScene, seules les surfaces de rendu et positions/couleurs du HUD diffèrent.

Limites : pas de mesure sur téléphone physique ni de simulation du mode avion. Le cache inclut explicitement les nouvelles images, mais cette vérification ne vaut pas essai hors réseau. Les avertissements Vite de résolution au runtime des polices et du fond CSS restent présents ; les fichiers concernés répondent bien en HTTP et s’affichent dans le navigateur.

Bug connu avant la refonte : l’échéance Chrono peut avancer pendant une pause ; voir la passation. La logique d’horloge est conservée dans cette mission visuelle.

## Contrôle de livraison

- [x] Images individuelles intégrées au véritable jeu.
- [x] Chargement et menu assortis.
- [x] Comparaisons d’ensemble et de détail examinées après corrections.
- [x] Build et contrôles navigateur réussis.
- [x] Audio du jeu laissé muet pour les essais.
- [x] Publication autorisée explicitement par Kevin le 6 novembre 2026 ; suivi du workflow GitHub Pages à effectuer pour la mise en ligne.
