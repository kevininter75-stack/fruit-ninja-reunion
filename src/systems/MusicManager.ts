import { getAudioContext } from '../utils/audioContext';
import { isMuted, setMuted } from '../utils/settings';
import {
  MUSIQUE_DUREE,
  MUSIQUE_FICHIER,
  MUSIQUE_RETARD,
  MUSIQUE_SURPLUS,
} from '../utils/constants';

/**
 * La musique de fond : une boucle maloya, plus un ressac d'océan.
 *
 * CE QUI A REMPLACÉ QUOI. Jusqu'ici la musique était un séga synthétisé note à
 * note en Web Audio — marimba pentatonique, basse en dent de scie, cabosse,
 * roulèr — programmé par un ordonnanceur à anticipation. C'était un placeholder
 * assumé, en attendant une vraie musique. Elle est arrivée : huit mesures de
 * maloya à 121 BPM, synthétisées instrument par instrument hors du jeu, puis
 * rendues en un seul fichier.
 *
 * Rien n'y est emprunté, ni enregistrement ni mélodie : aucune question de
 * licence ne se pose, ni ici ni sur les magasins d'applications.
 *
 * POURQUOI UN FICHIER ET NON UNE SYNTHÈSE À L'EXÉCUTION, alors que tout le
 * reste de ce système est synthétisé. Parce que le rendu de la boucle prend
 * 4,6 s sur un ordinateur de bureau : un téléphone y passerait dix à quarante
 * secondes. Le fichier coûte 249 Ko, payés une fois et mis en cache par la PWA.
 *
 * CE QUE CE CHANGEMENT A SUPPRIMÉ, ET C'EST UN SOULAGEMENT. L'ancien
 * ordonnanceur était un setInterval du NAVIGATEUR programmant des notes contre
 * l'horloge de l'AudioContext. Quand l'application passait en arrière-plan,
 * l'horloge audio se figeait mais pas le minuteur : il voyait son retard
 * grandir, programmait des croches en rafale, et le joueur recevait toute la
 * musique de son absence d'un coup au retour. Il fallait donc arrêter
 * l'ordonnanceur à la mise en veille et le relancer au réveil.
 *
 * Une boucle jouée par un AudioBufferSourceNode ne connaît pas ce problème :
 * elle vit entièrement sur l'horloge audio. Suspendre le contexte la fige, le
 * reprendre la fait repartir exactement où elle en était. `suspend()` et
 * `wake()` n'ont donc plus rien à arrêter — ils ne font plus que tenir le
 * drapeau à jour.
 */

const MUSIC_VOLUME = 0.2;
/** En partie, la boucle monte d'un tiers : c'est ce qui dit que ça commence. */
const MUSIC_VOLUME_PARTIE = 0.27;

export class MusicManager {
  private started = false;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** Vrai quand l'application est en arrière-plan (endormie, mais pas arrêtée). */
  private dormante = false;
  /** Vrai pendant une partie : la boucle monte d'un tiers. */
  private enPartie = false;

  /** Le fichier brut, récupéré avant même qu'un AudioContext existe. */
  private brut: ArrayBuffer | null = null;
  private boucle: AudioBuffer | null = null;
  private decodage = false;
  private source: AudioBufferSourceNode | null = null;

