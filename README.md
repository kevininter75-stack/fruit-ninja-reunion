# 🔪 Kout Sab'

> *« Kout sab' »* — un coup de sabre, en créole réunionnais.

Jeu mobile-first de type **fruit-slicer** mettant en scène les fruits
typiques de La Réunion : letchis, mangues José, ananas Victoria, combavas…

Tranchez les fruits d'un geste du doigt (ou de la souris), évitez les bombes,
enchaînez les combos !

Deux modes de jeu :

- **Classique** — 3 vies, chaque fruit manqué en coûte une.
- **Chrono** — score maximal en 60 secondes, fruits manqués sans pénalité.

Dans les deux modes, trancher une bombe termine immédiatement la partie.

Au menu : 9 fruits péi (letchi, ananas Victoria, mangue José, fruit de la
passion, papaye, corossol, longane, jacque, carambole) et un fruit bonus,
le **combava doré**, qui double le score pendant 5 secondes.

> Projet portfolio — code TypeScript strict, architecture par scènes/systèmes, 100 % client-side.

**🎮 Jouer en ligne : <https://kevininter75-stack.github.io/fruit-ninja-reunion/>**

Sur mobile, le navigateur propose « Ajouter à l'écran d'accueil » : le jeu
s'installe comme une app (plein écran, suit l'orientation du téléphone,
jouable hors-ligne).
Déploiement continu : chaque push sur `master` republie automatiquement
via GitHub Actions.

## Stack

