import { getAudioContext } from '../utils/audioContext';
import { isMuted, setMuted } from '../utils/settings';

/**
 * Musique d'ambiance placeholder synthétisée en Web Audio — aucun fichier requis.
 *
 * Boucle instrumentale d'inspiration séga (l'identité musicale réunionnaise) :
 * marimba pentatonique, basse ronde, cabosse sur les contretemps, et un
 * ressac d'océan continu en fond. Quand une vraie musique arrivera
 * (public/assets/music/), cette façade sera remplacée sans changer les appels.
 *
 * Implémentation : ordonnanceur à anticipation (lookahead scheduling) —
 * un setInterval JS peu précis programme les notes en avance sur l'horloge
 * échantillon de l'AudioContext, qui elle est précise. Motif de 32 croches
 * (4 mesures) en pentatonique de do : aucune note ne peut sonner fausse.
 */

const BPM = 104;
const STEP_SECONDS = 60 / BPM / 2; // une croche
const PATTERN_STEPS = 32; // 4 mesures à 4 temps

// Fréquences des notes utilisées (tempérament égal, la4 = 440 Hz)
const N = {
  C2: 65.41, G2: 98.0, A2: 110.0,
  A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25,
} as const;

// Mélodie de marimba (null = silence) — gamme pentatonique de do
const MELODY: Array<number | null> = [
  N.C4, null, N.E4, N.G4, N.A4, null, N.G4, N.E4,
  N.D4, null, N.E4, N.D4, N.C4, null, N.A3, null,
  N.C4, null, N.E4, N.G4, N.A4, null, N.C5, N.A4,
  N.G4, null, N.E4, N.D4, N.C4, null, null, null,
];

// Basse : une note par temps (steps pairs), racine/quinte
const BASS: Array<number | null> = [
  N.C2, null, N.G2, null, N.A2, null, N.G2, null,
  N.C2, null, N.G2, null, N.A2, null, N.G2, null,
  N.C2, null, N.G2, null, N.A2, null, N.G2, null,
  N.C2, null, N.A2, null, N.G2, null, N.G2, null,
];

/** Croches ou frappe le rouler, dans chaque mesure de huit : le 3-3-2 sega. */
const ROULER = [0, 3, 6];

const MUSIC_VOLUME = 0.2;

export class MusicManager {
  private started = false;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  /** Vrai quand l'application est en arrière-plan (endormie, mais pas arrêtée). */
  private dormante = false;
  /** Vrai pendant une partie : le roulèr entre, la boucle prend son élan. */
  private enPartie = false;

  /** Démarre la boucle (idempotent — appelé à chaque entrée de scène). */
  ensureRunning(): void {
    if (this.started) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx === null) {
      return;
    }
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = isMuted() ? 0 : MUSIC_VOLUME;
    this.master.connect(ctx.destination);

    this.startOcean(ctx);

