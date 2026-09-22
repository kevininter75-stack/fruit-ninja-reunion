import { getAudioContext } from '../utils/audioContext';
import { isMuted } from '../utils/settings';
import {
  MECHE_VOLUME,
  MECHE_CREPITEMENT,
  TEX_TRANCHE_FICHIER,
  TRANCHE_VOLUME,
  TRANCHE_COUPS,
  TRANCHE_JUS,
  TRANCHE_JUS_VOLUME,
  TRANCHE_JUS_RETARD,
  TRANCHE_CORPS_VOLUME,
  TRANCHE_CORPS_MONTEE,
  TRANCHE_CORPS_EXTINCTION,
  TRANCHE_CORPS_BASE,
  TRANCHE_CORPS_PENTE,
  TRANCHE_CORPS_MIN,
  TRANCHE_CORPS_MAX,
  TRANCHE_JUS_EXPOSANT,
} from '../utils/constants';

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
  /**
   * Horodatage du dernier bruit de coupe, pour atténuer les rafales.
   *
   * MOINS L'INFINI, ET PAS ZÉRO. Ces horodatages se comparent à
   * `ctx.currentTime`, qui repart de zéro avec chaque contexte : initialisés à
   * 0, ils prétendent qu'un son vient d'être joué à l'instant même où l'audio
   * s'ouvre, et le tout premier coup de sabre de la session passe à la trappe.
   * Moins l'infini dit la vérité — aucun son n'a encore été joué.
   */
  private dernierTranchage = Number.NEGATIVE_INFINITY;
  /** Horodatage du dernier souffle de lame : deux gestes ne se chevauchent pas. */
  private derniereLame = Number.NEGATIVE_INFINITY;
  /** Voix continue de la mèche, créée au premier pétard puis réutilisée. */
  private mecheGain: GainNode | null = null;
  /** Le contexte auquel appartient tout ce qui est mis en cache ci-dessus. */
  private ctxCourant: AudioContext | null = null;
  /** Octets bruts de la planche de tranchage, récupérés avant tout contexte. */
  private trancheBrut: ArrayBuffer | null = null;
  /** La planche décodée, prête à être jouée par morceaux. */
  private trancheBuffer: AudioBuffer | null = null;
  /** Décodage en cours : sans ce témoin, chaque coupe en relancerait un. */
  private trancheDecodage = false;
  /** Dernier coup joué : on ne rejoue jamais le même deux fois de suite. */
  private dernierCoup = -1;

  /**
   * Le contexte audio du moment — et le seul endroit qui constate qu'il change.
   *
   * TOUT CE QU'ON GARDE EN CACHE APPARTIENT À UN CONTEXTE PRÉCIS. Les nœuds ne
   * peuvent pas se brancher sur un autre, le buffer de bruit a été fabriqué à
   * la fréquence d'échantillonnage de celui-là, et les horodatages se lisent
   * sur son horloge. Un nouveau contexte remet cette horloge à zéro : des
   * horodatages hérités de l'ancien se retrouvent alors dans le futur, et les
   * garde-fous anti-rafale — qui refusent un son « trop proche du précédent »
   * — se mettent à tout refuser, définitivement.
   *
   * `bus()` et `meche()` se défendaient chacun de leur côté en comparant
   * `.context`, le bruit et les horodatages ne se défendaient pas du tout.
   * Constater le changement UNE FOIS, ici, par où tout passe, vaut mieux que
   * de le redire à chaque appel en espérant n'en oublier aucun.
   */
  private context(): AudioContext | null {
    if (isMuted()) {
      return null;
    }
    const ctx = getAudioContext();
    if (ctx !== null && ctx !== this.ctxCourant) {
      this.ctxCourant = ctx;
      this.master = null;
      this.mecheGain = null;
      this.noiseBuffer = null;
      this.dernierTranchage = Number.NEGATIVE_INFINITY;
      this.derniereLame = Number.NEGATIVE_INFINITY;
    }
    return ctx;
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
   * geste et se joue à part (cf. `lame()`). Ne reste ici que le fruit.
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
  /**
   * Va chercher la planche de tranchage, AVANT même qu'un contexte audio existe.
   *
   * La récupération réseau ne demande aucune permission ; seul le décodage a
   * besoin d'un AudioContext, lequel n'apparaît qu'au premier geste du joueur.
   * Séparer les deux fait que le fichier est déjà en mémoire quand ce geste
   * arrive, et que la toute première coupe sonne comme les suivantes.
   *
   * BASE_URL et pas un chemin absolu : le jeu est servi depuis la racine en
   * local et depuis /fruit-ninja-reunion/ sur GitHub Pages.
   */
  precharger(): void {
    if (this.trancheBrut !== null) {
      return;
    }
    const base = import.meta.env.BASE_URL;
    fetch(base + TEX_TRANCHE_FICHIER)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        this.trancheBrut = buf;
      })
      .catch(() => {
        // Réseau absent, fichier manquant : on ne fait rien. slice() retombera
        // sur la synthèse, qui n'a besoin de rien et ne peut pas échouer.
      });
  }

  /**
   * La planche décodée, ou null tant qu'elle ne l'est pas.
   *
   * Le décodage est asynchrone et ne peut donc pas servir la coupe qui le
   * déclenche : celle-là partira en synthèse, et toutes les suivantes auront
   * le vrai son. C'est quelques dizaines de millisecondes une fois par partie.
   */
  private tranche(ctx: AudioContext): AudioBuffer | null {
    if (this.trancheBuffer !== null) {
      return this.trancheBuffer;
    }
    if (this.trancheBrut === null || this.trancheDecodage) {
      return null;
    }
    this.trancheDecodage = true;
    // decodeAudioData consomme (« détache ») le tampon qu'on lui passe : sans
    // cette copie, un second appel recevrait un ArrayBuffer de longueur zéro.
    ctx
      .decodeAudioData(this.trancheBrut.slice(0))
      .then((buffer) => {
        this.trancheBuffer = buffer;
        this.trancheDecodage = false;
      })
      .catch(() => {
        // Format refusé par ce navigateur : on abandonne la planche pour de
        // bon plutôt que de retenter à chaque fruit tranché.
        this.trancheBrut = null;
        this.trancheDecodage = false;
      });
    return null;
  }

  slice(radius = 60): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    const serre = ctx.currentTime - this.dernierTranchage < 0.045;
    this.dernierTranchage = ctx.currentTime;
    const v = serre ? 0.72 : 1;

    const planche = this.tranche(ctx);
    if (planche !== null) {
      this.trancheReelle(ctx, planche, radius, v);
      return;
    }
    this.trancheSynthetique(ctx, radius, v);
  }

  /**
   * UN VRAI COUP DE COUTEAU, pris dans la planche de huit.
   *
   * Ce que la synthèse n'atteindra jamais : le bruit d'une lame qui traverse
   * de la chair est fait de centaines de micro-ruptures de fibres, toutes
   * différentes. On peut en imiter l'enveloppe, pas la matière.
   *
   * DEUX CHOSES EMPÊCHENT LA MITRAILLETTE. D'abord on ne rejoue jamais le même
   * coup deux fois de suite : huit échantillons tirés au hasard donneraient un
   * doublon une fois sur huit, et l'oreille repère un doublon immédiatement.
   * Ensuite la vitesse de lecture porte un tremblement de ±4 %, si bien que
   * deux occurrences du même coup ne sont jamais tout à fait identiques.
   *
   * LA HAUTEUR SUIT LA TAILLE DU FRUIT, comme le faisait le « ploc » synthétique
   * — mais ici en ralentissant l'échantillon entier, ce qui est exactement ce
   * qui distingue un gros objet d'un petit : tout descend, pas seulement une
   * note. Un letchi claque, une papaye sourd.
   */
  private trancheReelle(ctx: AudioContext, planche: AudioBuffer, radius: number, v: number): void {
    let index = Math.floor(Math.random() * TRANCHE_COUPS.length);
    if (index === this.dernierCoup) {
      index = (index + 1) % TRANCHE_COUPS.length;
    }
    this.dernierCoup = index;
    const [offset, duree] = TRANCHE_COUPS[index];

    const vitesse =
      Math.min(1.3, Math.max(0.82, Math.sqrt(58 / Math.max(radius, 20)))) *
      (0.96 + Math.random() * 0.08);

    this.jouerRegion(ctx, planche, offset, duree, vitesse, TRANCHE_VOLUME * v, 0);

    // LA CHAIR, SOUS LA LAME. Le premier échantillon est un couteau — sec,
    // craquant, avec la planche derrière. Celui-ci est ce que la lame ouvre.
    // Joués ensemble, et dans cet ordre, ils font une coupe ; séparément,
    // chacun n'en fait que la moitié.
    //
    // Le choix du long ou du court suit la taille du fruit, avec une part de
    // hasard pour qu'un même letchi ne sonne pas deux fois pareil : la papaye
    // gicle plus longtemps que le letchi, mais pas systématiquement.
    const longJus = radius > 62 ? Math.random() < 0.8 : Math.random() < 0.25;
    const [jOff, jDur] = TRANCHE_JUS[longJus ? 1 : 0];
    // Le jus s'efface plus vite que la lame en rafale — treize éclatements
    // humides en une seconde font de la bouillie, treize craquements font un
    // combo — mais moins brutalement qu'au carré, qui le faisait disparaître.
    //
    // Et son retard suit la vitesse de lecture : un échantillon joué plus vite
    // atteint son pic plus tôt, donc le jus doit avancer d'autant pour rester
    // dans la décroissance de la lame et non dedans (cf. TRANCHE_JUS_RETARD).
    const retardJus = TRANCHE_JUS_RETARD / vitesse;
    this.jouerRegion(
      ctx,
      planche,
      jOff,
      jDur,
      vitesse,
      TRANCHE_JUS_VOLUME * Math.pow(v, TRANCHE_JUS_EXPOSANT),
      retardJus
    );

    // LE POIDS, SOUS LES DEUX. Voir TRANCHE_CORPS_VOLUME : la lame et la chair
    // vivent toutes deux dans l'aigu, et il manquait le choc.
    this.corpsDeChair(ctx, radius, v, retardJus);
  }

  /**
   * Le corps de la chair : le choc sourd d'un fruit qui s'ouvre.
   *
   * Du bruit dans une bande étroite qui DESCEND pendant l'extinction — c'est
   * l'effondrement. Une hauteur fixe donnerait un tambour ; ce qu'on veut,
   * c'est quelque chose qui cède.
   *
   * Le toit à 1,5 kHz n'est pas cosmétique : il garantit que ce son n'entre
   * jamais dans la bande de la lame, qu'il doit soutenir et non masquer.
   */
  private corpsDeChair(ctx: AudioContext, radius: number, v: number, retard: number): void {
    const centre = Math.min(
      TRANCHE_CORPS_MAX,
      Math.max(TRANCHE_CORPS_MIN, TRANCHE_CORPS_BASE - radius * TRANCHE_CORPS_PENTE)
    );
    const t = ctx.currentTime + retard;
    const duree = TRANCHE_CORPS_MONTEE + TRANCHE_CORPS_EXTINCTION * 3;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const bande = ctx.createBiquadFilter();
    bande.type = 'bandpass';
    bande.Q.value = 1.4;
    bande.frequency.setValueAtTime(centre * 1.35, t);
    bande.frequency.exponentialRampToValueAtTime(centre * 0.72, t + duree);
    const toit = ctx.createBiquadFilter();
    toit.type = 'lowpass';
    toit.frequency.value = 1500;
    toit.Q.value = 0.7;

    const gain = ctx.createGain();
    // Une rampe exponentielle ne part jamais de zéro : on démarre très bas.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, TRANCHE_CORPS_VOLUME * v),
      t + TRANCHE_CORPS_MONTEE
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);

    src.connect(bande).connect(toit).connect(gain).connect(this.bus(ctx));
    src.start(t, Math.random() * 0.4);
    src.stop(t + duree + 0.02);
  }

  /**
   * Joue une région de la planche : un morceau, une vitesse, un niveau.
   *
   * LES DEUX DURÉES NE SONT PAS DANS LA MÊME HORLOGE, et s'être trompé là-dessus
   * coûtait un défaut audible. Le 3e argument de start() se compte en temps de
   * TAMPON : à vitesse 0,79 il faut lui passer 0,187 et non 0,236, sinon la
   * lecture traverse le silence de garde et mord 29 ms sur le morceau suivant —
   * une seconde attaque tronquée, collée à la première. Vérifié en rendu hors
   * ligne : duration=0,2 à vitesse 0,5 sort bien 0,4 s sans jamais déborder.
   * stop(), lui, se compte en temps de SORTIE : là, diviser est correct.
   */
  private jouerRegion(
    ctx: AudioContext,
    planche: AudioBuffer,
    offset: number,
    duree: number,
    vitesse: number,
    volume: number,
    retard: number
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = planche;
    src.playbackRate.value = vitesse;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.bus(ctx));
    const t = ctx.currentTime + retard;
    src.start(t, offset, duree);
    src.stop(t + duree / vitesse + 0.02);
  }

  /**
   * Le tranchage de repli, entièrement synthétisé.
   *
   * Il sert tant que la planche n'est pas décodée, et pour toujours si elle ne
   * peut pas l'être — fichier absent, réseau coupé au premier lancement,
   * format refusé. Un jeu qui perd son bruitage doit devenir moins bon, pas
   * muet.
   */
  private trancheSynthetique(ctx: AudioContext, radius: number, v: number): void {
    void ctx;
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
   * LA LAME : UN BÂTON QUI FEND L'AIR, une fois par coup de sabre.
   *
   * TROIS VERSIONS, ET CHACUNE CORRIGEAIT LA PRÉCÉDENTE — la troisième vaut
   * d'être expliquée, parce qu'elle revient en partie sur la deuxième.
   *
   *   1. UN COUP SEC à l'ouverture du geste. Trop court : un objet qui fend
   *      l'air siffle pendant tout son passage, pas seulement au départ.
   *   2. UNE VOIX CONTINUE pilotée par la vitesse du doigt. Elle réglait la
   *      durée, mais en créait une pire : un joueur qui tranche sans arrêt
   *      maintenait le souffle en permanence, et du bruit filtré qui ne
   *      s'arrête jamais, c'est très exactement le son d'une radio mal réglée.
   *      C'est le mot qu'a employé Kevin, et c'est le bon.
   *   3. CELLE-CI : une ENVELOPPE par coup de sabre. Forte à l'attaque puis
   *      décroissante, et bornée à un peu plus d'un demi-tiers de seconde.
   *
   * Ce qui manquait aux deux premières était la même chose : un souffle doit
   * avoir un DÉBUT et une FIN. La deuxième avait un début et pas de fin, la
   * première n'avait ni l'un ni l'autre. Une enveloppe, c'est les deux.
   *
   * Le balayage en cloche (620 Hz → jusqu'à 1,9 kHz → 420 Hz) fait le reste :
   * le bâton s'approche, passe, s'éloigne. Une fréquence TENUE est justement
   * ce qui fait entendre une porteuse ; une fréquence qui se déplace fait
   * entendre un objet. Le passe-bas à 2,2 kHz enlève la sifflante — c'est lui
   * qui fait le bois plutôt que l'acier.
   *
   * La vitesse du geste ne pilote plus le son en continu : elle en règle le
   * volume et la durée AU DÉCLENCHEMENT. Un geste vif souffle plus fort et
   * plus longtemps, mais il souffle une fois.
   */
  lame(rapidite: number): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    // Deux coups de sabre ne peuvent pas se chevaucher. Sans ce plancher, un
    // doigt qui zigzague rouvre des gestes très rapprochés et les souffles
    // s'empilent — on retombe sur le mur de bruit qu'on cherche à éviter.
    if (ctx.currentTime - this.derniereLame < 0.18) {
      return;
    }
    this.derniereLame = ctx.currentTime;

    const v = Math.min(Math.max(rapidite, 0), 1);
    const t = ctx.currentTime;
    // Un geste dure quelques dixièmes de seconde ; le souffle ne doit pas lui
    // survivre. Entre 0,34 et 0,56 s selon la vitesse, jamais au-delà.
    const duree = 0.34 + v * 0.22;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    src.loop = true; // le buffer fait 0,5 s, le souffle peut aller plus loin

    const bande = ctx.createBiquadFilter();
    bande.type = 'bandpass';
    bande.Q.value = 1.1; // large : un souffle, pas une note
    // Le bâton s'approche puis s'éloigne : la fréquence monte, puis retombe.
    // C'est ce dessin en cloche qui fait entendre quelque chose qui PASSE ;
    // une fréquence tenue, c'est une porteuse de radio.
    bande.frequency.setValueAtTime(620, t);
    bande.frequency.exponentialRampToValueAtTime(1450 + v * 480, t + duree * 0.3);
    bande.frequency.exponentialRampToValueAtTime(420, t + duree);

    const bois = ctx.createBiquadFilter();
    bois.type = 'lowpass';
    bois.frequency.value = 2200; // c'est lui qui enlève l'acier

    const gain = ctx.createGain();
    // Calé par la mesure, pas à l'estime : à ce réglage le souffle sort à
    // 0,075 de crête au plus vif, contre 0,28 pour un fruit qui éclate. Il
    // s'entend donc nettement, mais reste au quart du bruit de coupe — c'est
    // la coupe qui doit tenir le premier plan, pas le geste qui la porte.
    const crete = 0.09 + v * 0.15;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(crete, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);

    src.connect(bande).connect(bois).connect(gain).connect(this.bus(ctx));
    src.start(t, Math.random() * 0.4);
    src.stop(t + duree + 0.02);
  }

  /**
   * LA MÈCHE QUI SE CONSUME, tant qu'un pétard est en vol.
   *
   * C'est la seule information sonore du jeu qui ne dépend pas de l'endroit
   * où l'on regarde. Sur un écran où sept fruits volent en même temps, le
   * pétard pouvait entrer sans qu'on le voie ; maintenant il s'annonce.
   *
   * DEUX COUCHES, et la seconde fait tout le travail. Un souffle filtré tenu
   * n'est pas une mèche : c'est une radio mal réglée — la leçon de la lame,
   * et elle vaut ici aussi. Ce qui fait entendre une mèche, ce sont les
   * CRÉPITEMENTS : de minuscules claquements irréguliers. Le souffle ne fait
   * que les porter, et il reste très bas pour cette raison.
   *
   * Le volume suit le NOMBRE de pétards, mais pas proportionnellement : deux
   * pétards ne doivent pas faire deux fois plus de bruit, seulement un peu
   * plus. La racine carrée donne cette progression-là.
   *
   * ELLE S'ÉTEINT TOUTE SEULE, comme le souffle de lame : chaque appel
   * reprogramme une extinction 250 ms plus loin. Le pétard sort de l'écran,
   * la partie s'arrête, le joueur met en pause — la mèche se tait sans que
   * personne ait à y penser. Une boucle sonore qu'on oublierait d'arrêter
   * tournerait pour toujours ; ce risque-là n'existe pas.
   */
  meche(nombre: number): void {
    const ctx = this.context();
    if (ctx === null) {
      return;
    }
    // `> 0` et non `<= 0` : la première forme rejette aussi NaN, la seconde le
    // laisse passer. Un NaN arrivant jusqu'à setTargetAtTime fait lever une
    // exception au moteur audio — et comme cet appel a lieu à chaque image,
    // c'est toute la boucle de jeu qui s'arrêterait.
    if (!(nombre > 0)) {
      return; // l'extinction déjà programmée fait le reste
    }
    if (this.mecheGain === null || this.mecheGain.context !== ctx) {
      const source = ctx.createBufferSource();
      source.buffer = this.getNoise(ctx);
      source.loop = true;
      const bande = ctx.createBiquadFilter();
      bande.type = 'bandpass';
      bande.Q.value = 0.9;
      bande.frequency.value = 2600; // aigu et fin : ça brûle, ça ne gronde pas
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(bande).connect(gain).connect(this.bus(ctx));
      source.start();
      this.mecheGain = gain;
    }
    const t = ctx.currentTime;
    const cible = MECHE_VOLUME * Math.sqrt(Math.min(nombre, 4));
    const g = this.mecheGain.gain;
    const courant = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(courant, t);
    g.setTargetAtTime(cible, t, 0.06);
    g.setTargetAtTime(0, t + 0.25, 0.08);

    // Les crépitements : c'est eux qu'on reconnaît, pas le souffle.
    if (Math.random() < MECHE_CREPITEMENT * nombre) {
      const h = 2600 + Math.random() * 3200;
      this.playNoise(ctx, 'bandpass', h, h * 0.7, 7, 0.05 + Math.random() * 0.05, 0.02);
    }
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
