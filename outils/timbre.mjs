// Comment le timbre evolue A L'INTERIEUR d'un son.
//
// Une decoupe faite de deux couches (la lame, puis la chair) doit se lire
// comme un CENTRE DE GRAVITE QUI DESCEND : ca commence aigu et sec, ca finit
// grave et mou. Si le centre monte, ou ne bouge pas, c'est un son simple.
import fs from 'fs';

const SR = 48000;
const buf = fs.readFileSync(process.env.FICHIER || 'ordinaire.wav');
let pos = 12, fmt = null, data = null;
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4), t = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') fmt = { canaux: buf.readUInt16LE(pos + 10) };
  if (id === 'data') data = { debut: pos + 8, taille: t };
  pos += 8 + t + (t % 2);
}
const n = Math.floor(data.taille / (2 * fmt.canaux));
const x = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const o = data.debut + i * 2 * fmt.canaux;
  x[i] = fmt.canaux > 1
    ? (buf.readInt16LE(o) + buf.readInt16LE(o + 2)) / 65536
    : buf.readInt16LE(o) / 32768;
}
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const T = 512; // 10,7 ms : assez court pour suivre une attaque
const hann = new Float32Array(T);
for (let i = 0; i < T; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (T - 1));
function trame(d) {
  const re = new Float64Array(T), im = new Float64Array(T);
  for (let i = 0; i < T; i++) re[i] = (d + i < n ? x[d + i] : 0) * hann[i];
  fft(re, im);
  let num = 0, den = 0, haut = 0, bas = 0;
  for (let k = 2; k < T / 2; k++) {
    const hz = (k * SR) / T, p = re[k] * re[k] + im[k] * im[k];
    if (hz < 200) continue;
    num += hz * p; den += p;
    if (hz >= 1500) haut += p; else bas += p;
  }
  return { centre: den ? num / den : 0, niveau: Math.sqrt(den), partHaut: haut + bas ? haut / (haut + bas) : 0 };
}

const EVENEMENTS = (process.env.EVENEMENTS || '2.99,3.33,3.56,4.10').split(',').map(Number);
const DECALAGE = +process.env.DECALAGE || 0;
const PAS = Math.round(SR * 0.005);
for (const t0 of EVENEMENTS) {
  console.log('\nEVENEMENT a ' + t0.toFixed(3) + ' s' + (DECALAGE ? '   (video ' + (t0 + DECALAGE).toFixed(3) + ' s)' : ''));
  console.log('   t(ms)  niveau   centre   part au-dessus de 1,5 kHz');
  const deb = Math.round(t0 * SR);
  let pic = 0;
  const lignes = [];
  for (let k = 0; k < 40; k++) {
    const r = trame(deb + k * PAS);
    lignes.push({ ms: k * 5, ...r });
    if (r.niveau > pic) pic = r.niveau;
  }
  for (const l of lignes) {
    const d = 20 * Math.log10((l.niveau + 1e-12) / pic);
    if (d < -34) continue;
    console.log(
      '   ' + String(l.ms).padStart(4) + '   ' + d.toFixed(0).padStart(4) + ' dB  ' +
      String(Math.round(l.centre)).padStart(5) + ' Hz   ' +
      String(Math.round(100 * l.partHaut)).padStart(3) + ' %  ' +
      '█'.repeat(Math.max(0, Math.round(l.partHaut * 40)))
    );
  }
}
