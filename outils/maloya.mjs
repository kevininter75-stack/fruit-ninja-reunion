// Boucle maloya synthetisee pour Kout Sab'.
// Rien de l'enregistrement de reference n'entre ici : on en reprend la grille
// (121 BPM) et l'etagement des instruments, pas une seule de ses notes.
import fs from 'fs';

const SR = 48000;
const BARRES = 8, TEMPS = 4, BATTEMENTS = BARRES * TEMPS;
// Le nombre d'echantillons est FIXE EN ENTIER, et le tempo s'en deduit. C'est
// l'inverse du reflexe habituel, mais c'est ce qui garantit que la fin retombe
// exactement sur le debut : un tempo rond donnerait une longueur fractionnaire
// et un clic a chaque tour de boucle.
const N = Math.round((BATTEMENTS * 60 * SR) / 121);
const BPM = (BATTEMENTS * 60 * SR) / N;

let graine = 0x2f6e2b1 >>> 0;
const alea = () => {
  graine ^= graine << 13; graine >>>= 0;
  graine ^= graine >>> 17;
  graine ^= graine << 5; graine >>>= 0;
  return graine / 4294967296;
};
const bruit = () => alea() * 2 - 1;

function biquad(x, type, f0, Q) {
  const w = (2 * Math.PI * f0) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Roulèr — le gros tambour basse, joue a mains nues.
 *
 * TROIS FRAPPES, PAS DEUX. Un joueur n'alterne pas deux sons : il a la frappe
 * pleine au centre, la claque sur le bord, et surtout les coups etouffes, joues
 * a moitie, qui remplissent les trous entre les vrais coups. Ce sont eux qui
 * font la difference entre un motif et un groove — sans eux on entend une
 * grille, avec eux on entend quelqu'un qui joue.
 *
 * Le fondamental est vers 80 Hz, la ou un haut-parleur de telephone ne rend
 * rien. Les harmoniques 2, 3 et 4 sont donc volontairement fortes : elles
 * tombent entre 160 et 330 Hz et l'oreille reconstitue le grave absent.
 */
const FRAPPES = {
  //                 hauteur  tenue du corps  claquement  niveau
  gras:   { f0: 78,  tenue: 0.17,  clap: 0.85, niveau: 1.0 },
  claque: { f0: 106, tenue: 0.075, clap: 1.90, niveau: 0.76 },
  sourd:  { f0: 92,  tenue: 0.028, clap: 0.55, niveau: 0.30 },
};

function rouler(force, type) {
  const f = FRAPPES[type];
  const n = Math.round(0.45 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (f.f0 * (1 + 1.6 * Math.exp(-t / 0.018)))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t / f.tenue)
      + 0.58 * Math.sin(2 * ph) * Math.exp(-t / (f.tenue * 0.53))
      + 0.34 * Math.sin(3 * ph) * Math.exp(-t / (f.tenue * 0.31))
      + 0.17 * Math.sin(4 * ph) * Math.exp(-t / (f.tenue * 0.19));
  }
  // Le claquement de la paume, cale entre 380 et 950 Hz : il donne l'attaque
  // sans empieter sur la bande ou vivent la lame et la coupe.
  const cl = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; cl[i] = t < 0.02 ? bruit() * Math.exp(-t / 0.0035) : 0; }
  const clf = biquad(biquad(cl, 'hp', 380, 0.7), 'lp', 950, 0.7);
  const g = force * f.niveau * (+process.env.ROUL || 0.5);
  for (let i = 0; i < n; i++) out[i] = (out[i] + clf[i] * f.clap * (+process.env.CLAP || 0.95)) * g;
  return out;
}

