# Outils hors-jeu

Ces scripts ne sont pas embarqués dans le jeu. Ils servent à **fabriquer** et à
**mesurer** les fichiers audio. Ils tournent avec Node, sans dépendance — sauf
l'encodeur, qui a besoin de `lamejs` installé à part.

## `maloya.mjs` — fabrique la boucle musicale

C'est la SOURCE de `public/assets/music/maloya.mp3`. Le MP3 est un produit
fini : si on veut retoucher la musique, c'est ici, pas dans le fichier audio.

```bash
node outils/maloya.mjs ternaire     # la version retenue par Kevin
node outils/maloya.mjs binaire      # la variante à pulsation droite
```

Produit un WAV de 15,868 s à 121 BPM. Variables d'environnement pour régler
sans modifier le code : `KAY` (niveau du kayamb), `PIK` et `PIKD` (niveau et
durée du pikèr), `CLAP` (claquement de paume du roulèr), `BAS` (basse),
`ROUL` (roulèr), `OB` (ordre des motifs de basse), `STEM` (rendre un seul
instrument, pour diagnostiquer).

**Le nombre d'échantillons est fixé en entier et le tempo s'en déduit** — c'est
ce qui fait que la boucle se raccorde sans clic. Ne pas « arrondir le tempo ».

## `encoder-mp3.mjs` — encode la boucle

```bash
npm install lamejs        # dans un dossier de travail, PAS dans le projet
node outils/encoder-mp3.mjs maloya-ternaire.wav 128 maloya.mp3
```

128 kbit/s et pas moins : mesuré, à 96 la couture de boucle s'entend
(écart au raccord 0,0290 contre 0,0091 d'écart moyen). MP3 et pas Ogg/Opus
parce que le jeu vise l'App Store et doit se décoder sur iPhone.

## `timbre.mjs` — mesure l'évolution du timbre dans un son

Sert à comparer nos bruitages à des références. Affiche, tous les 5 ms, le
niveau, le centre de gravité spectral et la part d'énergie au-dessus de
1,5 kHz — c'est ce qui dit si un son va du clair au sombre (une lame puis une
chair) ou l'inverse.

```bash
FICHIER=public/assets/sfx/tranche.wav EVENEMENTS=0.0,0.0874 node outils/timbre.mjs
```

Gère le mono comme la stéréo. `DECALAGE` ajoute une constante aux instants
affichés, pratique quand on compare un enregistrement à une vidéo.
