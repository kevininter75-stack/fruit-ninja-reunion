/**
 * Effets sonores placeholder synthétisés en Web Audio — aucun fichier requis.
 *
 * Même philosophie que les sprites procéduraux : ne jamais bloquer le
 * développement sur l'absence d'assets. Quand les vrais SFX arriveront
 * (public/assets/sfx/), cette façade sera remplacée par le chargement
 * Phaser (ou Howler) sans changer les points d'appel.
 *
 * Chaque méthode est silencieusement no-op si l'audio est indisponible
 * (contexte bloqué, environnement de test, etc.). Le contexte est créé
 * paresseusement et repris au premier geste utilisateur (politique
 * d'autoplay des navigateurs).
 */
export class SfxManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext | null {
    if (this.ctx === null) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null; // Web Audio indisponible : le jeu reste muet mais fonctionnel
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
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
    volume: number
  ): void {
    const ctx = this.ensureContext();
    if (ctx === null) {
      return;
    }
    const t = ctx.currentTime;
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

  /** "Whoosh" de coupe : souffle de bruit filtré, balayage aigu → grave. */
  slice(): void {
    const ctx = this.ensureContext();
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
    const ctx = this.ensureContext();
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

  /** Vie perdue : blip descendant, court et discret. */
  lifeLost(): void {
    this.playTone('square', 200, 90, 0.22, 0.15);
  }

  /** Clic d'interface. */
  click(): void {
    this.playTone('sine', 650, 620, 0.05, 0.25);
  }
}

/**
 * Instance partagée : un seul AudioContext pour tout le jeu
 * (les navigateurs limitent leur nombre par page).
 */
export const sfx = new SfxManager();
