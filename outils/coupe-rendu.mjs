// Rend une coupe complète hors ligne, exactement comme le jeu l'assemble,
// pour pouvoir la mesurer avant de toucher au code.
//
// Reproduit la chaîne de SfxManager.trancheReelle() : la lame prise dans
// tranche.wav, la chair 55 ms après, et — c'est ce qu'on ajoute — un CORPS
// GRAVE synthétisé sous les deux.
//
// POURQUOI CE CORPS. Mesuré sur un enregistrement de Fruit Ninja, leur impact
// de découpe a son centre de gravité entre 490 et 970 Hz, avec seulement 2 à
// 7 % d'énergie au-dessus de 1,5 kHz. Le nôtre est à 6 668 Hz et 99 % au-dessus.
// On a construit un sifflement là où il faut un choc.
//
//   node outils/coupe-rendu.mjs [rayon] [volumeCorps]
import fs from 'fs';

const SR = 48000;
const RAYON = +process.argv[2] || 60;
const VOL_CORPS = process.argv[3] === undefined ? 0.55 : +process.argv[3];
// Toit sur le jus : 0 = on n'y touche pas. Notre echantillon de chair porte
// 20 a 30 % de son energie au-dessus de 3,5 kHz, la ou la reference n'en a
// presque rien — c'est ce qui tire notre centre de gravite vers le haut.
const TOIT_JUS = +process.argv[4] || 0;

// Valeurs reprises de src/utils/constants.ts
const TRANCHE_COUPS = [[0.0, 0.02], [0.04, 0.0274], [0.0874, 0.0299], [0.1373, 0.0324], [0.1898, 0.0324], [0.2422, 0.0424]];
const TRANCHE_JUS = [[0.3046, 0.15], [0.4746, 0.36]];
const TRANCHE_VOLUME = 0.42, TRANCHE_JUS_VOLUME = 0.48, TRANCHE_JUS_RETARD = 0.055;

// ---------- la planche ----------
const buf = fs.readFileSync('public/assets/sfx/tranche.wav');
let pos = 12, fmt = null, data = null;
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4), t = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') fmt = { canaux: buf.readUInt16LE(pos + 10) };
  if (id === 'data') data = { debut: pos + 8, taille: t };
  pos += 8 + t + (t % 2);
}
const nP = Math.floor(data.taille / (2 * fmt.canaux));
const planche = new Float32Array(nP);
for (let i = 0; i < nP; i++) {
  const o = data.debut + i * 2 * fmt.canaux;
  planche[i] = fmt.canaux > 1 ? (buf.readInt16LE(o) + buf.readInt16LE(o + 2)) / 65536 : buf.readInt16LE(o) / 32768;
}

let graine = 0x9e3779b9 >>> 0;
const alea = () => { graine ^= graine << 13; graine >>>= 0; graine ^= graine >>> 17; graine ^= graine << 5; graine >>>= 0; return graine / 4294967296; };

// ---------- la sortie ----------
const DUREE = 0.6, N = Math.round(DUREE * SR);
const sortie = new Float32Array(N);

/** Rejoue une région de la planche, à une vitesse et un niveau donnés. */
function region(offset, duree, vitesse, volume, retard, toit = 0) {
  if (toit > 0) {
    // On rend la région à part pour pouvoir la filtrer avant de la mélanger.
    const nb = Math.round((duree / vitesse) * SR);
    const seul = new Float32Array(nb);
    for (let i = 0; i < nb; i++) {
      const p = offset * SR + i * vitesse;
      const a = Math.floor(p), f = p - a;
      if (a + 1 >= nP) break;
      seul[i] = (planche[a] * (1 - f) + planche[a + 1] * f) * volume;
    }
    const doux = biquad(biquad(seul, 'lp', toit, 0.707), 'lp', toit, 0.707);
    const d0 = Math.round(retard * SR);
    for (let i = 0; i < nb; i++) { const k = d0 + i; if (k < N) sortie[k] += doux[i]; }
    return;
  }
  const debut = Math.round(retard * SR);
  const nb = Math.round((duree / vitesse) * SR);
  for (let i = 0; i < nb; i++) {
    const k = debut + i;
    if (k >= N) break;
    // lecture à vitesse variable, interpolation linéaire
    const p = offset * SR + i * vitesse;
    const a = Math.floor(p), f = p - a;
    if (a + 1 >= nP) break;
    sortie[k] += (planche[a] * (1 - f) + planche[a + 1] * f) * volume;
  }
}

