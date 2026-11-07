import { getAudioContext } from '../utils/audioContext';
import { isMuted, setMuted } from '../utils/settings';
import type { GameMode } from '../utils/constants';

/** Maquette instrumentale validée, chargée une seule fois. */
const TRACK = 'assets/music/kout-sab-v2.mp3';
export type MusicMoment = 'normal' | 'cyclone' | 'piment' | 'gel';

/** Mixage seul : aucun changement des règles ou de la vitesse du jeu. */
export function musicMix(mode: GameMode, intensity: number, moment: MusicMoment, playing: boolean): number {
  if (!playing) return 0.55;
  const energy = Math.max(0, Math.min(1, intensity));
  if (moment === 'gel') return 0.62;
  if (moment === 'cyclone' || moment === 'piment') return 0.95;
  const drive = mode === 'chrono' ? 0.35 + energy * 0.65 : energy;
  return 0.68 + drive * 0.17;
}

export class MusicManager {
  private started = false;
  private dormante = false;
  private enPartie = false;
  private mode: GameMode = 'classic';
  private intensity = 0;
  private moment: MusicMoment = 'normal';
  private master: GainNode | null = null;
  private gains: GainNode[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private buffers: AudioBuffer[] | null = null;
  private raw: Promise<ArrayBuffer[]> | null = null;
  private decoding: Promise<void> | null = null;
  private lastMix = '';

  precharger(): void {
    if (this.raw || this.buffers) return;
    this.raw = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}${TRACK}`);
      if (!response.ok) throw new Error(`Musique ${response.status}`);
      return [await response.arrayBuffer()];
    })();
    // Un chargement impossible ne doit jamais bloquer le jeu.
    void this.raw.catch(() => { this.raw = null; });
  }

  ensureRunning(): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!this.started) {
      this.started = true;
      this.master = ctx.createGain();
      this.master.gain.value = isMuted() ? 0 : 0.24;
      this.master.connect(ctx.destination);
    }
    if (this.buffers) { this.launch(ctx); return; }
    if (this.decoding) return;
    this.precharger();
    const raw = this.raw;
    if (!raw) return;
    this.decoding = raw.then(data => Promise.all(data.map(bytes => ctx.decodeAudioData(bytes.slice(0)))))
      .then(buffers => { this.buffers = buffers; this.launch(ctx); })
      .catch(() => { this.raw = null; })
      .finally(() => { this.decoding = null; });
  }

  private launch(ctx: AudioContext): void {
    if (!this.started || this.dormante || !this.master || !this.buffers || this.sources.length) return;
    const start = ctx.currentTime + 0.05;
    const duration = Math.min(...this.buffers.map(buffer => buffer.duration));
    const mix = musicMix(this.mode, this.intensity, this.moment, this.enPartie);
    this.buffers.forEach((buffer) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = duration;
      gain.gain.value = mix;
      source.connect(gain).connect(this.master!);
      source.start(start);
      this.sources.push(source);
      this.gains.push(gain);
    });
    this.lastMix = '';
  }

  /** La densité monte par paliers ; les transitions sont fondues. */
  setGameplay(mode: GameMode, intensity: number, moment: MusicMoment): void {
    this.mode = mode;
    this.intensity = Math.round(Math.max(0, Math.min(1, intensity)) * 8) / 8;
    this.moment = moment;
    this.updateMix();
  }

  private updateMix(): void {
    const mix = musicMix(this.mode, this.intensity, this.moment, this.enPartie);
    const key = String(mix);
    if (key === this.lastMix) return;
    this.lastMix = key;
    const ctx = getAudioContext();
    if (!ctx) return;
    this.gains.forEach((gain) => {
      // setTargetAtTime part du gain courant, même lors d'une transition rapide.
      gain.gain.setTargetAtTime(mix, ctx.currentTime, 0.22);
    });
  }

  setEnPartie(playing: boolean): void {
    this.enPartie = playing;
    this.intensity = 0;
    this.moment = 'normal';
    this.updateMix();
  }

  suspend(): void { this.dormante = true; }
  wake(): void {
    this.dormante = false;
    if (this.started) this.ensureRunning();
  }

  stop(): void {
    this.sources.forEach(source => { source.stop(); source.disconnect(); });
    this.gains.forEach(gain => gain.disconnect());
    this.master?.disconnect();
    this.sources = [];
    this.gains = [];
    this.master = null;
    this.started = false;
    this.dormante = false;
    this.lastMix = '';
  }

  toggleMuted(): boolean {
    const muted = !isMuted();
    setMuted(muted);
    const ctx = getAudioContext();
    if (ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.24, ctx.currentTime, 0.04);
    return muted;
  }
}

export const music = new MusicManager();
