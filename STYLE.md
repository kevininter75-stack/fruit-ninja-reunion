# Guide de style — Fruit Ninja Réunion

Ce document n'invente rien. Il **relève** la langue visuelle déjà en place dans le
code et la fige, pour que tout asset produit ensuite — sprite généré, décor
refait, nouveau fruit — s'y conforme au lieu de diverger.

Chaque valeur ci-dessous est mesurée dans un fichier source, cité en regard.
Quand le code et ce document divergeront, **le code a raison** : corriger ici.

---

## 1. La phrase de style

> Un couchant réunionnais peint à la main. Fruits en volume franc à contour
> sombre, décor en aplats étagés par la perspective aérienne, le tout fondu
> par un étalonnage chaud-froid de cinéma.

Ce qui est **exclu** : le vectoriel plat, le dégradé-comme-style, la photo, le
pixel art, l'icône système. Un fruit doit se lire comme peint, pas comme tracé.

---

## 2. Ancres de palette

### 2.1 Le ciel — la source de toute la lumière du jeu

Dégradé vertical à sept arrêts (`utils/backdrop.ts`, `paintSky`) :

| Position | Valeur | Rôle |
|---|---|---|
| 0.00 | `#0b4f74` | bleu nuit du zénith |
| 0.22 | `#1478a0` | bleu franc |
| 0.46 | `#48a9c0` | turquoise de transition |
| 0.63 | `#b9a074` | **la bascule bleu → or** (étalée exprès : trop courte, elle fait une bande visible) |
| 0.75 | `#f2a95c` | or |
| 0.90 | `#e8713f` | orange brûlé |
| 1.00 | `#d9512f` | rouge de l'horizon |

### 2.2 Les fruits

Les couleurs de peau ont été **confrontées à une mesure sur photos** — 423 000
pixels, six espèces, Wikimedia. Cinq des six tombaient à moins de 6° de teinte
de la mesure ; seul le corossol s'écartait de 10°. Elles sont donc validées et
ne se retouchent pas « à l'œil ».

| Variété | Peau | Jus | Chair |
|---|---|---|---|
| Letchi | `#d93b52` | `#f2b8c6` | `#fbe6d4` |
| Goyavier | `#c0442e` | `#ef8a6a` | `#f7e8dd` |
| Ananas Victoria | `#e8a417` | `#ffd75e` | `#ffe07a` |
| Mangue José | `#f08a20` | `#ffb347` | `#ffc35e` |
| Fruit de la passion | `#6b3576` | `#ffc93c` | `#ffc93c` |
| Pitaya | `#d93b6e` | `#f7c8da` | `#f7f5f5` |
| Corossol | `#74a94e` | `#f5f0e6` | `#f7f3ea` |
| Carambole | `#f2cf3f` | `#fdf0a0` | `#fdf6c9` |
| Combava doré *(bonus)* | `#f5c518` | `#ffe680` | `#fff2b3` |
| Piment cabri *(frénésie)* | `#e03418` | `#ff6a3d` | `#fbe3c8` |
| Papaye cyclone *(déclencheur)* | `#2e2a78` | `#4ae8de` | `#8ff2ea` |

**Règle d'occupation du spectre.** Le catalogue occupe déjà le rouge rosé
(letchi), le rouge brique (goyavier), l'écarlate orangé (piment), l'orange
(mangue), le jaune (ananas, carambole, combava), le vert (corossol), le violet
(passion) et le magenta (pitaya). **Toute nouvelle variété doit trouver une
case libre** — ou être écartée. Deux fruits voisins en teinte ne se distinguent
pas à la vitesse où ils traversent l'écran ; c'est la raison pour laquelle
longane, papaye et jacque ont été retirées du catalogue.

C'est aussi pourquoi la papaye cyclone est **la seule couleur inventée du jeu** :
il ne restait que le bleu.

### 2.3 Les reliefs — barème de perspective aérienne

C'est le barème le plus important du document : c'est lui qui fait la
profondeur. Plus un relief est loin, plus l'air empilé devant lui le décolore,
l'éclaircit et le tire vers la couleur du ciel (`utils/backdrop.ts`).

| Plan | Valeur | Flou | Lecture |
|---|---|---|---|
| Crête lointaine | `rgba(126, 149, 172, 0.55)` | 3.2 u | la plus pâle, la plus transparente |
| Crête médiane | `rgba(92, 112, 136, 0.68)` | 3.2 u | — |
| Crête proche | `rgba(61, 76, 96, 0.86)` | 1.4 u | — |
| **Le Piton** | `rgba(38, 49, 64, 0.94)` | net | plan principal, il donne l'échelle |

Tout nouveau relief s'insère **dans** ce barème : on interpole, on n'ajoute pas
une valeur hors gamme.

---

## 3. Couleur sémantique — intouchable

| Sens | Couleur |
|---|---|
| Danger / raté | rouge (croix de vie, bombe) |
| Célébration / bonus | or (combava, coup critique) |
| Frénésie | écarlate orangé (piment cabri) |
| Événement rare | turquoise sur indigo (papaye cyclone) |

Ces associations ne se permutent jamais. Un fruit doré qui pénaliserait, ou une
croix de vie verte, casserait un réflexe que le joueur a acquis en trois parties.

---

## 4. La direction de lumière

Une seule, et elle est déjà définie en un point unique du code
(`utils/surfaceShading.ts`) :

```
KEY   = normalize(-0.46, -0.58, 0.67)   couleur [1.00, 0.90, 0.78]   (chaude)
FILL  = normalize( 0.52,  0.34, 0.45)   couleur [0.44, 0.56, 0.78]   (froide)
AMBIENT = 0.36
```

