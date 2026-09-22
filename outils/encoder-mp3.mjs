// Encodage MP3 de la boucle.
//
// POURQUOI MP3 ET PAS OPUS OU VORBIS, qui compressent mieux. Le jeu vise
// l'App Store : il doit se decoder sur un iPhone. Ogg Vorbis n'est pas lu par
// Safari, et Opus dans un conteneur WebM ne l'est que sur les versions
// recentes. MP3 se decode partout depuis toujours — on paie une cinquantaine
// de kilo-octets pour ne jamais avoir a y repenser.
//
// L'encodeur n'est installe que dans le dossier de travail : le projet ne gagne
// aucune dependance, le fichier produit suffit.
import fs from 'fs';
import vm from 'vm';

// lamejs 1.2 expose un point d'entree module casse (ses fichiers source
// dependent de variables globales qui ne sont jamais posees). Le bundle
// pre-construit, lui, fonctionne : on l'evalue dans un bac a sable.
const bac = { console };
bac.window = bac; bac.self = bac; bac.global = bac;
vm.createContext(bac);
vm.runInContext(fs.readFileSync('node_modules/lamejs/lame.min.js', 'utf8'), bac);
const lamejs = bac.lamejs;

const ENTREE = process.argv[2];
const DEBIT = +process.argv[3] || 128;
const SORTIE = process.argv[4] || ENTREE.replace(/\.wav$/, '.mp3');

const buf = fs.readFileSync(ENTREE);
let pos = 12, fmt = null, data = null;
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4), t = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') fmt = { canaux: buf.readUInt16LE(pos + 10), sr: buf.readUInt32LE(pos + 12) };
  if (id === 'data') data = { debut: pos + 8, taille: t };
  pos += 8 + t + (t % 2);
}
const n = Math.floor(data.taille / (2 * fmt.canaux));
const g = new Int16Array(n), d = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const o = data.debut + i * 2 * fmt.canaux;
  g[i] = buf.readInt16LE(o);
  d[i] = fmt.canaux > 1 ? buf.readInt16LE(o + 2) : g[i];
}

const enc = new lamejs.Mp3Encoder(fmt.canaux, fmt.sr, DEBIT);
const morceaux = [];
const BLOC = 1152; // la taille d'une trame MP3
for (let i = 0; i < n; i += BLOC) {
  const mp3 = enc.encodeBuffer(g.subarray(i, i + BLOC), d.subarray(i, i + BLOC));
  if (mp3.length) morceaux.push(Buffer.from(mp3));
}
const reste = enc.flush();
if (reste.length) morceaux.push(Buffer.from(reste));

const sortie = Buffer.concat(morceaux);
fs.writeFileSync(SORTIE, sortie);
console.log(JSON.stringify({
  sortie: SORTIE,
  debit: DEBIT + ' kbit/s',
  octets: sortie.length,
  ko: +(sortie.length / 1024).toFixed(1),
  reductionFoisWav: +(buf.length / sortie.length).toFixed(1),
}));