    this.startScheduler(ctx);
  }

  /**
   * Ordonnanceur : toutes les 50 ms, programme les croches des 120 ms à venir.
   *
   * C'est un setInterval, donc une horloge du NAVIGATEUR et non celle de
   * Phaser. Phaser met sa boucle en pause quand la page se cache, mais ce
   * minuteur-là ne le sait pas : c'est lui qui continuait à jouer du séga
   * téléphone verrouillé.
   */
  private startScheduler(ctx: AudioContext): void {
    this.nextStepTime = ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(() => {
      while (this.nextStepTime < ctx.currentTime + 0.12) {
        this.scheduleStep(ctx, this.step % PATTERN_STEPS, this.nextStepTime);
        this.nextStepTime += STEP_SECONDS;
        this.step += 1;
      }
    }, 50);
  }

  /**
   * Endort la musique quand l'application passe en arrière-plan.
   *
   * On ARRÊTE l'ordonnanceur, on ne se contente pas de suspendre le contexte.
   * Sans cela le minuteur continuerait de tourner contre une horloge audio
   * figée : à chaque tour il verrait `nextStepTime` en retard, programmerait
   * des croches en rafale, et le joueur recevrait toute la musique de son
   * absence d'un seul coup au retour.
   */
  suspend(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.dormante = true;
  }

  /** Rend la musique au premier plan, en repartant de l'instant présent. */
  wake(): void {
    if (!this.dormante) {
      return;
    }
    this.dormante = false;
    if (!this.started || this.schedulerId !== null) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx !== null) {
      this.startScheduler(ctx);
    }
  }

  /** Arrête l'ordonnanceur (la boucle en cours s'éteint d'elle-même). */
  stop(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.started = false;
    this.dormante = false;
  }

  /** Coupe/rétablit toute la musique (persisté via settings). */
  toggleMuted(): boolean {
    const muted = !isMuted();
    setMuted(muted);
    const ctx = getAudioContext();
    if (this.master !== null && ctx !== null) {
      // Rampe courte pour éviter le clic audio
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_VOLUME, ctx.currentTime + 0.15);
    }
    return muted;
  }

  /** Programme les instruments d'une croche donnée du motif. */
  private scheduleStep(ctx: AudioContext, patternStep: number, time: number): void {
    const melodyNote = MELODY[patternStep];
    if (melodyNote !== null) {
      this.playMarimba(ctx, melodyNote, time);
    }
    const bassNote = BASS[patternStep];
    if (bassNote !== null) {
      this.playBass(ctx, bassNote, time);
    }
    // Cabosse (shaker) : contretemps accentués, façon séga. Elle frappe plus
    // fort en partie qu'au menu.
    if (patternStep % 2 === 1) {
      const fort = patternStep % 4 === 3;
      this.playShaker(ctx, time, (fort ? 0.09 : 0.05) * (this.enPartie ? 1.5 : 1));
    }
    // LE ROULÈR N'ENTRE QU'EN PARTIE. C'est ce qui distingue le menu du match :
    // même boucle, mais elle se met en marche quand on joue. Une musique qui
    // change au lancement de la partie, c'est le signal le moins coûteux et le
    // plus efficace pour dire « ça commence ».
    //
    // Motif 3-3-2 sur chaque mesure de huit croches, la pulsation du séga :
    // elle tombe à côté des temps forts de la basse, et c'est le décalage
    // entre les deux qui donne le balancement.
    if (this.enPartie && ROULER.includes(patternStep % 8)) {
      this.playRouler(ctx, time, patternStep % 8 === 0 ? 0.5 : 0.34);
    }
  }

  /**
   * Le roulèr : le gros tambour du séga.
   *
   * Deux couches, et la première n'est pas décorative. Un tambour grave posé
   * seul à 80-190 Hz ne s'entend pas sur un téléphone — c'est le même piège
   * que la basse en sinus. La claque de peau, elle, vit entre 300 et 900 Hz :
   * c'est elle qui porte le rythme sur un petit haut-parleur, pendant que le
   * corps grave donne le poids sur une vraie enceinte.
   */
  private playRouler(ctx: AudioContext, time: number, volume: number): void {
    if (this.master === null) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.Q.value = 1.4;
    filtre.frequency.setValueAtTime(900, time);
    filtre.frequency.exponentialRampToValueAtTime(300, time + 0.09);
    const peau = ctx.createGain();
    peau.gain.setValueAtTime(volume, time);
    peau.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    src.connect(filtre).connect(peau).connect(this.master);
    src.start(time, Math.random() * 0.4);
    src.stop(time + 0.12);

    const corps = ctx.createOscillator();
    corps.type = 'sine';
    corps.frequency.setValueAtTime(190, time);
    corps.frequency.exponentialRampToValueAtTime(80, time + 0.14);
    const gc = ctx.createGain();
    gc.gain.setValueAtTime(volume * 0.7, time);
    gc.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    corps.connect(gc).connect(this.master);
    corps.start(time);
    corps.stop(time + 0.18);
  }

  /** Le roulèr entre (partie) ou se tait (menu, écran de fin). */
  setEnPartie(enPartie: boolean): void {
    this.enPartie = enPartie;
  }

  /**
   * Le marimba, avec sa partielle a l'octave.
   *
   * Ce n'est pas un artifice : une lame de marimba sonne sa fondamentale ET
   * une partielle superieure tres nette, c'est ce qui lui donne son timbre de
   * bois. La partielle ajoutee ici monte la melodie dans la bande 440-1050 Hz,
   * celle qu'un haut-parleur de telephone rend le mieux -- la justesse
   * acoustique et l'audibilite tirent dans le meme sens.
   */
  private playMarimba(ctx: AudioContext, freq: number, time: number): void {
    if (this.master === null) {
      return;
    }
    for (const [rapport, volume, duree] of [[1, 0.42, 0.3], [2, 0.16, 0.18]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * rapport;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duree);
      osc.connect(gain).connect(this.master);
      osc.start(time);
      osc.stop(time + duree + 0.02);
    }
  }

  /**
   * La basse. Elle etait un SINUS a 65-110 Hz, et c'etait le defaut central de
   * toute la musique.
   *
   * Un sinus n'a aucune harmonique : toute son energie est a sa fondamentale.
   * A 65 Hz, un haut-parleur de telephone n'en restitue tout simplement RIEN.
   * Mesure sur l'ancienne version : 95 % de l'energie de la musique tombait
   * sous 400 Hz, et 5 % seulement dans la bande 400-4000 Hz. Autrement dit, au
   * telephone, la musique existait dans le code et nulle part a l'oreille.
   *
   * Une dent de scie a la meme fondamentale porte des harmoniques a 2f, 3f,
   * 4f... Un do a 65 Hz fait donc sonner 131, 196, 262, 327 Hz. Le passe-bas a
   * 1300 Hz garde les premieres et coupe l'agressivite du reste. Sur une bonne
   * enceinte on entend la vraie note grave ; sur un telephone, l'oreille
   * reconstruit la fondamentale a partir de ses harmoniques -- c'est la
   * fondamentale manquante, et c'est exactement ce qui fait qu'une ligne de
   * basse s'entend sur un petit haut-parleur.
   */
  private playBass(ctx: AudioContext, freq: number, time: number): void {
    if (this.master === null) {
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = 1300;
    filtre.Q.value = 0.8;
    const gain = ctx.createGain();
    // Bien plus bas que les 0,55 du sinus : une dent de scie porte beaucoup
    // plus d'energie a volume egal.
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(filtre).connect(gain).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  private playShaker(ctx: AudioContext, time: number, volume: number): void {
    if (this.master === null) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(time);
    src.stop(time + 0.06);
  }

  /** Ressac continu : bruit filtré dont le volume respire lentement. */
  private startOcean(ctx: AudioContext): void {
    if (this.master === null) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Remonte de 450 a 800 Hz et bien attenue : filtre a 450 Hz, le ressac
    // occupait une part enorme de l'energie totale pour un resultat inaudible
    // ailleurs qu'au casque. Il redevient ce qu'il doit etre : une ambiance.
    filter.frequency.value = 800;
    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.1;
    // LFO très lent (~8 s) qui module l'amplitude : le va-et-vient des vagues
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.125;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.15;
    lfo.connect(lfoDepth).connect(waveGain.gain);
    src.connect(filter).connect(waveGain).connect(this.master);
    src.start();
    lfo.start();
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer === null) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }
}

/** Instance partagée : la musique continue d'une scène à l'autre. */
export const music = new MusicManager();