/**
 * Kayamb — le hochet plat rempli de graines.
 *
 * Bruit filtre AU-DESSUS de 4,2 kHz, pour laisser libre la bande 1,5-4 kHz
 * ou vivent le craquement de lame et l'eclatement du fruit.
 *
 * NIVEAU MONTE DE 0,55 A 0,90 APRES LE RETRAIT DU SATI. Mesure : sans la
 * plaque, la bande 4-16 kHz tombait de 7,7 % a 2,2 % et la boucle reperdait
 * 14,4 dB sur un haut-parleur de telephone — exactement le defaut qu'on
 * cherchait a corriger. Le hochet reprend ce role : il occupe la meme bande
 * mais par courtes bouffees de bruit, sans la resonance longue et reconnaissable
 * qui rendait le sati lassant. Monter plus haut (1,15) rendrait encore 1,6 dB,
 * au prix d'un souffle permanent qui deviendrait a son tour fatigant.
 */
function kayamb(force) {
  const n = Math.round(0.13 * SR), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    b[i] = bruit() * Math.min(1, t / 0.0015) * Math.exp(-t / 0.028);
  }
  const y = biquad(biquad(b, 'hp', 4200, 0.6), 'lp', 11000, 0.7);
  for (let i = 0; i < n; i++) y[i] *= force * (+process.env.KAY || 0.90);
  return y;
}

/**
 * Pikèr — le bambou frappe aux baguettes.
 *
 * VERSION CORRIGEE : la premiere contenait une sinusoide a 1150 Hz, et comme
 * elle tombe 48 fois par boucle, ca s'entendait comme un bip. Mesure a l'appui :
 * un pic depassant de 17,4 dB son voisinage, de loin le plus saillant du
 * medium. Un bambou frappe n'a pas de hauteur franche — c'est un coup sec, pas
 * une note.
 *
 * Donc : plus aucune sinusoide, une extinction de 4 ms au lieu de 12, une bande
 * LARGE (Q a 0,5) parce qu'une bande etroite fait sonner le bruit lui-meme, et
 * un centre tire au hasard a chaque coup pour qu'aucune hauteur ne se repete.
 */
function piker(force) {
  const n = Math.round(0.05 * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bruit() * Math.exp(-(i / SR) / (+process.env.PIKD || 0.009));
  const centre = 980 + alea() * 360;
  const y = biquad(biquad(out, 'hp', centre * 0.6, 0.5), 'lp', centre * 2.0, 0.5);
  for (let i = 0; i < n; i++) y[i] *= force * (+process.env.PIK || 0.70);
  return y;
}

/**
 * Sati — la plaque metallique frappee. EN RESERVE, PLUS UTILISE.
 *
 * Retire a la demande de Kevin : deux frappes par mesure, une resonance de
 * 350 ms et un timbre tres reconnaissable, ca s'entend seize fois par boucle
 * et l'oreille s'en lasse avant la fin du premier tour. Le kayamb couvre deja
 * la meme bande, donc son depart ne laisse pas de trou.
 *
 * Gardee ici au cas ou on voudrait un seul accent en tete de boucle — une fois
 * toutes les seize secondes, ce serait un reperage, plus une redondance.
 */
function sati(force) {
  const n = Math.round(0.35 * SR), out = new Float32Array(n);
  for (const [f, a] of [[4350, 1], [5870, 0.7], [7130, 0.5], [9420, 0.34], [11800, 0.2]]) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * f) / SR;
      out[i] += Math.sin(ph) * a * Math.exp(-t / (0.10 + 0.000002 * f));
    }
  }
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] += bruit() * 0.35 * Math.exp(-t / 0.012); }
  const y = biquad(out, 'hp', 3600, 0.6);
  for (let i = 0; i < n; i++) y[i] *= force * 0.3;
  return y;
}