function biquad(x, type, f0, Q) {
  const w = (2 * Math.PI * f0) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
  else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * LE CORPS DE LA CHAIR — ce qu'on ajoute.
 *
 * Du bruit passé dans une bande étroite qui DESCEND : c'est l'effondrement.
 * Un fruit qui cède ne claque pas à hauteur fixe, il s'écrase. Le toit à
 * 1,5 kHz garantit qu'on reste dans le registre du choc et qu'on ne vient pas
 * encombrer la bande de la lame.
 *
 * Le centre suit la taille du fruit : un letchi s'effondre plus haut qu'une
 * papaye, comme un petit tambour sonne plus haut qu'un grand.
 */
function corps(rayon, volume, retard) {
  const centre = Math.min(950, Math.max(500, 1204 - rayon * 7.6));
  const nb = Math.round(0.16 * SR);
  const brut = new Float32Array(nb);
  for (let i = 0; i < nb; i++) brut[i] = alea() * 2 - 1;
  // Balayage descendant approché par trois tronçons de bande passante.
  const morceaux = [[0, 0.33, centre * 1.35], [0.33, 0.66, centre], [0.66, 1, centre * 0.72]];
  const filtre = new Float32Array(nb);
  for (const [d, f, hz] of morceaux) {
    const y = biquad(brut, 'bp', hz, 1.4);
    const a = Math.round(d * nb), z = Math.round(f * nb);
    for (let i = a; i < z; i++) filtre[i] = y[i];
  }
  const plafonne = biquad(filtre, 'lp', 1500, 0.7);
  const debut = Math.round(retard * SR);
  for (let i = 0; i < nb; i++) {
    const k = debut + i;
    if (k >= N) break;
    const t = i / SR;
    // Montée de 16 ms puis extinction : le pic tombe donc 71 ms après la lame,
    // ce qui place l'impact dans la fenêtre 65-80 ms mesurée sur la référence.
    const env = Math.min(1, t / 0.016) * Math.exp(-Math.max(0, t - 0.016) / 0.038);
    sortie[k] += plafonne[i] * env * volume;
  }
}

// ---------- assemblage, comme dans le jeu ----------
const vitesse = Math.min(1.3, Math.max(0.82, Math.sqrt(58 / Math.max(RAYON, 20))));
const [oC, dC] = TRANCHE_COUPS[2];
region(oC, dC, vitesse, TRANCHE_VOLUME, 0);
const long = RAYON > 62;
const [oJ, dJ] = TRANCHE_JUS[long ? 1 : 0];
const retard = TRANCHE_JUS_RETARD / vitesse;
region(oJ, dJ, vitesse, TRANCHE_JUS_VOLUME, retard, TOIT_JUS);
if (VOL_CORPS > 0) corps(RAYON, VOL_CORPS, retard);

// ---------- écriture ----------
const nom = process.env.SORTIE || ('coupe-r' + RAYON + '-c' + VOL_CORPS + (TOIT_JUS ? '-t' + TOIT_JUS : '') + '.wav');
const out = Buffer.alloc(44 + N * 2);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 2, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
out.writeUInt16LE(1, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28);
out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 2, 40);
let pic = 0;
for (let i = 0; i < N; i++) pic = Math.max(pic, Math.abs(sortie[i]));
for (let i = 0; i < N; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sortie[i])) * 32767), 44 + i * 2);
fs.writeFileSync(nom, out);
console.log(JSON.stringify({ fichier: nom, rayon: RAYON, volumeCorps: VOL_CORPS, toitJus: TOIT_JUS || 'aucun', vitesse: +vitesse.toFixed(3), jusLong: long, crete: +pic.toFixed(3), creteDb: +(20 * Math.log10(pic)).toFixed(1) }));
