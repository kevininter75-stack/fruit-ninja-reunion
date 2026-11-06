# Images de Kout Sab’ — 6 novembre 2026

Direction : maquette 1 retenue par Kevin, lagon réunionnais au soleil couchant, basalte, matière des fruits détaillée, interface bleu-vert et crème.

Les images ont été produites avec l’outil de génération d’images intégré, puis cadrées, mises à l’échelle et compressées mécaniquement. Le décor et les planches sont indépendants de l’interface et ne contiennent aucun score ni texte figé.

| Clé existante | Fichier dans `public/assets/fruits/illustres/` |
|---|---|
| litchi | letchi-v1.webp |
| goyavier | goyavier-v1.webp |
| ananas_victoria | ananas-v1.webp |
| mangue_jose | mangue-v1.webp |
| fruit_de_la_passion | passion-v1.webp |
| pitaya | pitaya-v1.webp |
| corossol | corossol-v1.webp |
| carambole | carambole-v1.webp |
| combava_bonus | combava-v1.webp |
| piment_cabri | piment-v1.webp |
| papaye_cyclone | cyclone-v1.webp |
| longane_givre | longani-v1.webp |

Chaque planche fait 1536 × 512, soit trois cellules de 512 px : entier, moitié gauche, moitié droite. Les PNG bruts de fruits font 2172 × 724. Le cadrage alpha tient compte des pédoncules et feuilles ; le jeu reconstruit les textures avec les dimensions historiques. Les sources d’atlas sont libérées après copie, sans changer les rayons ni les clés utilisées par les pools.

Décor : `public/assets/decors/lagon-v1.webp`, 1672 × 941, affiché en couverture en conservant ses proportions. Les quatre clés de plans historiques restent disponibles. Le décor de repli procédural reste présent.

Effets : `public/assets/effets/jus-v1.webp`, 1024 × 1024, quatre cellules : goutte, puis trois éclaboussures. Images neutres teintées par les couleurs de jus déjà définies dans le catalogue. Émetteurs, tailles de textures, durées et animations préservés.

Icônes : [Phosphor Icons Core](https://github.com/phosphor-icons/core), variantes fill speaker-high, speaker-slash et pause, licence MIT conservée dans `public/assets/ui/LICENSE`. Seule leur couleur de remplissage est adaptée pour permettre la teinte crème dans Phaser. Aucun chargement externe à l’exécution.

Les originaux, prompts de direction, script de préparation et captures restent sauvegardés dans le dossier de ce chat sous `work/assets/`, `work/preparer_assets.py` et `outputs/`. Les fichiers de `docs/visuel/` sont des preuves de revue et ne font pas partie du build livré aux joueurs.
