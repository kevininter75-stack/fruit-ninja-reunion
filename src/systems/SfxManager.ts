import { getAudioContext } from '../utils/audioContext';
import { isMuted } from '../utils/settings';

/**
 * Effets sonores placeholder synthétisés en Web Audio — aucun fichier requis.
 *
 * Même philosophie que les sprites procéduraux : ne jamais bloquer le
 * développement sur l'absence d'assets. Quand les vrais SFX arriveront
 * (public/assets/sfx/), cette façade sera remplacée par le chargement
 * Phaser (ou Howler) sans changer les points d'appel.
 *
 * Chaque méthode est silencieusement no-op si l'audio est indisponible
 * ou si le joueur a coupé le son (réglage persistant, voir settings.ts).
 */
export class SfxManager {
  private noiseBuffer: AudioBuffer | null = null;

  private context(): AudioContext | null {
    if (isMuted()) {
      return null;
    }
    return getAudioContext();
  }

  /** Buffer de bruit blanc partagé (base des whooshs et explosions). */
  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer === null) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  /** Oscillateur simple avec enveloppe : brique des sons "tonals". */
  private playTone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    duration: number,
    volume: number,
    delaySeconds = 0
  ): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const t = ctx.currentTime + delaySeconds;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /**
   * "Fwip" de lancement : souffle doux qui monte, joué à chaque fruit
   * qui part du bas de l'écran. C'est le signal d'anticipation — il fait
   * lever les yeux avant même que le fruit apparaisse. Hauteur légèrement
   * aléatoire pour éviter la répétition mécanique.
   */
  launch(): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    const baseHz = 260 * (0.9 + Math.random() * 0.3);
    filter.frequency.setValueAtTime(baseHz, t);
    filter.frequency.exponentialRampToValueAtTime(baseHz * 3.4, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.012, t);
    gain.gain.exponentialRampToValueAtTime(0.13, t + 0.08); // gonflement
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.28);
  }

  /** "Whoosh" de coupe : souffle de bruit filtré, balayage aigu → grave. */
  slice(): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(350, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.12);
  }

  /** Explosion de bombe : bruit grave qui s'étouffe + chute de basse. */
  explosion(): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.55);
    this.playTone('sine', 140, 35, 0.5, 0.5); // impact grave sous le souffle
  }

  /** Note de combo : monte dans les aigus avec la taille du combo. */
  combo(step: number): void {
    this.playTone('triangle', 520 + Math.min(step, 8) * 90, 660 + Math.min(step, 8) * 90, 0.12, 0.3);
  }

  /** Combava doré : petit arpège doré ascendant. */
  bonus(): void {
    this.playTone('triangle', 660, 680, 0.14, 0.3);
    this.playTone('triangle', 880, 900, 0.14, 0.3, 0.09);
    this.playTone('triangle', 1320, 1340, 0.2, 0.3, 0.18);
  }

  /** Vie perdue : blip descendant, court et discret. */
  lifeLost(): void {
    this.playTone('square', 200, 90, 0.22, 0.15);
  }

  /** Clic d'interface. */
  click(): void {
    this.playTone('sine', 650, 620, 0.05, 0.25);
  }
}

/** Instance partagée pour tout le jeu. */
export const sfx = new SfxManager();
