# 🍈 Fruit Ninja Réunion

Jeu mobile-first de type **fruit-slicer** (façon Fruit Ninja) mettant en scène les fruits
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
Android/iOS et se lance en plein écran portrait.

### Android (Capacitor)

Le projet natif Android est généré dans `android/` (orientation portrait
verrouillée). Pour compiler l'APK, il faut Android Studio (ou le SDK +
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
  variété définit rayon, couleurs de jus/chair et poids de spawn ; les trois
  textures par fruit (entier + 2 moitiés) sont dessinées en canvas 2D avec
  découpe par clipping.
- **Feedback systématique** : particules de jus teintées, textes flottants
  (+points, combos) recyclés depuis un pool, flash + secousse caméra sur
  bombe, records persistés en localStorage.

## Feuille de route

- [x] **Phase 1 — MVP jouable** : spawn physique, détection de swipe, découpe, score, vies, game over
- [x] **Phase 2 — Feel & polish** : combos, bombes, particules de jus, sons, menu complet, mode Chrono, records
- [x] **Phase 3 — Contenu réunionnais** : 9 fruits + combava doré bonus (score x2), décor final (volcan, océan, palmiers), musique séga
- [x] **Phase 4 — Mobile** : multi-touch (swipes simultanés), safe-areas, PWA installable (manifest + service worker), Capacitor Android (portrait verrouillé)

## Captures d'écran

_À ajouter._