- [Phaser 3](https://phaser.io/) — moteur de jeu 2D, physique Arcade
- TypeScript (`strict: true`)
- [Vite](https://vitejs.dev/) — dev server et bundler
- Capacitor (Phase 4) — packaging mobile Android/iOS

## Lancement local

```bash
npm install
npm run dev
```

Le jeu est accessible sur `http://localhost:3010`.

Build de production :

```bash
npm run build
```

## Mobile

### PWA (installation directe depuis le navigateur)

Le build de production est une PWA complète : manifest, service worker
(cache-first, jouable hors-ligne après la première visite) et icônes.
Servi en HTTPS, le jeu propose « Ajouter à l'écran d'accueil » sur
Android/iOS et se lance en plein écran, dans l'orientation du téléphone
(portrait ou paysage, bascule en direct à la rotation).

### Android (Capacitor)

Le projet natif Android est généré dans `android/` (orientation libre,
suit le capteur). Pour compiler l'APK, il faut Android Studio (ou le SDK +
Java 21) :

```bash
npm run build:android   # build web + synchronisation Capacitor
npx cap open android    # ouvre Android Studio → Run/Build APK
```

iOS : nécessite un Mac avec Xcode (`npx cap add ios`), non inclus ici.

## Architecture

```
src/
├── main.ts               # point d'entrée
├── config/gameConfig.ts  # configuration Phaser (scale, physique, scènes)
├── scenes/               # Boot → Preload → Menu → Game → GameOver
├── entities/             # Fruit, Bomb, SliceTrail (objets de jeu)
├── systems/              # SpawnManager, SliceDetector, ScoreManager, ComboManager
└── utils/constants.ts    # toutes les valeurs de gameplay ajustables
```

Choix techniques notables :

- **Pools de sprites** : fruits et moitiés coupées sont recyclés (jamais détruits)
  pour éviter la pression GC et viser 60 FPS sur mobile milieu de gamme.
- **Détection de coupe** : intersection segment-cercle (`Phaser.Geom.Intersects.LineToCircle`)
  avec objets géométriques pré-alloués — voir `systems/SliceDetector.ts`.
- **Placeholders procéduraux** : toutes les textures sont générées en code
  (`Graphics.generateTexture`) en attendant les assets finaux ; les clés de
  texture ne changeront pas.
- **Sons synthétisés** : les SFX (coupe, explosion, combo…) sont générés en
  Web Audio (`systems/SfxManager.ts`) — aucun fichier audio requis. La façade
  sera remplacée par de vrais sons (Phaser/Howler) sans changer les appels.
- **Musique d'ambiance synthétisée** : boucle instrumentale d'inspiration séga
  (marimba pentatonique, basse, cabosse, ressac d'océan) générée en Web Audio
  (`systems/MusicManager.ts`) avec ordonnanceur à anticipation. Bouton 🔊/🔇
  persistant.
- **Catalogue de fruits data-driven** (`utils/fruitCatalog.ts`) : chaque
  variété définit rayon, couleurs de peau/jus/chair et poids de spawn ; les
  trois textures par fruit (entier + 2 moitiés) sont dessinées en canvas 2D
  avec découpe par clipping.
- **Moteur de dessin des fruits** (`utils/fruitArt.ts`) : chaque variété a une
  silhouette propre (tracé bézier ou contour ondulé), un contour sombre façon
  dessin animé, des motifs de peau et une **chair détaillée à la coupe**
  (pépins du fruit de la passion, noyau de la mangue, quartiers du combava).
  La même fonction de tracé sert au corps, au clipping des motifs, au contour
  et — rétrécie — à la chair : entier et moitiés ne peuvent pas diverger.
  Planche de contrôle : `http://localhost:3010/fruits-preview.html` affiche
  les 10 fruits (entier + 2 moitiés) à taille réelle sur fond de partie.
- **Rythme de partie piloté par une intensité continue** (`systems/SpawnManager.ts`) :
  une valeur 0 → 1 qui monte avec le temps ET le score commande l'intervalle
  entre salves (bruité, avec une respiration après chaque salve dense), la
  forme de la salve (`solo` / `duo` / `volley` / `cluster`) et le budget de
  bombes. Les bombes suivent un compteur déterministe façon Fruit Ninja — une
  toutes les 10 → 5 salves de fruits — et jamais dans une grappe, qui est
  faite pour être coupée d'un seul geste. Mesuré : 0,8 → 2,4 fruits/s sur
  quatre minutes en Classique, montée plus vive en Chrono (sprint de 60 s).
- **Grenade de frénésie** : à des paliers de score, une grenade **entre par un
  bord de l'écran** et le traverse en arc (~2 s) — une trajectoire à part qui la
  signale avant même qu'on l'identifie. Elle se fige en l'air à la première
  coupe ; chaque coup supplémentaire compte (borné par un temps de garde) puis
  elle éclate, rapporte un point par coup et emporte tous les fruits en vol.
  **Le spawn est suspendu tant qu'elle est en scène** : la frénésie est un
  moment à elle. La suspension est déduite de la présence de la grenade (et non
  d'un drapeau), donc elle se libère toute seule.
  Mise en scène dédiée : halo qui respire et la suit, ondes de choc à chaque
  coup (pool d'images recyclées), sursaut d'angle, et un compteur unique
  au-dessus d'elle — un popup par coup s'empilait en un tas illisible.
- **Vie regagnée par paliers de score** : une croix de strike s'efface tous les
  1000 points ; si les trois vies sont intactes, le palier rapporte des points.
- **Typographie** : police d'affichage Fredoka (SIL OFL, embarquée dans
  `public/fonts/` avec sa licence), chargée AVANT la création du jeu — Phaser
  ne précharge pas les webfonts, et la planche de chiffres du HUD serait sinon
  gravée dans la police système. Un délai de garde de 3 s évite l'écran noir si
  la police ne se charge pas ; le jeu bascule alors sur la pile de repli.
- **Score en BitmapText** : les chiffres sont dessinés une fois dans une
  planche (dégradé, contour, reflet) puis déclarés en police bitmap. Un objet
  `Text` reconstruit sa texture canvas et la renvoie au GPU à *chaque*
  changement — inacceptable pour un score qui bouge à chaque fruit tranché.
  Le nombre défile jusqu'à sa nouvelle valeur au lieu de sauter.
- **Icône PWA générée par le moteur du jeu** (`icon-gen.html`, outil de dev
  absent du build) : le letchi est dessiné par `fruitArt.ts`, donc l'icône est
  littéralement un morceau du jeu. Jeux séparés `any` et `maskable` — jamais
  les deux `purpose` combinés, sinon Chrome force l'icône masquée avec ses
  marges — contenu maskable ramené aux 80 % centraux, et `apple-touch-icon`
  180×180 non masqué car iOS ignore le manifest.
  Régénération : `http://localhost:3010/icon-gen.html?size=512&safe=0.8`
  capturé en Chrome headless (`--screenshot`).
- **Game feel** : **hit-stop** (micro-gel de la physique ET des tweens à
  l'impact — c'est cette pause qui fait qu'un coup claque), durées
  proportionnées au coup (critique 45 ms, combo 70, grenade 95, bombe 130) ;
  **squash & stretch** des moitiés, qui jaillissent étirées dans l'axe de la
  coupe ; ruban de lame en quatre passes du bleuté au blanc chaud.
  L'horloge de la scène n'est jamais ralentie : le minuteur de reprise doit
  pouvoir se déclencher, et le chrono ne doit pas dériver.
- **Fondus entre scènes** avec filet de sécurité : si un fondu est déjà en
  cours sur la caméra, le nouveau est ignoré par Phaser et l'événement de fin
  ne viendrait jamais — un minuteur bascule alors quand même. Un écran figé
  serait bien pire qu'une coupe sèche.
- **Écran de fin mis en scène** : apparition échelonnée des éléments, score
  qui défile jusqu'à son total, médaille (bronze/argent/or, seuils par mode)
  qui arrive en tournant, confettis sur un nouveau record. Disposition
  explicite par orientation — en paysage la médaille passe à CÔTÉ du score,
  faute de hauteur pour l'empiler.
- **Feedback systématique** : particules de jus teintées, textes flottants
  (+points, combos) recyclés depuis un pool, flash + secousse caméra sur
  bombe, records persistés en localStorage.

## Feuille de route

- [x] **Phase 1 — MVP jouable** : spawn physique, détection de swipe, découpe, score, vies, game over
- [x] **Phase 2 — Feel & polish** : combos, bombes, particules de jus, sons, menu complet, mode Chrono, records
- [x] **Phase 3 — Contenu réunionnais** : 9 fruits + combava doré bonus (score x2), décor final (volcan, océan, palmiers), musique séga
- [x] **Phase 4 — Mobile** : multi-touch (swipes simultanés), safe-areas, PWA installable (manifest + service worker), Capacitor Android, orientation responsive (portrait/paysage)

## Captures d'écran

_À ajouter._