  /**
   * Récupère le fichier sans attendre le premier geste du joueur.
   *
   * Même partage des rôles que pour les bruitages : le réseau ne demande aucune
   * permission, seul le décodage a besoin d'un AudioContext, lequel n'apparaît
   * qu'au premier contact. Séparer les deux fait que la musique démarre à
   * l'instant du geste au lieu d'arriver quelques centaines de millisecondes
   * plus tard.
   *
   * BASE_URL et pas un chemin absolu : le jeu est servi depuis la racine en
   * local et depuis /fruit-ninja-reunion/ sur GitHub Pages.
   */
  precharger(): void {
    if (this.brut !== null || this.boucle !== null) {
      return;
    }
    fetch(import.meta.env.BASE_URL + MUSIQUE_FICHIER)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        this.brut = buf;
        // Le contexte peut déjà exister si le joueur a touché l'écran pendant
        // le téléchargement : dans ce cas on enchaîne sans attendre une scène.
        const ctx = getAudioContext();
        if (this.started && ctx !== null) {
          this.assurerBoucle(ctx);
        }
      })
      .catch(() => {
        // Réseau absent, fichier manquant : le ressac d'océan joue seul. Le jeu
        // reste parfaitement jouable, il est simplement plus silencieux.
      });
  }

  /** Démarre la musique (idempotent — appelé à chaque entrée de scène). */
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
    this.master.gain.value = this.niveauCible();
    this.master.connect(ctx.destination);

    this.startOcean(ctx);
    this.assurerBoucle(ctx);
  }

  /** Décode le fichier, puis lance la boucle dès qu'elle est prête. */
  private assurerBoucle(ctx: AudioContext): void {
    if (this.boucle !== null) {
      this.lancerBoucle(ctx);
      return;
    }
    if (this.brut === null || this.decodage) {
      return;
    }
    this.decodage = true;
    // decodeAudioData consomme (« détache ») le tampon qu'on lui passe : sans
    // cette copie, une seconde tentative recevrait un ArrayBuffer vide.
    ctx
      .decodeAudioData(this.brut.slice(0))
      .then((buffer) => {
        this.boucle = buffer;
        this.decodage = false;
        this.lancerBoucle(ctx);
      })
      .catch(() => {
        // Format refusé par ce navigateur : on abandonne pour de bon plutôt que
        // de retenter à chaque changement de scène.
        this.decodage = false;
        this.brut = null;
      });
  }

  /**
   * Où commence et où finit vraiment la boucle dans le fichier décodé.
   *
   * Un encodeur MP3 pose un silence devant et complète la fin jusqu'à la trame
   * suivante. Boucler le fichier entier ferait donc un blanc à chaque tour :
   * les points de boucle sautent ces deux marges.
   *
   * ON LE DÉTECTE, ON NE LE SUPPOSE PAS. Certains décodeurs honorent les
   * balises d'écart du fichier et rendent déjà la durée exacte — Safari fait
   * autrement que Chrome. Retrancher un retard qui a déjà été retiré décalerait
   * la boucle et créerait précisément la couture qu'on veut éviter. La longueur
   * décodée dit laquelle des deux situations on a.
   */
  private pointsDeBoucle(buffer: AudioBuffer): { debut: number; fin: number } {
    const surplus = buffer.duration - MUSIQUE_DUREE;
    const retard = surplus > MUSIQUE_SURPLUS / 2 ? MUSIQUE_RETARD : 0;
    return { debut: retard, fin: Math.min(retard + MUSIQUE_DUREE, buffer.duration) };
  }

  private lancerBoucle(ctx: AudioContext): void {
    if (this.master === null || this.boucle === null || this.source !== null || this.dormante) {
      return;
    }
    const { debut, fin } = this.pointsDeBoucle(this.boucle);
    const src = ctx.createBufferSource();
    src.buffer = this.boucle;
    src.loop = true;
    src.loopStart = debut;
    src.loopEnd = fin;
    src.connect(this.master);
    src.start(0, debut);
    this.source = src;
  }

  private arreterSource(): void {
    if (this.source !== null) {
      try {
        this.source.stop();
      } catch {
        // Déjà arrêtée : rien à faire.
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  /**
   * Met la musique en veille quand l'application passe en arrière-plan.
   *
   * Il n'y a plus rien à arrêter : c'est la suspension du contexte audio qui
   * fige la boucle, et elle repart d'elle-même au même endroit. On ne tient
   * plus que le drapeau, pour que `wake()` sache s'il a quelque chose à faire.
   */
  suspend(): void {
    this.dormante = true;
  }

  /** Rend la musique au premier plan. */
  wake(): void {
    if (!this.dormante) {
      return;
    }
    this.dormante = false;
    if (!this.started) {
      return;
    }
    // La boucle a survécu à la veille dans l'immense majorité des cas. Si elle
    // n'avait jamais démarré — contexte absent au lancement, fichier arrivé
    // depuis — c'est ici qu'elle prend son départ.
    const ctx = getAudioContext();
    if (ctx !== null) {
      this.assurerBoucle(ctx);
    }
  }

  /** Arrête la musique. */
  stop(): void {
    this.arreterSource();
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
      this.master.gain.linearRampToValueAtTime(this.niveauCible(), ctx.currentTime + 0.15);
    }
    return muted;
  }

  /**
   * Menu ou partie.
   *
   * Le lancement d'une partie fait monter la musique d'un tiers, en une
   * demi-seconde. C'est assez court pour qu'on le rattache au geste, et assez
   * long pour que ce ne soit pas un à-coup — le signal le moins coûteux pour
   * dire « ça commence ».
   *
   * L'ancienne version changeait aussi le motif du roulèr entre les deux états.
   * Ça n'a plus lieu d'être : la boucle est un enregistrement, elle ne se
   * réarrange pas. Le niveau porte donc seul la différence, ce qui est
   * justement ce que la mesure avait montré de plus efficace — les deux motifs
   * sortaient à 3 % d'écart, c'est-à-dire inaudibles.
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
    this.master.gain.linearRampToValueAtTime(this.niveauCible(), ctx.currentTime + 0.5);
  }

  /**
   * Le niveau que la musique doit atteindre DANS L'ÉTAT COURANT.
   *
   * Une seule source de vérité, et c'est une correction. Le rétablissement du
   * son recalculait son niveau tout seul, à MUSIC_VOLUME, sans regarder si une
   * partie était en cours : couper puis remettre le son en plein match rendait
   * la boucle au volume du menu pour tout le reste de la partie. L'écart d'un
   * tiers qui dit « ça commence » disparaissait sur un aller-retour de bouton.
   *
   * Trois endroits fixent ce gain — le démarrage, le bouton, le lancement
   * d'une partie. Tant qu'ils le calculaient chacun de leur côté, il suffisait
   * d'en oublier un pour que les états se désynchronisent.
   */
  private niveauCible(): number {
    if (isMuted()) {
      return 0;
    }
    return this.enPartie ? MUSIC_VOLUME_PARTIE : MUSIC_VOLUME;
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