/**
 * La basse modale.
 *
 * POURQUOI ELLE SONNAIT COMME UN PIANO. Attaque de 12 ms et cinq harmoniques
 * franches : c'est la recette d'une corde frappee. Tant qu'elle tenait une
 * pedale sur toute la mesure, l'oreille entendait un bourdon et ne cherchait
 * pas l'instrument. Des qu'elle a joue court et souvent, le timbre s'est mis a
 * s'entendre pour ce qu'il etait — et ce n'etait pas une basse de maloya.
 *
 * Trois corrections, qui vont toutes dans le meme sens : moins frappee.
 *   - attaque de 45 ms au lieu de 12 : ca enfle au lieu de claquer, ce qui est
 *     la difference entre une corde pincee et un souffle grave ;
 *   - harmoniques hautes coupees (0,40 -> 0,16 pour la 3e, 0,22 -> 0,05 pour la
 *     4e) : c'est elles qui donnaient le brillant de clavier ;
 *   - extinction plus longue, pour qu'elle porte au lieu de ponctuer.
 *
 * La 2e harmonique reste appuyee : elle tombe vers 220 Hz et c'est elle qui
 * permet a un haut-parleur de telephone de rendre quelque chose du grave.
 */
function basse(f, duree, force) {
  const n = Math.round(duree * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.045) * Math.exp(-t / (duree * 0.50));
    out[i] = (Math.sin(ph) + 0.58 * Math.sin(2 * ph) + 0.16 * Math.sin(3 * ph)
      + 0.05 * Math.sin(4 * ph)) * env * force * (+process.env.BAS || 0.32);
  }
  return out;
}

// ---------- rendu ----------
const mode = process.argv[2] === 'ternaire' ? 'ternaire' : 'binaire';
const SLOTS = mode === 'ternaire' ? 12 : 16;
const G = new Float32Array(N), D = new Float32Array(N);

function poser(pos, grain, pan, gain) {
  const gg = Math.cos(((pan + 1) * Math.PI) / 4), dd = Math.sin(((pan + 1) * Math.PI) / 4);
  const p = Math.round(pos);
  // Modulo : ce qui depasse la fin revient au debut. Sans ca, la queue du
  // dernier coup serait coupee net et la boucle claquerait a chaque tour.
  for (let i = 0; i < grain.length; i++) {
    const k = (p + i) % N;
    G[k] += grain[i] * gg * gain; D[k] += grain[i] * dd * gain;
  }
}
const posSlot = (b, s) => ((b * SLOTS + s) / (SLOTS * BARRES)) * N;
const flottement = () => (alea() - 0.5) * 0.006 * SR; // +/- 3 ms, pour que ca respire
const vel = (base) => base * (0.86 + alea() * 0.28);

/**
 * LES MOTIFS.
 *
 * Trois phrases au lieu d'une seule repetee. Huit mesures identiques
 * s'entendent comme une mesure jouee huit fois : l'oreille a tout compris au
 * deuxieme tour et decroche. En alternant A et B, la phrase devient longue de
 * deux mesures, et C vient casser l'attente juste avant la relance finale.
 *
 * PHRASES A CONSTRUIRE AVEC KEVIN. Elles sont de mon invention : j'ai applique
 * ce que je crois etre la logique du genre — le 3-contre-2 du pikèr, la pedale
 * modale, les coups etouffes entre les frappes pleines. Mais je ne transcris
 * aucune tradition que je saurais verifier, et c'est lui qui sait si ca sonne
 * reunionnais ou si ca sonne comme un etranger qui imite.
 */
const PHRASES = {
  ternaire: {
    A: { gras: [0, 7], claque: [3, 10], sourd: [2, 5, 8, 11] },
    B: { gras: [0, 6], claque: [3, 9, 10], sourd: [1, 5, 8, 11] },
    C: { gras: [0, 5, 7], claque: [3, 10], sourd: [2, 4, 8, 11] },
  },
  binaire: {
    A: { gras: [0, 6, 10], claque: [4, 14], sourd: [2, 8, 12, 15] },
    B: { gras: [0, 6], claque: [4, 11, 14], sourd: [2, 8, 13, 15] },
    C: { gras: [0, 3, 6, 10], claque: [14], sourd: [2, 8, 12, 15] },
  },
}[mode];
// La septieme mesure change : c'est la ou l'oreille attend la repetition.
const ORDRE = ['A', 'B', 'A', 'B', 'A', 'B', 'C', 'B'];

