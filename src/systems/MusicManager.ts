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

const MUSIC_VOLUME = 0.14;

export class MusicManager {
  private started = false;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;

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

    // Ordonnanceur : toutes les 50 ms, programme les croches des 120 ms à venir
    this.nextStepTime = ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(() => {
      while (this.nextStepTime < ctx.currentTime + 0.12) {
        this.scheduleStep(ctx, this.step % PATTERN_STEPS, this.nextStepTime);
        this.nextStepTime += STEP_SECONDS;
        this.step += 1;
      }
    }, 50);
  }

  /** Arrête l'ordonnanceur (la boucle en cours s'éteint d'elle-même). */
  stop(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.started = false;
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
    // Cabosse (shaker) : contretemps accentués, façon séga
    if (patternStep % 2 === 1) {
      this.playShaker(ctx, time, patternStep % 4 === 3 ? 0.09 : 0.05);
    }
  }

  private playMarimba(ctx: AudioContext, freq: number, time: number): void {
    if (this.master === null) {
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  private playBass(ctx: AudioContext, freq: number, time: number): void {
    if (this.master === null) {
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain).connect(this.master);
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
    filter.frequency.value = 450;
    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.25;
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
