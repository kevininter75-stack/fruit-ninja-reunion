# 🍈 Fruit Ninja Réunion

Jeu mobile-first de type **fruit-slicer** (façon Fruit Ninja) mettant en scène les fruits
typiques de La Réunion : letchis, mangues José, ananas Victoria, combavas…

Tranchez les fruits d'un geste du doigt (ou de la souris), évitez les bombes,
enchaînez les combos !

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

## Feuille de route

- [x] **Phase 1 — MVP jouable** : spawn physique, détection de swipe, découpe, score, vies, game over
- [ ] **Phase 2 — Feel & polish** : combos, bombes, particules de jus, sons, menu complet, mode Chrono
- [ ] **Phase 3 — Contenu réunionnais** : 9 fruits + combava doré bonus, décor final, musique
- [ ] **Phase 4 — Mobile** : multi-touch, safe-areas, Capacitor (Android/iOS), PWA

## Captures d'écran

_À ajouter._