/**
 * LA BASSE : un motif, plus une pedale.
 *
 * Chaque entree est [slot, demi-tons au-dessus de la racine, longueur en slots].
 * Les notes tombent avec les frappes pleines du roulèr — une basse qui ne
 * s'accroche pas au tambour flotte a cote de la musique au lieu de la porter.
 */
const MOTIFS_BASSE = {
  ternaire: {
    P: [[0, 0, 9]],
    Q: [[0, 0, 6], [7, 7, 4]],
    R: [[0, 0, 5], [6, 10, 5]],
  },
  binaire: {
    P: [[0, 0, 12]],
    Q: [[0, 0, 8], [10, 7, 5]],
    R: [[0, 0, 7], [8, 10, 7]],
  },
}[mode];
const ORDRE_BASSE = (process.env.OB || 'P,Q,P,R,P,Q,P,R').split(',');
// Racine de chaque mesure : pedale de la, deux ecarts, retour.
const RACINES = [110, 110, 110, 110, 98, 98, 130.81, 110];

/**
 * LE KAYAMB : trois nuances au lieu de deux, et il respire.
 *
 * Il frappait chaque slot avec seulement fort/faible. Un joueur n'a pas deux
 * volumes : il a l'accent, la frappe ordinaire, et le frolement presque muet —
 * et il lui arrive de sauter un coup. 0 = silence, 1 = frolement, 2 = ordinaire,
 * 3 = accent.
 */
const KAYAMB = {
  ternaire: {
    K1: [3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2],
    K2: [3, 1, 2, 3, 1, 0, 3, 2, 2, 3, 1, 2],
    K3: [3, 2, 1, 3, 1, 2, 3, 1, 2, 2, 2, 3],
  },
  binaire: {
    K1: [3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2, 1],
    K2: [3, 1, 2, 1, 3, 1, 0, 1, 3, 1, 2, 1, 3, 2, 2, 1],
    K3: [3, 1, 2, 2, 3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2, 2],
  },
}[mode];
const ORDRE_KAY = ['K1', 'K2', 'K1', 'K3', 'K1', 'K2', 'K3', 'K2'];
const FORCE_KAY = [0, 0.30, 0.58, 1.0];
// Le souffle : la main se fatigue et repart, sur toute la longueur de la boucle.
const SOUFFLE = [0.92, 0.97, 1.0, 1.05, 0.94, 1.0, 1.07, 1.0];

const MOTIFS = {
  // Ternaire : le pikèr tombe une croche sur deux sur une grille a trois temps,
  // ce qui cree le 3-contre-2 — le balancement qui fait respirer cette musique.
  ternaire: { piker: [0, 2, 4, 6, 8, 10] },
  binaire: { piker: [2, 6, 10, 14] },
}[mode];

const STEM = process.env.STEM || '';
const veut = (nom) => !STEM || STEM === nom;
const dureeSlot = ((60 / BPM) * TEMPS) / SLOTS;

