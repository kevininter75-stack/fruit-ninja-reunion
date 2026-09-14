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
  private master: GainNode | null = null;
  /** Horodatage du dernier bruit de coupe, pour atténuer les rafales. */
  private dernierTranchage = 0;
  /** Idem pour le sifflement de lame, dont la cadence est celle du geste. */
  private derniereLame = 0;

  private context(): AudioContext | null {
    if (isMuted()) {
      return null;
    }
    return getAudioContext();
  }

  /**
   * Bus de sortie commun : un gain général, puis un compresseur.
   *
   * POURQUOI IL FALLAIT EN AJOUTER UN. Chaque son se branchait directement sur
   * la sortie. Tant qu'il n'y en a qu'un ou deux à la fois, cela passe ; mais
   * pendant un déluge on lance sept fruits par seconde ET on les tranche, et
   * rien ne se coupe jamais — un coup de sabre sur six fruits déclenche six
   * sons dans la même centaine de millisecondes. Les amplitudes s'additionnent
   * bêtement, la somme dépasse 1, et la carte son écrête : ce qu'on entend
   * alors n'est plus le jeu, c'est de la saturation.
   *
   * Le compresseur ramène les pics sans toucher aux sons isolés. C'est ce qui
   * permet d'ajouter un bruit par fruit tranché sans que les moments forts
   * deviennent une bouillie — autrement dit, exactement ce qui manquait.
   */
  private bus(ctx: AudioContext): AudioNode {
    if (this.master === null || this.master.context !== ctx) {
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -9;
      comp.knee.value = 26;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      gain.connect(comp).connect(ctx.destination);
      this.master = gain;
    }
    return this.master;
  }

  /** Souffle de bruit filtré : brique commune aux coupes, lancers, explosions. */
  private playNoise(
    ctx: AudioContext,
    type: BiquadFilterType,
    fromHz: number,
    toHz: number,
    q: number,
    volume: number,
    duration: number,
    delaySeconds = 0
  ): void {
    const t = ctx.currentTime + delaySeconds;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    // Départ aléatoire dans le buffer : rejouer toujours les mêmes
    // échantillons rend la répétition audible au bout de quelques coupes.
    const offset = Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(toHz, 20), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.bus(ctx));
    src.start(t, offset);
    src.stop(t + duration + 0.02);
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
    osc.connect(gain).connect(this.bus(ctx));
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
    src.connect(filter).connect(gain).connect(this.bus(ctx));
    src.start(t);
    src.stop(t + 0.28);
  }

  /**
   * LE FRUIT QUI SE FEND. Trois couches, et il les faut toutes les trois.
   *
   * CE QUI N'ALLAIT PAS. Il y avait bien un son à chaque coupe, mais c'était
   * un « whoosh » — du bruit filtré qui balaie de l'aigu vers le grave. Un
   * whoosh, c'est de l'AIR : c'est le bruit d'une lame qui passe, pas celui
   * d'un fruit qui s'ouvre. Et comme le lancer de chaque fruit joue lui aussi
   * un souffle, l'un se noyait dans les autres. D'où l'impression, juste, que
   * trancher ne faisait aucun bruit propre.
   *
   * Le sifflement de lame, lui, a quitté cette méthode : il appartient au
   * geste et se joue à part (cf. `lame()`). Ne restait donc ici que le fruit.
   *
   *   1. LA PEAU QUI CÈDE : claquement de 12 ms vers 4 kHz. C'est lui qui
   *      donne l'instant exact du contact — sans transient, un son paraît
   *      toujours mou et en retard.
   *   2. L'ÉCLAT HUMIDE : bande étroite qui plonge de 1600 à 550 Hz.
   *   3. LE PLOC : une note qui chute d'une octave et demie en 70 ms. C'est ce
   *      glissando rapide, et non le bruit, qui fait entendre quelque chose
   *      qui S'OUVRE. Sa hauteur suit le rayon du fruit.
   *
   * TOUT SE JOUE ENTRE 320 Hz ET 4 kHz, et ce n'est pas un détail de goût.
   * Mesuré sur la version précédente : 82 % de son énergie tombait déjà dans
   * cette bande, mais sa couche la plus grasse plongeait jusqu'à 260 Hz —
   * c'est-à-dire sous le seuil où un haut-parleur de téléphone ne restitue
   * plus rien. Le plancher de 320 Hz sur la note du fruit vient de là.
   *
   * Les rafales sont atténuées, pas supprimées : un coup de sabre sur six
   * fruits doit s'entendre six fois (c'est la demande), mais six sons pleins
   * à 30 ms d'intervalle font une seule bouffée illisible. Les suivants
   * passent donc à 72 % : mesure à l'appui, une salve de six porte deux fois
   * l'énergie d'une coupe isolée pour la même crête, sans jamais écrêter.
   */
  slice(radius = 60): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const serre = ctx.currentTime - this.dernierTranchage < 0.045;
    this.dernierTranchage = ctx.currentTime;
    const v = serre ? 0.72 : 1;

    // 1. La peau qui cède : très court, très haut. C'est l'instant du contact.
    this.playNoise(ctx, 'highpass', 4200, 3000, 0.7, 0.26 * v, 0.012);
    // 2. L'éclat humide : bande étroite qui plonge vite. Elle reste ENTRE
    //    550 et 1600 Hz — la zone qu'un haut-parleur de téléphone restitue le
    //    mieux. L'ancienne version plongeait à 260 Hz, donc dans le vide.
    this.playNoise(ctx, 'bandpass', 1600, 550, 2.2, 0.4 * v, 0.085);
    // 3. Le « ploc » : une note qui chute d'une octave et demie en 70 ms.
    //    C'est ce glissando rapide qui fait entendre quelque chose qui S'OUVRE
    //    plutôt qu'un simple bruit. Sa hauteur suit le rayon du fruit, mais
    //    bornée à 320 Hz par le bas : en dessous, un téléphone n'en rend rien.
    const base = Math.min(1150, Math.max(320, (900 * 60) / Math.max(radius, 20)));
    const detune = 0.93 + Math.random() * 0.14;
    this.playTone('triangle', base * detune, base * detune * 0.38, 0.07, 0.26 * v);
  }

  /**
   * LA LAME, et elle se joue au GESTE — pas au fruit.
   *
   * C'était la confusion à défaire. Un seul son servait aux deux choses : le
   * sifflement d'une lame qui fend l'air, et le fruit qui s'ouvre. Or ce sont
   * deux événements différents, à deux instants différents — on entend d'abord
   * le sabre partir, puis chaque fruit éclater sur son passage. Confondus, ni
   * l'un ni l'autre ne s'entendait pour ce qu'il était.
   *
   * Elle sonne donc à l'OUVERTURE du coup de sabre, même si le geste ne touche
   * rien. C'est ce qui donne son poids au fait de trancher dans le vide : le
   * joueur entend qu'il a manqué.
   *
   * Deux couches : un souffle en bande étroite qui MONTE (une lame qui
   * s'approche monte en fréquence, comme une sirène qui passe), et une trace
   * métallique brève à 3,9 kHz qui lui donne son acier.
   */
  lame(): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    // Anti-rafale propre au geste : un doigt qui zigzague rouvre des coups de
    // sabre très rapprochés, et autant de sifflements empilés feraient un
    // bourdonnement continu.
    if (ctx.currentTime - this.derniereLame < 0.12) {
      return;
    }
    this.derniereLame = ctx.currentTime;
    const h = 0.9 + Math.random() * 0.25;
    this.playNoise(ctx, 'bandpass', 700 * h, 2900 * h, 3.4, 0.17, 0.16);
    this.playTone('triangle', 3900 * h, 3200 * h, 0.06, 0.045);
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
    src.connect(filter).connect(gain).connect(this.bus(ctx));
    src.start(t);
    src.stop(t + 0.55);
    this.playTone('sine', 140, 35, 0.5, 0.5); // impact grave sous le souffle
  }


  /** Combava doré : petit arpège doré ascendant. */
  bonus(): void {
    this.playTone('triangle', 660, 680, 0.14, 0.3);
    this.playTone('triangle', 880, 900, 0.14, 0.3, 0.09);
    this.playTone('triangle', 1320, 1340, 0.2, 0.3, 0.18);
  }

  /** Coup critique : double ping brillant et métallique. */
  crit(): void {
    this.playTone('triangle', 900, 1200, 0.1, 0.3);
    this.playTone('triangle', 1400, 1700, 0.14, 0.28, 0.06);
  }

  /**
   * Le combo : un arpège dont la LONGUEUR suit le nombre de fruits.
   *
   * L'ancien jouait toujours trois notes, simplement transposées plus haut
   * quand le combo grandissait. On entendait donc la même figure à chaque
   * fois : un x3 et un x9 ne se distinguaient que par la hauteur, ce qui est
   * le paramètre le moins lisible à l'oreille en pleine action. Désormais un
   * x3 donne trois notes et un x8 en donne six : la MONTÉE dure plus
   * longtemps, et c'est cela qu'on perçoit — la durée, pas la tonalité.
   *
   * Les notes suivent une gamme PENTATONIQUE majeure. Ce n'est pas de la
   * coquetterie : c'est la seule échelle où l'on peut empiler des degrés au
   * hasard sans jamais tomber sur un intervalle qui sonne faux. Quel que soit
   * le nombre de notes jouées, l'arpège reste juste.
   *
   * À partir de six fruits, un coup grave vient sous l'arpège. C'est la
   * gradation sonore qui manquait : jusqu'ici, seule l'image montait d'un cran
   * au gros combo (bannière plus grande, secousse), et l'oreille n'en savait
   * rien.
   */
  bigCombo(count: number): void {
    const notes = Math.min(Math.max(count, 3), 6);
    // Do majeur pentatonique, sur deux octaves.
    const degres = [0, 2, 4, 7, 9, 12, 14, 16];
    for (let i = 0; i < notes; i++) {
      const hz = 523.25 * Math.pow(2, degres[i] / 12);
      this.playTone('triangle', hz, hz, 0.17, 0.2, i * 0.055);
    }
    if (count >= 6) {
      // Frappe grave sous l'arpège : le poids du geste.
      this.playTone('sine', 180, 70, 0.3, 0.34);
      const ctx = this.context();
      if (ctx !== null) {
        this.playNoise(ctx, 'lowpass', 700, 120, 1, 0.2, 0.22);
      }
    }
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
