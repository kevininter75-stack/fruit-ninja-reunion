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

/**
 * Ou frappe le rouler, dans chaque mesure de huit croches.
 *
 * 3-3-2 : c'est la pulsation du sega et du maloya, celle qui donne le
 * balancement parce qu'elle tombe a cote des temps forts de la basse.
 *
 * Le MENU en garde les deux premieres frappes seulement, et plus doucement :
 * assez pour qu'on entende un morceau et pas une nappe, pas assez pour
 * presser le joueur avant qu'il n'ait choisi son mode. C'est la meme boucle
 * qui prend son elan au lancement de la partie -- le signal le moins couteux
 * pour dire << ca commence >>.
 */
const ROULER_PARTIE = [0, 3, 6];
const ROULER_MENU = [0, 3];

const MUSIC_VOLUME = 0.2;
/** En partie, la boucle monte d'un tiers : c'est ce qui dit que ca commence. */
const MUSIC_VOLUME_PARTIE = 0.27;

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
      this.playShaker(ctx, time, (fort ? 0.09 : 0.05) * (this.enPartie ? 1.6 : 0.8));
    }
    // LE ROULÈR N'ENTRE QU'EN PARTIE. C'est ce qui distingue le menu du match :
    // même boucle, mais elle se met en marche quand on joue. Une musique qui
    // change au lancement de la partie, c'est le signal le moins coûteux et le
    // plus efficace pour dire « ça commence ».
    //
    // Motif 3-3-2 sur chaque mesure de huit croches, la pulsation du séga :
    // elle tombe à côté des temps forts de la basse, et c'est le décalage
    // entre les deux qui donne le balancement.
    const dansLaMesure = patternStep % 8;
    const motif = this.enPartie ? ROULER_PARTIE : ROULER_MENU;
    if (motif.includes(dansLaMesure)) {
      const fort = dansLaMesure === 0;
      const ampleur = this.enPartie ? 1.1 : 0.55;
      this.playRouler(ctx, time, (fort ? 0.5 : 0.34) * ampleur);
    }
  }

  /**
   * Le roulèr : le gros tambour du séga et du maloya.
   *
   * LA PREMIÈRE VERSION NE SONNAIT PAS COMME UN TAMBOUR, et pour une raison
   * précise : elle était faite de 100 ms de bruit filtré. Du bruit qui dure,
   * c'est un « chhh » — un balai, un souffle, tout sauf une peau frappée. Une
   * frappe est un événement très court suivi d'une RÉSONANCE qui chante.
   *
   * Ce qui fait entendre un tambour, c'est l'ENVELOPPE DE HAUTEUR. Quand une
   * peau est frappée, sa tension s'effondre dans les premières millisecondes :
   * la note part haut et tombe aussitôt. Ici, 430 Hz → 95 Hz en 80 ms. C'est ce
   * plongeon, et lui seul, qui distingue un tambour d'un simple bourdon grave.
   * L'ancienne version ne descendait que de 190 à 80 Hz en 140 ms : trop peu,
   * et trop lentement.
   *
   * Trois couches, toutes brèves :
   *   1. LA MAIN sur la peau : 10 ms de bruit aigu, l'instant du contact ;
   *   2. LA PEAU : 35 ms autour de 600 Hz — et non 100 ms, c'était là le défaut ;
   *   3. LA MEMBRANE : le plongeon 430 → 95 Hz, qui résonne 300 ms.
   *
   * La couche 2 n'est pas décorative : un tambour qui ne vivrait qu'à 95 Hz
   * serait muet sur un téléphone, exactement comme l'était la basse en sinus.
   * C'est elle, entre 350 et 700 Hz, qui porte le rythme sur un petit
   * haut-parleur, pendant que la membrane donne le poids sur une enceinte.
   * D'où leur dosage : la peau a été montée et la membrane retenue, parce que
   * le grave du tambour mangeait la part du mixage qu'un téléphone restitue.
   *
   * La hauteur varie légèrement d'une frappe à l'autre : une peau tendue à la
   * main ne rend jamais deux fois exactement la même note, et sans cette
   * variation le motif devient une boîte à rythmes.
   */
  private playRouler(ctx: AudioContext, time: number, volume: number): void {
    if (this.master === null) {
      return;
    }
    const tension = 0.94 + Math.random() * 0.12;

    // 1. La main sur la peau.
    const main = ctx.createBufferSource();
    main.buffer = this.getNoise(ctx);
    const aigu = ctx.createBiquadFilter();
    aigu.type = 'highpass';
    aigu.frequency.value = 1800;
    const gMain = ctx.createGain();
    gMain.gain.setValueAtTime(volume * 0.3, time);
    gMain.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
    main.connect(aigu).connect(gMain).connect(this.master);
    main.start(time, Math.random() * 0.4);
    main.stop(time + 0.03);

    // 2. La peau : court, et c'est tout l'intérêt.
    const peau = ctx.createBufferSource();
    peau.buffer = this.getNoise(ctx);
    const bande = ctx.createBiquadFilter();
    bande.type = 'bandpass';
    bande.Q.value = 1.8;
    bande.frequency.setValueAtTime(700 * tension, time);
    bande.frequency.exponentialRampToValueAtTime(340 * tension, time + 0.035);
    const gPeau = ctx.createGain();
    gPeau.gain.setValueAtTime(volume * 0.55, time);
    gPeau.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    peau.connect(bande).connect(gPeau).connect(this.master);
    peau.start(time, Math.random() * 0.4);
    peau.stop(time + 0.05);

    // 3. La membrane : le plongeon de hauteur, puis la résonance.
    const membrane = ctx.createOscillator();
    membrane.type = 'sine';
    membrane.frequency.setValueAtTime(430 * tension, time);
    membrane.frequency.exponentialRampToValueAtTime(95 * tension, time + 0.08);
    const gMembrane = ctx.createGain();
    gMembrane.gain.setValueAtTime(volume * 0.78, time);
    gMembrane.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    membrane.connect(gMembrane).connect(this.master);
    membrane.start(time);
    membrane.stop(time + 0.32);
  }

  /**
   * Menu ou partie. Deux choses changent, et il faut les deux.
   *
   * Le motif du roulèr d'abord : deux frappes par mesure au menu, trois en
   * partie. Le NIVEAU ensuite — et c'est lui qui manquait. Mesuré, la boucle
   * du menu et celle du jeu sortaient à 0,0147 et 0,0152 de moyenne : 3 %
   * d'écart, c'est-à-dire rien. On changeait le motif sans que personne ne
   * puisse l'entendre.
   *
   * Le lancement d'une partie fait donc aussi monter la musique d'un tiers,
   * en une demi-seconde. C'est court assez pour qu'on le rattache au geste, et
   * assez long pour que ce ne soit pas un à-coup.
   */
  setEnPartie(enPartie: boolean): void {
    this.enPartie = enPartie;
    if (this.master === null || isMuted()) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx === null) {
      return;
    }
    this.master.gain.linearRampToValueAtTime(
      enPartie ? MUSIC_VOLUME_PARTIE : MUSIC_VOLUME,
      ctx.currentTime + 0.5
    );
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