for (let b = 0; b < BARRES; b++) {
  const phrase = PHRASES[ORDRE[b]];
  if (veut('rouler')) {
    for (const s of phrase.gras) poser(posSlot(b, s) + flottement(), rouler(vel(1), 'gras'), 0, 1);
    for (const s of phrase.claque) poser(posSlot(b, s) + flottement(), rouler(vel(1), 'claque'), 0.1, 1);
    // Les coups etouffes varient beaucoup plus en force : c'est irregulier chez
    // un joueur, et c'est precisement cette irregularite qui s'entend comme
    // humaine plutot que comme programmee.
    for (const s of phrase.sourd) poser(posSlot(b, s) + flottement(), rouler(0.55 + alea() * 0.75, 'sourd'), -0.12, 1);
  }
  if (veut('kayamb')) {
    const nuances = KAYAMB[ORDRE_KAY[b]];
    for (let s = 0; s < SLOTS; s++) {
      const f = FORCE_KAY[nuances[s]];
      if (f === 0) continue;
      poser(posSlot(b, s) + flottement(), kayamb(vel(f) * SOUFFLE[b]), s % 2 ? 0.34 : -0.34, 1);
    }
  }
  if (veut('piker')) for (const s of MOTIFS.piker) poser(posSlot(b, s) + flottement(), piker(vel(0.8)), -0.22, 1);
  if (veut('basse')) {
    for (const [s, demi, longueur] of MOTIFS_BASSE[ORDRE_BASSE[b]]) {
      const f = RACINES[b] * Math.pow(2, demi / 12);
      poser(posSlot(b, s) + flottement(), basse(f, longueur * dureeSlot, 1), 0, 1);
    }
  }
  // Relance sur la derniere mesure, pour ramener vers le debut.
  if (b === BARRES - 1 && veut('rouler')) {
    for (const s of [SLOTS - 4, SLOTS - 3, SLOTS - 2, SLOTS - 1]) {
      poser(posSlot(b, s) + flottement(), rouler(vel(0.85), s % 2 === 0 ? 'gras' : 'claque'), 0, 1);
      if (veut('kayamb')) poser(posSlot(b, s) + flottement(), kayamb(vel(0.95)), s % 2 ? 0.4 : -0.4, 1);
    }
  }
}

/**
 * Coupe des infra-graves : inaudibles partout, mais ils mangent la marge.
 *
 * FILTRE SUR LE SIGNAL DOUBLE, ET ON GARDE LA SECONDE MOITIE. Un biquad demarre
 * avec un etat interne a zero : filtrer directement laisserait un transitoire
 * de quelques dizaines de millisecondes au tout debut, qui n'existe nulle part
 * ailleurs dans la boucle. En bouclant, ce debut-la suit la fin — et la
 * periodicite serait rompue exactement au raccord, le seul endroit ou ca
 * s'entend. En faisant tourner le filtre une fois pour rien, il arrive au
 * raccord dans l'etat ou il serait apres un tour complet.
 */
function filtrerEnBoucle(x, f0, Q) {
  const double = new Float32Array(x.length * 2);
  double.set(x, 0);
  double.set(x, x.length);
  return biquad(double, 'hp', f0, Q).subarray(x.length);
}
const gg = filtrerEnBoucle(G, 42, 0.7), dd = filtrerEnBoucle(D, 42, 0.7);
let pic = 0;
for (let i = 0; i < N; i++) pic = Math.max(pic, Math.abs(gg[i]), Math.abs(dd[i]));
const k = 0.7 / pic;
for (let i = 0; i < N; i++) { gg[i] *= k; dd[i] *= k; }

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(gg[i] * 32767))), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(dd[i] * 32767))), 46 + i * 4);
}
const nom = 'maloya-' + mode + (STEM ? '-' + STEM : '') + '.wav';
fs.writeFileSync(nom, buf);

// Verification de la couture : l'ecart entre le dernier et le premier
// echantillon doit rester du meme ordre que les ecarts ordinaires.
let ecartMax = 0, somme = 0;
for (let i = 1; i < N; i++) {
  const e = Math.abs(gg[i] - gg[i - 1]);
  somme += e;
  if (e > ecartMax) ecartMax = e;
}
console.log(JSON.stringify({
  fichier: nom, mode, bpm: +BPM.toFixed(3), echantillons: N, secondes: +(N / SR).toFixed(3),
  mesures: BARRES, mo: +((44 + N * 4) / 1048576).toFixed(2),
  couture: {
    ecartAuRaccord: +Math.abs(gg[0] - gg[N - 1]).toFixed(5),
    ecartMoyen: +(somme / N).toFixed(5),
    ecartMax: +ecartMax.toFixed(5),
  },
}));