- **Clé chaude en haut à gauche**, remplissage **froid** venant du ciel opposé.
  Sans ce remplissage, l'ombre est un trou noir et le fruit se décolle du décor.
- Le reflet verni (`addGloss`) est posé au même endroit — `−0.34 r` en x,
  `−0.40 r` en y — donc cohérent avec la clé.
- **Le reflet efface tout ce qui est peint sous lui.** C'est pour cette raison
  que la joue rouge de la mangue est à droite et non à gauche. Tout motif
  destiné à rester visible se place à l'opposé du reflet.
- La texture est peinte **sous pleine lumière**, le relief n'étant qu'une
  modulation autour de cette référence — une teinte ne sait qu'assombrir.

> ⚠️ **Écart connu, à trancher.** Le soleil du décor est à `SUN_FRAC_X = 0.34`,
> `SUN_FRAC_Y = 0.52` : à gauche, mais **à hauteur d'horizon**, puisque c'est un
> couchant. Les fruits, eux, sont éclairés **par le haut** à gauche. Un fruit qui
> vole au-dessus de l'horizon devrait recevoir sa lumière de côté, presque par
> en dessous. Les deux systèmes sont justes pris séparément et cohérents en
> interne — ils ne pointent simplement pas vers la même source. Voir §7.

---

## 5. Hiérarchie focale

Le décor doit toujours être **plus calme** que le terrain de jeu.

- Voile sombre translucide sur le décor **en partie uniquement**, alpha `0.40`
  (`GAME_DARKEN_ALPHA`, profondeur 1). Le menu, lui, reste éclatant.
- Vignettage cinématique au-dessus du jeu, sous le HUD (`DEPTH_VIGNETTE = 45`).
- Étalonnage GPU final (`systems/SceneGrading.ts`) : matrice 4×5, hautes
  lumières chaudes / ombres froides, contraste rehaussé. Rouge ×1.045,
  vert ×1.005, bleu ×0.955. C'est **le plus gros écart visuel pour le plus
  petit coût** de toute la chaîne — une multiplication de matrice par pixel.
- **Pas de bloom** : le shader de Phaser n'a pas de seuil, il baverait le score
  et les libellés. Le rayonnement passe par des passes additives dessinées.

**Test d'acceptation — le test du plissement d'yeux.** Floute un écran de jeu :
les fruits doivent rester la zone la plus contrastée. Si un plan de décor
gagne, **on assombrit le décor** — on ne rehausse jamais le fruit.

---

## 6. Règles de dessin héritées

Elles sont acquises au prix d'essais ratés ; les redécouvrir coûterait cher.

1. **La silhouette porte l'identité.** Un tracé par variété (tonneau couronné de
   l'ananas, rein de la mangue, ovoïde hérissé du corossol, étoile de la
   carambole). Un aplat coloré ne se reconnaît pas.
2. **Un seul tracé de forme par fruit**, réutilisé pour le corps, le clip des
   motifs, le contour et — rétréci de 16 % (`FLESH_SHRINK`) — la chair des
   moitiés. Entier et moitiés ne peuvent donc pas diverger, et la bande
   d'écorce apparaît toute seule quelle que soit la forme.
3. **Contour sombre façon dessin animé.** C'est lui qui détache le fruit du
   décor, pas la couleur.
4. **La chair à la coupe est décisive** — pépins noirs et pulpe dorée du fruit
   de la passion, noyau plat de la mangue, quartiers d'agrume du combava,
   chair creuse du piment. C'est le moment où le joueur regarde le fruit de
   plus près.
5. **En fusion additive, un halo au-delà d'alpha ≈ 0.30 sature en blanc et
   efface le fruit.** Plage utile mesurée : 0.22 à 0.44.
6. **Taille de lecture** : 20 à 25 % de la hauteur d'écran. En dessous, le fruit
   n'est plus reconnaissable sur un téléphone.
7. **Aucune zone de texte cuite dans un sprite.** Les mots sont rendus par le
   code, jamais peints dans l'image.

---

## 7. Écarts relevés à l'audit

Par ordre de rapport qualité/prix, tous réalisables **sans génération d'images** :

1. **La lumière des fruits ne pointe pas vers le soleil du décor** (§4). Deux
   corrections possibles : remonter le soleil du décor, ou incliner `KEY` vers
   l'horizon. La seconde est un changement d'une ligne, mais aplatira le
   modelé des fruits — à arbitrer visuellement, pas sur le papier.
2. **La perspective aérienne s'arrête au décor.** Elle est appliquée crête par
   crête, mais les fruits n'en reçoivent rien. Ils volent pourtant à des
   distances différentes du joueur.
3. **Le décor est une image unique cuite au chargement.** Les crêtes, la mer et
   les palmiers ne sont pas des plans séparés : aucun ne peut donc bouger
   indépendamment. C'est un choix assumé (voir la note ci-dessous), pas un
   oubli.

> **Note sur la parallaxe.** Le code désactive explicitement la dérive des plans
> pendant la partie : « en pleine partie, un décor qui bouge sous des fruits qui
> volent brouille la lecture de l'action » (`entities/AnimatedBackground.ts`).
> C'est un arbitrage produit défendable, et il prime sur toute recommandation
> générique de parallaxe. Le jeu n'a d'ailleurs **pas d'horloge de monde** : la
> caméra est fixe, rien ne défile. Découper le décor en plans mobiles n'aurait
> de sens que pour le menu et l'écran de fin, où la dérive est déjà active.
