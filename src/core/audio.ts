/**
 * MOTEUR SON DU JEU (Web Audio) — V2 « matière » (10 nov. 2026). Muet tant que `enable()` n'a pas été appelé (le
 * navigateur exige un geste) : dans le jeu, le shell l'appelle au premier toucher sauf si le joueur a coupé le son
 * (bouton 🔈, `bebou.sound` = '0') ; coupé, le contexte audio est suspendu.
 *
 * DIRECTION : satisfaisant, proche, FEUTRÉ (« ASMR »). Des matières (carton, feutre, bois, alu froissé), pas des bips.
 *
 * COMMENT ÇA MARCHE
 *  - Les sons courants (toc, tic, pop, pose de carte, impacts, notes, carillons, pièces, alu, papier, air) sont
 *    FABRIQUÉS une fois au démarrage dans un Worker (sound/bank.ts : synthèse modale + grains, 0 fichier, 0 réseau),
 *    puis simplement relus : 2 nœuds audio par son (au lieu de 4 à 18), aucune synthèse pendant le jeu.
 *    Tant qu'un son n'est pas cuit, sa version synthétisée d'origine joue à sa place (méthodes `…Synth`).
 *  - Les sons longs ou rares (montées, chœur, scènes 6★ via `rig()`) restent synthétisés en direct, adoucis par le
 *    même filtre de sortie.
 *  - SON ↔ MOUVEMENT : un souffle suit la VITESSE de la courbe d'animation (`whoosh(…, ease)` / `sweep`), et un
 *    impact se programme en avance sur l'horloge audio (`ahead`) pour sortir du haut-parleur pile sur l'image,
 *    latence de sortie compensée.
 *  - INTERFACE : `bindUi()` donne un « toc » feutré à tout ce qui se touche, placé en stéréo sous le doigt ;
 *    `ui('press' | 'nav' | 'on' | …)` pour les intentions.
 *
 * CHARTE (réf. « Le son de Bebou Card », 4 nov. 2026 — toujours valable) :
 *  - une seule gamme pour tout ce qui est musical : SOL MAJEUR PENTATONIQUE (sound/scale.ts) ; seule la 6★ module
 *    (la majeur, +2 demi-tons) ; la secrète a son motif lydien, jamais entendu ailleurs ;
 *  - BUS : ui · feedback · reward · event · ambience → FEUTRE (plateau −4,5 dB au-dessus de 4,2 kHz) → master →
 *    compresseur doux → LIMITEUR (−3 dBFS, 20:1) → sortie. Un événement (6★, secrète) baisse les autres bus ;
 *    `duck()` fait le vrai silence (queue de réverbe coupée aussi) ;
 *  - VARIATION anti-habituation : 3 à 6 variantes cuites par bruit, jamais deux fois la même, ±2,5 % de vitesse,
 *    ±1 dB ; sons tonals : jamais désaccordés, vélocité ±2 dB ;
 *  - TÉLÉPHONE : l'énergie des sons feutrés reste entre 400 Hz et 3 kHz (ce qu'un petit haut-parleur restitue) ;
 *    les impacts gardent une couche saturée 150–700 Hz (la « fondamentale manquante ») ;
 *  - plafond de voix (24) et débit limité des tics (35 ms) ; premier son de la session à −6 dB, remonte en 30 s.
 *
 * Batterie : le contexte audio (réverbe + compresseurs tournent en continu, même sans son) est mis en veille après
 * quelques secondes de silence et dès que l'onglet est caché ; il se réveille dès que le doigt touche l'écran
 * (avant même le son), donc sans retard audible.
 */
import { bakeBank } from './sound/bake';
import type { BookName } from './sound/books';
import { CHIME_BASES, COIN_HZ, NOTE_BASES } from './sound/ids';
import type { Clip } from './sound/dsp';
import { type Ease, velocityCurve } from './sound/motion';
import { quantize, scaleHz } from './sound/scale';
export { quantize, scaleHz };
/** Silence avant la mise en veille : plus long que le plus long son (chœur 5,2 s) + la queue de réverbe. */
const IDLE_MS = 9000;
/** ±pct de variation multiplicative (anti-habituation) */
const vary = (pct: number) => 1 + (Math.random() * 2 - 1) * pct;
/** ±dB de variation de vélocité */
const varyDb = (db: number) => Math.pow(10, ((Math.random() * 2 - 1) * db) / 20);

export type Bus = 'ui' | 'feedback' | 'reward' | 'event' | 'ambience';
export type UiKind = 'tap' | 'press' | 'nav' | 'back' | 'on' | 'off' | 'pop' | 'hover' | 'open' | 'close' | 'ok' | 'err';
export interface PlayO {
  /** volume (1 = le son cuit tel quel, crête −6 dBFS) */
  vol?: number;
  /** vitesse de lecture (hauteur) */
  rate?: number;
  /** position stéréo −1 (gauche) .. 1 (droite) */
  pan?: number;
  /** décalage de départ (s) */
  at?: number;
  /** durée max (s) : coupe douce */
  dur?: number;
  /** point de départ dans le son (s) — textures */
  offset?: number;
  /** fondu d'entrée (s) */
  fadeIn?: number;
  bus?: Bus;
  /** envoi vers la réverbe du jeu (0 = sec) */
  wet?: number;
  /** faux : ni variation de vitesse ni de volume (sons tonals) */
  vary?: boolean;
  /** (11/11) texture en boucle : rejouée tant que `dur` n'est pas écoulé */
  loop?: boolean;
}
/** (11/11) lit de texture filtré (le « hiss » des scènes 6★, version matière) */
export interface BedO {
  vol?: number;
  type?: BiquadFilterType;
  /** fréquence du filtre, et vers où elle glisse (exponentiel) */
  f?: number;
  f2?: number;
  q?: number;
  at?: number;
  /** attaque (s) ; tenue avant la chute (0..1 de la durée) */
  a?: number;
  hold?: number;
  wet?: number;
  bus?: Bus;
}
export interface SweepO {
  vol?: number;
  /** courbe de l'animation accompagnée : le souffle suit sa vitesse */
  ease?: Ease;
  /** la couleur monte (vrai, défaut) ou descend */
  up?: boolean;
  tex?: 'paper' | 'air';
  /** position stéréo, ou trajet [départ, arrivée] */
  pan?: number | [number, number];
  at?: number;
  /** bornes du filtre (Hz) */
  lo?: number;
  hi?: number;
  /** (11/11) bus de sortie (défaut feedback ; les scènes 6★ jouent sur « event ») */
  bus?: Bus;
}

/**
 * NIVEAUX des sons cuits (tous à −6 dBFS de crête) : étalonnés par mesure (sonie pondérée A, tools/ du chantier son V2)
 * pour qu'un appel `tick(1, 0.25)`, `thump(0.6)`, `chime(2, 0.22)`… garde la place qu'il avait dans le mix.
 */
const LV = { ui: 0.16, tick: 0.85, air: 1.25, paper: 2.2, foil: 3.2, land: 1.2, thud: 1.5, boom: 1.1, chimeS: 6.5, chimeM: 5.6, chimeL: 6.2, note: 1.9, coin: 2, crack: 3.5 };

/**
 * (11/11) COULEUR SONORE PAR PACK : le même geste, une matière un peu différente selon le booster — alu plus vif et
 * souffle plus clair pour Gaming, plus mat pour Sport, plus chaud pour le World Pack. Deux nombres, aucun nœud en plus :
 * vitesse de lecture de l'alu (déchirure) et bande du souffle (`sweep`).
 */
const PACK_COLOR: Record<string, { foil: number; band: number }> = {
  gaming: { foil: 1.07, band: 1.15 },
  pop: { foil: 1.02, band: 1.05 },
  sport: { foil: 0.95, band: 0.9 },
  monde: { foil: 0.9, band: 0.82 },
  bebou: { foil: 1, band: 1 },
};

export class Sfx {
  enabled = false;
  /** volume général 0..1 (curseur de l'en-tête) ; 0,7 = le niveau d'origine */
  volume = 1;
  /** transposition (demi-tons) appliquée aux sons de la gamme : +2 pendant la 6★ (modulation en la majeur) */
  transpose = 0;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private verbSend: GainNode | null = null;
  private verbReturn: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private shaper: WaveShaperNode | null = null;
  /** vrai quand c'est NOUS qui avons suspendu le contexte (silence, onglet caché) : le son suivant le réveille */
  private napping = false;
  private idleT = 0;
  /** voix en cours (plafond) et dernier tic (débit limité) */
  private voices = 0;
  private lastTick = 0;
  /** (V2) sons cuits : id → variantes ; dernière variante jouée (jamais deux fois la même) */
  private bank = new Map<string, AudioBuffer[]>();
  private lastVar = new Map<string, number>();
  /** (V2) avance de programmation en cours (s), voir `ahead` */
  private lead = 0;

  /** `bake: false` : pas de cuisson automatique (outils, tests) — les sons arrivent par `addSound`. */
  constructor(opts: { bake?: boolean } = {}) {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      this.padSync();
      if (document.hidden) this.nap();
    });
    // (V2) le doigt touche l'écran : on réveille le contexte TOUT DE SUITE — le son du tap (≥ 50 ms plus tard) sort sans retard
    document.addEventListener('pointerdown', () => this.prewake(), { capture: true, passive: true });
    // (V2) cuisson de la banque au calme, hors du fil principal ; n'attend pas l'activation du son
    if (opts.bake !== false) {
      const go = () => bakeBank((id, clips) => this.addSound(id, clips));
      if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback(cb: () => void, o?: { timeout: number }): number }).requestIdleCallback(go, { timeout: 1500 });
      else setTimeout(go, 400);
    }
  }

  /** Réveil anticipé (toucher) : si c'est nous qui dormions, on repart ; sans son dans les 3 s, on se rendort. */
  private prewake() {
    if (!this.enabled || !this.ctx || !this.napping || this.ctx.state === 'closed') return;
    this.napping = false;
    this.waking = this.ctx.resume().finally(() => (this.waking = null));
    clearTimeout(this.idleT);
    this.idleT = window.setTimeout(() => this.nap(), 3000);
  }

  /** Met le contexte en veille (s'il tourne). */
  private nap() {
    clearTimeout(this.idleT);
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.napping = true;
    void this.ctx.suspend();
  }

  /**
   * Avant chaque son : réarme la veille et réveille le contexte si c'est nous qui l'avions mis en veille. Vrai si le
   * contexte tourne (ou repart à l'instant : le son, programmé maintenant, sort à la reprise, quelques ms plus tard).
   * Un contexte suspendu pour une autre raison (lecture auto refusée, appel téléphonique) reste muet, comme avant.
   */
  private wake(): boolean {
    if (!this.ctx) return false;
    clearTimeout(this.idleT);
    this.idleT = window.setTimeout(() => this.nap(), IDLE_MS);
    if (this.ctx.state === 'running') return true;
    if (this.napping && this.ctx.state !== 'closed') {
      this.napping = false;
      this.waking = this.ctx.resume().finally(() => (this.waking = null));
      return true;
    }
    return !!this.waking;
  }
  private waking: Promise<void> | null = null;

  async enable(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      // compresseur doux puis LIMITEUR (crêtes bloquées : jamais de sursaut, true peak ≈ −1 dB)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.08;
      const master = ctx.createGain();
      master.gain.value = 0.7 * this.volume * 0.5; // premier son à −6 dB (voir softStart)
      master.connect(comp).connect(lim).connect(ctx.destination);
      const buses = {} as Record<Bus, GainNode>;
      // (V2) FEUTRE : plateau −4,5 dB au-dessus de 4,2 kHz sur tous les sons (pas la musique) — rien ne pique
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 4200;
      tone.gain.value = -4.5;
      tone.connect(master);
      for (const b of ['ui', 'feedback', 'reward', 'event', 'ambience'] as Bus[]) {
        const g = ctx.createGain();
        g.connect(tone);
        buses[b] = g;
      }
      const verb = ctx.createConvolver();
      // (V2) réponse impulsionnelle courte et SOMBRE (1,2 s ; téléphone : tronquée à 1 s) : les aigus s'éteignent
      // d'abord, comme dans une pièce meublée — et une convolution plus courte coûte moins cher
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      verb.buffer = this.impulse(ctx, 1.2, 2.6, touch ? 1 : 1.2);
      const send = ctx.createGain();
      send.gain.value = 0.28;
      const ret = ctx.createGain();
      send.connect(verb).connect(ret).connect(tone);
      // saturation douce (couche harmonique des impacts, pour le haut-parleur du téléphone)
      const sh = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 511.5) - 1;
        curve[i] = Math.tanh(x * 3.2);
      }
      sh.curve = curve;
      sh.oversample = '2x';
      const len = ctx.sampleRate * 2;
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.buses = buses;
      this.verbSend = send;
      this.verbReturn = ret;
      this.shaper = sh;
      this.noiseBuf = nb;
      // premier son de la session à −6 dB, qui remonte sur ~30 s (pas de sursaut)
      master.gain.setTargetAtTime(0.7 * this.volume, ctx.currentTime + 0.5, 10);
    }
    this.napping = false;
    // (Firefox Android, 4 nov.) resume() appelé SYNCHRONEMENT dans le geste, puis on n'attend pas indéfiniment : hors
    // « activation » valable, Firefox laisse la promesse en suspens — avant, `enabled` ne passait jamais à vrai et le jeu
    // restait muet pour toute la session. Le contexte reste suspendu jusqu'au prochain geste (voir unlock / wake).
    const resumed = this.ctx.resume().catch(() => {});
    this.enabled = true;
    await Promise.race([resumed, new Promise((r) => setTimeout(r, 300))]);
    if (this.ctx.state === 'running') this.wake(); // veille armée dès l'activation (aucun son → suspendu au bout de 9 s)
    this.padSync();
  }

  /** Vrai si le son est voulu mais que le navigateur n'a pas encore laissé démarrer le contexte audio. */
  get blocked(): boolean {
    return this.enabled && !!this.ctx && this.ctx.state !== 'running' && !this.napping;
  }

  /** À appeler dans un geste (toucher, clic, touche) : relance un contexte que le navigateur avait bloqué. */
  unblock() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.napping) void this.ctx.resume().catch(() => {});
  }

  disable() {
    this.stopMusic(0.05);
    this.enabled = false;
    this.padSync();
    this.napping = false;
    clearTimeout(this.idleT);
    void this.ctx?.suspend();
  }

  /** latence de sortie estimée (s) : l'image peut s'y caler si elle dépasse 40 ms */
  latency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? (c.baseLatency || 0) + (c.outputLatency || 0) : 0;
  }

  /**
   * SILENCE avant l'impact (6★, secrète — réf. son §1.5 / Huron) : TOUT tombe à presque rien, queue de réverbe comprise
   * (fondu de 25 ms, sans clic), puis revient en `dur` s. Réservé aux sommets : c'est le contraste qui fait la surprise.
   */
  duck(dur = 0.3) {
    if (!this.master || !this.verbReturn || !this.ctx || !this.wake()) return;
    const t = this.now();
    for (const g of [this.master.gain, this.verbReturn.gain]) {
      const full = g === this.master.gain ? 0.7 * this.volume : 1;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(full * 0.02, t + 0.025);
      g.setValueAtTime(full * 0.02, t + Math.max(0.1, dur - 0.03));
      g.linearRampToValueAtTime(full, t + dur);
    }
  }

  /**
   * DUCKING d'événement (6★, secrète, victoire) : les bus ambiance (−10 dB), ui et feedback (−6 dB) s'effacent pendant
   * `dur` s (attaque 50 ms, relâche 600 ms) pour laisser la place, sans pousser le limiteur.
   */
  event(dur = 3) {
    if (!this.buses || !this.ctx || !this.wake()) return;
    const t = this.now();
    const set = (g: GainNode, to: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(to, t + 0.05);
      g.gain.setValueAtTime(to, t + dur);
      g.gain.linearRampToValueAtTime(1, t + dur + 0.6);
    };
    set(this.buses.ambience, 0.32);
    set(this.buses.ui, 0.5);
    set(this.buses.feedback, 0.5);
  }

  // ─────────────────────────────────────────── musique (fichier) : bus à part, en boucle
  private music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicBufs = new Map<string, Promise<AudioBuffer | null>>();
  /** charge et décode une musique (mise en cache) ; null si indisponible (pas de son, réseau, format) */
  loadMusic(url: string): Promise<AudioBuffer | null> {
    let p = this.musicBufs.get(url);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const data = await r.arrayBuffer();
          // décodage possible avant l'activation du son : contexte hors ligne si le vrai n'existe pas encore
          const c: BaseAudioContext = this.ctx ?? new OfflineAudioContext(1, 1, 44100);
          return await c.decodeAudioData(data);
        } catch {
          // (audit 12/11, S16 / A2-08) raté passager (réseau coupé) : pas gardé, nouvel essai la prochaine fois.
          // Un fichier absent (réponse 404) reste en cache : pas de requête répétée.
          this.musicBufs.delete(url);
          return null;
        }
      })();
      this.musicBufs.set(url, p);
    }
    return p;
  }
  /**
   * Joue une musique en BOUCLE (de `loopStart` à `loopEnd` après une première lecture depuis le début), fondu d'entrée
   * `fade` s, volume `vol` (relatif au volume général). Les autres sons restent par-dessus (pas de ducking).
   */
  async playMusic(url: string, o: { loopStart?: number; loopEnd?: number; vol?: number; fade?: number } = {}) {
    const buf = await this.loadMusic(url);
    if (!buf || !this.ok) return;
    this.stopMusic(0.05);
    const c = this.ctx!, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.loopStart !== undefined && o.loopEnd !== undefined && o.loopEnd > o.loopStart && o.loopEnd <= buf.duration) {
      src.loopStart = o.loopStart;
      src.loopEnd = o.loopEnd;
    }
    const gain = c.createGain();
    const vol = o.vol ?? 0.5;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.02, o.fade ?? 0.05));
    src.connect(gain).connect(this.master!);
    src.start(t);
    this.music = { src, gain };
    this.padSync(); // (la nappe des menus se tait sous une musique)
    // tant que la musique joue, le contexte ne se met pas en veille
    const keep = window.setInterval(() => (this.music?.src === src ? this.wake() : clearInterval(keep)), 4000);
  }
  /** Arrête la musique en cours (fondu `fade` s). */
  stopMusic(fade = 0.6) {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    queueMicrotask(() => this.padSync());
    const t = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), t);
    m.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fade));
    try {
      m.src.stop(t + fade + 0.05);
    } catch {
      /* déjà arrêtée */
    }
  }

  /** Volume général (0..1), appliqué tout de suite si le son tourne. */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.7 * this.volume, this.ctx.currentTime, 0.03);
  }

  /** `keep` (s) : durée réellement générée (≤ seconds), la courbe restant celle d'une réponse de `seconds`. */
  private impulse(ctx: AudioContext, seconds: number, decay: number, keep = seconds) {
    const total = Math.floor(ctx.sampleRate * seconds);
    const len = Math.min(total, Math.floor(ctx.sampleRate * keep));
    const fadeN = len < total ? Math.floor(ctx.sampleRate * 0.1) : 0; // fondu de 0,1 s si tronquée
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const f = fadeN && i > len - fadeN ? (len - i) / fadeN : 1;
        const p = i / total;
        // (V2) passe-bas qui se referme avec le temps (6 kHz → 700 Hz) : queue sombre ; ×1,7 compense l'énergie filtrée
        const a = 1 - Math.exp((-2 * Math.PI * (700 + 5300 * Math.pow(1 - p, 2))) / ctx.sampleRate);
        y += a * (Math.random() * 2 - 1 - y);
        d[i] = y * 1.7 * Math.pow(1 - p, decay) * f;
      }
    }
    return buf;
  }

  /** plafond global de voix (24) : au-delà, le son est sauté (jamais de saturation CPU ni de bouillie) */
  private voice(dur: number): boolean {
    if (this.voices >= 24) return false;
    this.voices++;
    window.setTimeout(() => (this.voices = Math.max(0, this.voices - 1)), dur * 1000 + 50);
    return true;
  }

  private get ok() {
    return this.enabled && this.wake();
  }

  private out(g: AudioNode, wet = 0.5, bus: Bus = 'reward') {
    g.connect(this.buses![bus]);
    if (wet > 0) {
      const s = this.ctx!.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.verbSend!);
    }
  }

  private noise(t0: number, dur: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    return src;
  }

  private env(g: GainNode, t0: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  /** transitoire de bruit 2–5 kHz (le « clic » d'attaque qui porte la frappe sur un téléphone), `at` = instant absolu */
  private transient(at: number, vol: number, hz = 3200, bus: Bus = 'reward') {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hz * vary(0.1);
    f.Q.value = 1.4;
    const g = c.createGain();
    this.env(g, at, 0.002, vol, 0.012);
    this.noise(at, 0.03).connect(f).connect(g);
    this.out(g, 0.1, bus);
  }

  // ═══════════════════════════════════════════ V2 — banque de sons cuits (sound/bank.ts), lecture en 2 nœuds

  /** Reçoit un son cuit (toutes ses variantes) : dès lors, la version « matière » remplace la synthèse d'origine. */
  addSound(id: string, clips: Clip[]) {
    try {
      this.bank.set(
        id,
        clips.map((c) => {
          const b = new AudioBuffer({ length: c.ch[0].length, numberOfChannels: c.ch.length, sampleRate: c.sr });
          c.ch.forEach((x, k) => b.copyToChannel(x as Float32Array<ArrayBuffer>, k));
          return b;
        }),
      );
    } catch {
      /* AudioBuffer hors contexte indisponible (très vieux navigateur) : on garde la synthèse d'origine */
    }
  }
  /** vrai si le son cuit `id` est prêt */
  has(id: string): boolean {
    return this.bank.has(id);
  }

  /** instant de départ des sons : maintenant, ou un peu plus tard pendant un `ahead()` (horloge audio, à l'échantillon près) */
  private now(): number {
    return this.ctx!.currentTime + this.lead;
  }

  /**
   * SYNCHRO IMAGE / SON. Un impact déclenché « à l'image » sort en retard : la sortie audio a une latence (10–20 ms sur
   * iPhone, 40–100 ms sur beaucoup d'Android), plus la gigue d'une image. Ici l'appelant prévient `lead` s AVANT
   * l'instant visuel : tous les sons joués dans `fn` sont programmés sur l'horloge audio à `lead − latence`, donc ils
   * sortent du haut-parleur pile sur l'image. Si la latence dépasse `lead`, le son part tout de suite (au mieux).
   */
  ahead(lead: number, fn: () => void) {
    const keep = this.lead;
    this.lead = keep + Math.max(0, lead - this.latency());
    try {
      fn();
    } finally {
      this.lead = keep;
    }
  }

  /**
   * Joue un son cuit. Variante tirée sans jamais répéter la précédente, micro-variation (±2,5 % de vitesse, ±1 dB)
   * sauf `vary: false` (sons tonals). Faux si le son n'est pas (encore) cuit ou si le plafond de voix est atteint.
   */
  play(id: string, o: PlayO = {}): boolean {
    if (!this.ok) return false;
    const list = this.bank.get(id);
    if (!list || !list.length || this.voices >= 24) return false;
    const c = this.ctx!;
    let i = 0;
    if (list.length > 1) {
      const last = this.lastVar.get(id) ?? -1;
      i = Math.floor(Math.random() * (last < 0 ? list.length : list.length - 1));
      if (last >= 0 && i >= last) i++;
      this.lastVar.set(id, i);
    }
    const buf = list[i];
    const rate = Math.max(0.25, Math.min(4, (o.rate ?? 1) * (o.vary === false ? 1 : vary(0.025))));
    const v = (o.vol ?? 1) * (o.vary === false ? 1 : varyDb(1));
    const t = this.now() + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (o.loop) src.loop = true;
    const g = c.createGain();
    if (o.fadeIn) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + o.fadeIn);
    } else g.gain.value = v;
    const natural = o.loop ? Infinity : (buf.duration - (o.offset ?? 0)) / rate;
    let stopAt = 0;
    if (o.dur !== undefined && o.dur < natural) {
      // coupe douce : le son s'éteint à `dur` au lieu d'aller au bout
      const tau = Math.min(0.04, Math.max(0.006, o.dur * 0.25));
      g.gain.setTargetAtTime(0, t + Math.max(o.fadeIn ?? 0, o.dur - tau), tau);
      stopAt = t + o.dur + tau * 5;
    }
    let node: AudioNode = src.connect(g);
    if (o.pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node = node.connect(p);
    }
    node.connect(this.buses![o.bus ?? 'feedback']);
    if (o.wet) {
      const s = c.createGain();
      s.gain.value = o.wet;
      node.connect(s).connect(this.verbSend!);
    }
    this.voices++;
    src.onended = () => (this.voices = Math.max(0, this.voices - 1));
    src.start(t, o.offset ?? 0);
    if (stopAt) src.stop(stopAt);
    return true;
  }

  /**
   * SOUFFLE COUPLÉ AU MOUVEMENT (sound/motion.ts) : une texture cuite (papier pour les gestes courts, air pour les
   * longs) dont le volume ET la couleur suivent la vitesse de la courbe d'animation `ease` — forte là où l'objet va
   * vite, éteinte là où il ralentit. Sans `ease` : profil « sortie douce ». Faux si les textures ne sont pas prêtes.
   */
  sweep(dur: number, o: SweepO = {}): boolean {
    if (!this.ok) return false;
    const short = dur < 0.34;
    const texId = o.tex ?? (short ? 'paper' : 'air');
    const tex = this.bank.get(texId)?.[0];
    if (!tex || this.voices >= 24) return false;
    const c = this.ctx!, t = this.now() + (o.at ?? 0);
    const vel = velocityCurve(o.ease);
    const n = vel.length;
    const vol = (o.vol ?? 0.3) * LV[texId] * varyDb(1.5);
    const k = vary(0.05) * this.color.band;
    const lo = (o.lo ?? 300) * k, hi = (o.hi ?? (short ? 1900 : 1350)) * k;
    const up = o.up ?? true;
    const gain = new Float32Array(n), freq = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i / (n - 1);
      gain[i] = vol * Math.pow(vel[i], 0.75);
      // la couleur : surtout la vitesse (plus vite = plus clair), un peu le sens (monte ou descend)
      freq[i] = lo * Math.pow(hi / lo, 0.65 * vel[i] + 0.35 * (up ? p : 1 - p));
    }
    const src = c.createBufferSource();
    src.buffer = tex;
    src.loop = true;
    src.playbackRate.value = k;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0;
    try {
      f.frequency.setValueCurveAtTime(freq, t, dur);
      g.gain.setValueCurveAtTime(gain, t, dur);
    } catch {
      return false;
    }
    let node: AudioNode = src.connect(f).connect(g);
    if (o.pan !== undefined && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      const [a, b] = typeof o.pan === 'number' ? [o.pan, o.pan] : o.pan;
      p.pan.setValueAtTime(Math.max(-1, Math.min(1, a)), t);
      p.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, b)), t + dur);
      node = node.connect(p);
    }
    this.out(node, 0.12, o.bus ?? 'feedback');
    this.voices++;
    src.onended = () => (this.voices = Math.max(0, this.voices - 1));
    src.start(t, Math.random() * Math.max(0, tex.duration - 0.1));
    src.stop(t + dur + 0.03);
    return true;
  }

  /**
   * (11/11) LIT DE TEXTURE : une texture cuite (air sous 2 kHz, papier au-dessus) passée dans un filtre qui peut glisser,
   * avec attaque / tenue / chute — la version « matière » du bruit filtré des scènes 6★ (même coût : 3 nœuds).
   * Faux si les textures ne sont pas encore cuites.
   */
  bed(dur: number, o: BedO = {}): boolean {
    if (!this.ok) return false;
    const f0 = o.f ?? 1200;
    const texId = f0 >= 2000 || (o.f2 ?? 0) >= 3000 ? 'paper' : 'air';
    const tex = this.bank.get(texId)?.[0];
    if (!tex || this.voices >= 24) return false;
    const c = this.ctx!, t = this.now() + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = tex;
    src.loop = true;
    src.playbackRate.value = vary(0.04);
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(f0, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = c.createGain();
    const a = Math.max(0.004, o.a ?? 0.01);
    const peak = Math.max(0.0002, (o.vol ?? 0.1) * LV[texId] * varyDb(1));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (o.hold) g.gain.setValueAtTime(peak, t + a + dur * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    src.connect(f).connect(g);
    this.out(g, o.wet ?? 0.2, o.bus ?? 'event');
    this.voices++;
    src.onended = () => (this.voices = Math.max(0, this.voices - 1));
    src.start(t, Math.random() * Math.max(0, tex.duration - 0.1));
    src.stop(t + a + dur + 0.05);
    return true;
  }

  /** (11/11) une banque cuite à la demande (scènes 6★ à la première 6★, nappe des menus si allumée) : une seule fois */
  private books = new Set<BookName>();
  loadBook(book: BookName) {
    if (this.books.has(book) || typeof window === 'undefined') return;
    this.books.add(book);
    bakeBank((id, clips) => {
      this.addSound(id, clips);
      if (id === 'pad') this.padSync();
    }, book);
  }

  /** (11/11) couleur sonore du booster en cours d'ouverture (`gaming`, `pop`, `sport`, `monde`, `bebou`) ; null = neutre */
  private color = { foil: 1, band: 1 };
  setPackColor(key: string | null) {
    this.color = (key && PACK_COLOR[key]) || { foil: 1, band: 1 };
  }

  // ─────────────────────────────────────────── (11/11) nappe des menus (réglage, désactivée par défaut)

  private padWanted = false;
  private padHolds = new Set<string>();
  private padNode: { src: AudioBufferSourceNode; g: GainNode; keep: number } | null = null;
  /** Allume / éteint la nappe des menus (la banque `pad` est cuite à la première demande). */
  setPad(on: boolean) {
    this.padWanted = on;
    if (on) this.loadBook('pad');
    this.padSync();
  }
  /** Une raison de se taire (ouverture d'un booster, visionneuse, musique, scène) : la nappe s'efface tant qu'il en reste une. */
  padHold(reason: string, on: boolean) {
    if (on) this.padHolds.add(reason);
    else this.padHolds.delete(reason);
    this.padSync();
  }
  private padSync() {
    const buf = this.bank.get('pad')?.[0];
    const want = this.padWanted && this.enabled && !!buf && !!this.ctx && !this.padHolds.size && !this.music && (typeof document === 'undefined' || !document.hidden);
    const c = this.ctx;
    if (want && !this.padNode && c && buf && this.wake()) {
      const t = c.currentTime + 0.05;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      // très discrète (≈ −26 dBFS) : on la devine sous l'interface, on ne l'écoute pas
      g.gain.exponentialRampToValueAtTime(0.1, t + 3);
      src.connect(g);
      this.out(g, 0.25, 'ambience');
      src.start(t, Math.random() * buf.duration);
      // tant qu'elle joue, le contexte ne se met pas en veille (c'est le prix de la nappe : elle est optionnelle)
      const keep = window.setInterval(() => this.wake(), 4000);
      this.padNode = { src, g, keep };
    } else if (!want && this.padNode && c) {
      const { src, g, keep } = this.padNode;
      this.padNode = null;
      clearInterval(keep);
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      try {
        src.stop(t + 1.3);
      } catch {
        /* déjà arrêtée */
      }
    }
  }

  // ─────────────────────────────────────────── (11/11) iPhone en mode silencieux

  /**
   * Réglage « Son même en mode silencieux (iPhone) », désactivé par défaut. Safari range le son des pages avec les
   * sonneries : coupé par l'interrupteur latéral. `navigator.audioSession.type = 'playback'` (Safari 17+) le range
   * avec la musique : il passe même en silencieux. Sans l'API (autres navigateurs), rien ne change.
   */
  static silentSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  }
  setPlayThroughSilent(on: boolean) {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (!s) return;
    try {
      s.type = on ? 'playback' : 'auto';
    } catch {
      /* type refusé : on garde celui du navigateur */
    }
  }

  /**
   * Sons d'INTERFACE, par intention (plus de `tick(1.7, 0.035)` au jugé). `pan` −1..1 : position du geste à l'écran.
   *  tap : toc feutré (tout ce qui se touche) · press : tok profond (action principale) · nav : changement de page ·
   *  back : fermer / retour (plus grave) · on / off : interrupteur (bulle qui monte / descend) · pop : pastille ·
   *  hover : survol (à peine) · open / close : panneau qui s'ouvre / se ferme (souffle court) · ok / err : résultat.
   */
  ui(kind: UiKind, pan = 0) {
    switch (kind) {
      case 'tap':
        if (!this.play('tap', { vol: LV.ui, pan, bus: 'ui' })) this.tick(1, 0.08);
        break;
      case 'press':
        if (!this.play('press', { vol: LV.ui * 1.15, pan, bus: 'ui' })) this.tick(0.8, 0.1);
        break;
      case 'nav':
        if (!this.play('tap', { vol: LV.ui * 0.8, rate: 0.86, pan, bus: 'ui' })) this.tick(1.15, 0.03);
        break;
      case 'back':
        if (!this.play('tap', { vol: LV.ui * 0.9, rate: 0.76, pan, bus: 'ui' })) this.tick(0.8, 0.05);
        break;
      case 'on':
        if (!this.play('pop', { vol: LV.ui * 0.55, rate: 1.14, pan, bus: 'ui' })) this.tick(1.4, 0.06);
        break;
      case 'off':
        if (!this.play('pop', { vol: LV.ui * 0.5, rate: 0.84, pan, bus: 'ui' })) this.tick(0.9, 0.06);
        break;
      case 'pop':
        if (!this.play('pop', { vol: LV.ui * 0.6, pan, bus: 'ui' })) this.tick(1.7, 0.1);
        break;
      case 'hover':
        this.play('tick', { vol: LV.tick * 0.03, rate: 1.5, pan, bus: 'ui' });
        break;
      case 'open':
        this.sweep(0.2, { vol: 0.06, up: true, tex: 'air', pan });
        break;
      case 'close':
        this.sweep(0.16, { vol: 0.05, up: false, tex: 'air', pan });
        break;
      case 'ok':
        this.note(5, 0.05, 0.4);
        break;
      case 'err':
        this.decline(0.07);
        break;
    }
  }

  /**
   * Toucher SONORE de toute l'interface, branché une fois : chaque élément cliquable rend un « toc » feutré, placé en
   * stéréo là où le doigt touche. Souris : dès l'appui (réponse immédiate) ; tactile : au tap confirmé (jamais pendant
   * un défilement). `data-sfx="press|nav|back|on|off|pop|off…"` sur un élément choisit le son ; `data-sfx="none"` le
   * coupe. Les sons propres d'un bouton (carillon, note…) se posent par-dessus.
   */
  bindUi(root: Document | HTMLElement = document) {
    const SEL = 'button, a[href], summary, select, input[type="checkbox"], input[type="radio"], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], [data-sfx]';
    const fire = (e: Event) => {
      if (!this.enabled) return;
      const from = e.target instanceof Element ? e.target : null;
      const el = from?.closest<HTMLElement>(SEL);
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      let kind = el.closest<HTMLElement>('[data-sfx]')?.dataset.sfx as UiKind | 'none' | undefined;
      if (kind === 'none') return;
      if (!kind) {
        const box = el as HTMLInputElement;
        if (el.matches('input[type="checkbox"], [role="switch"]')) {
          // au clic, la case a déjà basculé ; à l'appui (souris), pas encore
          const on = el.matches('input') ? box.checked : el.getAttribute('aria-checked') === 'true';
          kind = (e.type === 'click' ? on : !on) ? 'on' : 'off';
        } else if (el.matches('[role="tab"], nav *')) kind = 'nav';
        else if (/close|fermer|retour|back/i.test(`${el.className} ${el.getAttribute('aria-label') ?? ''}`)) kind = 'back';
        else kind = 'tap';
      }
      const x = (e as MouseEvent).clientX;
      const pan = Number.isFinite(x) && x > 0 ? (x / Math.max(1, window.innerWidth) - 0.5) * 0.7 : 0;
      this.ui(kind, pan);
    };
    // souris / stylet : à l'appui ; doigt : au tap confirmé (un `pointerdown` tactile peut être le début d'un défilement)
    root.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType !== 'touch' && pe.button === 0) fire(e);
    }, { capture: true, passive: true });
    root.addEventListener('click', (e) => {
      const pe = e as PointerEvent;
      // clic clavier (Entrée / Espace : pas de coordonnées) ou tactile ; le clic souris a déjà sonné à l'appui
      if (pe.pointerType === 'touch' || !pe.pointerType || pe.detail === 0) fire(e);
    }, { capture: true, passive: true });
  }

  /** Carte qui se pose (« pat » sur le tapis). `pan` : où elle se pose. */
  pat(vol = 0.3, pan = 0) {
    if (!this.play('land', { vol: vol * LV.land, pan, bus: 'feedback', wet: 0.05 })) this.thumpSynth(vol * 0.6);
  }

  // ═══════════════════════════════════════════ sons historiques : même API, version « matière » si elle est cuite

  /** Petit « tic » feutré (cran, étoile, survol) — bus feedback, débit limité à un tic / 35 ms. `pitch` : hauteur relative. */
  tick(pitch = 1, vol = 0.25, pan = 0) {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastTick < 0.035) return;
    const rate = Math.max(0.5, Math.min(2.6, pitch));
    // (lu plus vite, un son est plus court : un peu de gain rend la même présence)
    if (this.play('tick', { rate, vol: vol * LV.tick * Math.pow(rate, 0.4), pan, wet: 0.04 })) this.lastTick = now;
    else this.tickSynth(pitch, vol);
  }

  /**
   * Souffle d'un mouvement — bus feedback. `ease` : la courbe de l'animation qu'il accompagne (EASE.* ou toute
   * fonction 0..1 → 0..1) : le son suit sa vitesse (voir `sweep`). `up` : la couleur monte (départ) ou descend (arrivée).
   */
  whoosh(dur = 0.45, vol = 0.3, up = true, ease?: Ease) {
    if (!this.sweep(dur, { vol, up, ease })) this.whooshSynth(dur, vol, up);
  }

  /** Déchirure du sachet : un morceau de la texture « alu froissé » (grains résonants), jamais deux fois le même. */
  tear(dur = 0.6, vol = 0.35) {
    const tex = this.bank.get('foil')?.[0];
    if (tex) {
      const d = Math.min(dur, tex.duration - 0.2);
      if (this.play('foil', { vol: vol * LV.foil, dur: d, offset: Math.random() * (tex.duration - d - 0.1), fadeIn: 0.004, rate: vary(0.06) * this.color.foil, wet: 0.06 })) return;
    }
    this.tearSynth(dur, vol);
  }

  /**
   * Impact (pose, payoff), selon la force : « pat » d'une carte (vol < 0,36) · coup feutré (3★–4★) · grand impact
   * (5★–6★). Chacun garde sa couche d'harmoniques 150–700 Hz : le grave « suggéré » qu'un téléphone sait rendre.
   */
  thump(vol = 0.6, low = 46, pan = 0, bus: Bus = 'reward') {
    const id = vol < 0.36 ? 'land' : vol < 0.6 ? 'thud' : 'boom';
    const rate = Math.max(0.85, Math.min(1.25, Math.sqrt(low / 46)));
    if (!this.play(id, { vol: vol * LV[id], rate, pan, bus, wet: id === 'land' ? 0.04 : 0.08 })) this.thumpSynth(vol, low);
  }

  /**
   * Carillon de récompense : bol feutré, plus riche et plus long selon la rareté. `base` est CALÉE sur la gamme (sol
   * pentatonique, transposée pendant la 6★) ; vélocité ±2 dB, jamais de désaccord. 1★ : pas de réverbe.
   */
  chime(tier = 2, vol = 0.22, base = 392, at = 0) {
    const hz = quantize(base, this.transpose);
    const b = hz < 555 ? CHIME_BASES[0] : CHIME_BASES[1];
    const size = tier <= 2 ? 'S' : tier <= 4 ? 'M' : 'L';
    const ok = this.play(`chime${size}${b}`, { rate: hz / b, vol: vol * LV[`chime${size}`] * varyDb(2), at, vary: false, bus: tier >= 5 ? 'event' : 'reward', wet: tier <= 0 ? 0 : 0.4 });
    if (!ok) this.chimeSynth(tier, vol, base, at);
  }

  /** Une note de la gamme (degré `deg`, 0 = sol4, 5 = sol5…) : lame de bois feutrée. `dur` : tenue max, `at` : décalage (s). */
  note(deg: number, vol = 0.15, dur = 0.8, at = 0) {
    const d = Math.round(deg);
    const lo = NOTE_BASES[0], hi = NOTE_BASES[NOTE_BASES.length - 1];
    // base cuite la plus proche (une sur deux est cuite : au plus un degré d'écart, relu un peu plus vite ou lentement)
    const base = Math.max(lo, Math.min(hi, (d - lo) % 2 === 0 ? d : d - 1));
    const ok = this.play(`note${base}`, { rate: scaleHz(d, this.transpose) / scaleHz(base), vol: vol * LV.note * varyDb(2), dur: Math.max(0.12, dur), at, vary: false, bus: 'reward', wet: dur > 0.3 ? 0.3 : 0.06 });
    if (!ok) this.noteSynth(deg, vol, dur, at);
  }

  /**
   * Pièce qui arrive au compteur : « ting » mat dont la hauteur suit le degré `deg` de la gamme. `at` (s) : décalage sur
   * l'horloge audio — une rafale de pièces se programme d'un coup, régulière à l'échantillon près (pas de setTimeout).
   */
  coin(deg = 0, vol = 0.09, at = 0) {
    const rate = scaleHz(5 + (((deg % 10) + 10) % 10), this.transpose) / COIN_HZ;
    const ok = this.play('coin', { rate, vol: vol * LV.coin * Math.sqrt(rate) * varyDb(2), at, vary: false, bus: 'reward', wet: 0.1 });
    if (ok) return;
    if (at > 0) window.setTimeout(() => this.coinSynth(deg, vol), at * 1000);
    else this.coinSynth(deg, vol);
  }

  /** Craquement feutré (verre, fracture) : quelques grains serrés et un coup grave. */
  crack(vol = 0.5) {
    if (!this.play('crack', { vol: vol * LV.crack, bus: 'reward', wet: 0.15 })) this.crackSynth(vol);
  }

  // ═══════════════════════════════════════════ synthèse d'origine (secours tant que la banque cuit, et sons longs)

  /** Petit clic sec (flip, UI) — bus feedback, débit limité à un tic / 35 ms, variation ±4 % / ±1,5 dB. */
  private tickSynth(pitch = 1, vol = 0.25) {
    if (!this.ok) return;
    const c = this.ctx!, t = this.now();
    this.lastTick = c.currentTime;
    if (!this.voice(0.1)) return;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 * pitch * vary(0.04);
    f.Q.value = 3 * vary(0.1);
    const g = c.createGain();
    this.env(g, t, 0.002, vol * varyDb(1.5), 0.05);
    this.noise(t, 0.08).connect(f).connect(g);
    this.out(g, 0.12, 'feedback');
  }

  /** Souffle d'air (mouvement rapide) — bus feedback. */
  private whooshSynth(dur = 0.45, vol = 0.3, up = true) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const k = vary(0.04);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2 * vary(0.1);
    f.frequency.setValueAtTime((up ? 300 : 2200) * k, t);
    f.frequency.exponentialRampToValueAtTime((up ? 2400 : 280) * k, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * varyDb(1.5), t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur).connect(f).connect(g);
    this.out(g, 0.3, 'feedback');
  }

  /** Déchirure : bruit granuleux modulé — bus feedback. */
  private tearSynth(dur = 0.6, vol = 0.35) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900 * vary(0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const steps = Math.floor(dur * 70);
    for (let i = 0; i < steps; i++) {
      const tt = t + (i / steps) * dur;
      g.gain.setValueAtTime(vol * (0.15 + Math.random() * 0.85) * (1 - (i / steps) * 0.5), tt);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    this.noise(t, dur).connect(f).connect(g);
    this.out(g, 0.25, 'feedback');
  }

  /**
   * Impact (pose, payoff) en TROIS couches : transitoire 2–5 kHz (5–20 ms, c'est lui qui « frappe » sur un téléphone),
   * corps en sinus qui chute (low × 2,6 → low), et copie saturée filtrée passe-haut à 150 Hz (harmoniques 150–500 Hz :
   * le grave « suggéré » que le petit haut-parleur ne sort pas).
   */
  private thumpSynth(vol = 0.6, low = 46) {
    if (!this.ok || !this.voice(0.5)) return;
    const c = this.ctx!, t = this.now();
    this.transient(t, vol * 0.45, 3000 + vol * 1500);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(low * 2.6, t);
    o.frequency.exponentialRampToValueAtTime(low, t + 0.18);
    const g = c.createGain();
    this.env(g, t, 0.004, vol, 0.42);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.5);
    this.out(g, 0.2);
    // couche harmonique saturée (fondamentale manquante)
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const hg = c.createGain();
    this.env(hg, t, 0.004, vol * 0.5, 0.28);
    g.connect(this.shaper!).connect(hp).connect(lp).connect(hg);
    this.out(hg, 0.1);
  }

  /** Montée de tension (suspense), à deux couches (bruit filtré + sinus qui monte). */
  riser(dur = 1.5, tier = 2, vol = 0.22) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(200 * vary(0.1), t);
    f.frequency.exponentialRampToValueAtTime(1800 + tier * 500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    this.noise(t, dur + 0.1).connect(f).connect(g);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(scaleHz(-5, this.transpose) / 2, t); // sol3 : dans la gamme
    o.frequency.exponentialRampToValueAtTime(scaleHz(-5, this.transpose) / 2 * Math.pow(2, 1 + tier * 0.25), t + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(og);
    o.start(t);
    o.stop(t + dur + 0.1);
    this.out(g, 0.4);
    this.out(og, 0.4);
  }

  /**
   * Cloche inharmonique : récompense. Plus de partiels selon la rareté. `base` est CALÉE sur la gamme (sol pentatonique,
   * transposée pendant la 6★) ; vélocité ±2 dB, jamais de désaccord. 1★ : pas de réverbe.
   */
  private chimeSynth(tier = 2, vol = 0.22, base = 392, at = 0) {
    if (!this.ok || !this.voice(1.5 + tier * 0.4)) return;
    const c = this.ctx!, t = this.now() + at;
    const hz = quantize(base, this.transpose);
    const v = vol * varyDb(2);
    const ratios = [1, 2.0, 2.76, 4.07, 5.4, 6.8].slice(0, 2 + Math.min(4, tier));
    ratios.forEach((r, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * r;
      const g = c.createGain();
      this.env(g, t + i * 0.012, 0.004, v / (1 + i * 0.7), 1.4 + tier * 0.4 - i * 0.15);
      o.connect(g);
      o.start(t);
      o.stop(t + 3.5);
      this.out(g, tier <= 0 ? 0 : 0.6, tier >= 5 ? 'event' : 'reward');
    });
  }

  /** Une note de la gamme (degré `deg`, 0 = sol4, 5 = sol5…), timbre cristal doux. `at` = décalage (s). */
  private noteSynth(deg: number, vol = 0.15, dur = 0.8, at = 0) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now() + at;
    const hz = scaleHz(deg, this.transpose);
    const v = vol * varyDb(2);
    // porteuse + partiel inharmonique (cloche) + pluck triangle
    for (const [r, k, type, d] of [[1, 1, 'sine', dur], [2.76, 0.25, 'sine', dur * 0.6], [1, 0.35, 'triangle', 0.18]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz * r;
      const g = c.createGain();
      this.env(g, t, 0.003, v * k, d);
      o.connect(g);
      o.start(t);
      o.stop(t + d + 0.1);
      this.out(g, dur > 0.3 ? 0.45 : 0.1, 'reward');
    }
  }

  /**
   * Arpège ascendant dans la gamme : `n` notes depuis le degré `from`, `gap` s entre elles (±5–15 ms de micro-décalage).
   * Utilisé pour les étoiles qui s'allument et le glissando prismatique de la 6★ (`n` = 12, gap 0,055).
   */
  arp(n: number, vol = 0.12, gap = 0.1, from = 0, dur = 0.7) {
    for (let k = 0; k < n; k++) this.note(from + k, vol * (1 + k * 0.03), dur, k * gap + (k ? (Math.random() - 0.5) * 0.012 : 0));
  }

  /** Scintillement prismatique de la 6★ : 12 notes sur deux octaves (55 ms), en LA MAJEUR (modulation d'un ton). */
  prismatic(vol = 0.1) {
    const keep = this.transpose;
    this.transpose = 2;
    this.arp(12, vol, 0.055, 0, 1.1);
    this.transpose = keep;
  }

  /**
   * Motif « Bébou » (secrète) : 5 notes en do# lydien (do# fa sol sol# do), boîte à musique — jamais utilisé ailleurs
   * (sauf les 3 premières notes dans la notification « un pote a drop une secrète », `short`).
   */
  bebou(vol = 0.16, short = false) {
    if (!this.ok) return;
    const c = this.ctx!, t0 = this.now();
    const semis = [0, 4, 6, 7, 11];
    const times = [0, 0.22, 0.44, 0.58, 0.9];
    (short ? semis.slice(0, 3) : semis).forEach((s, i) => {
      const hz = 554.37 * Math.pow(2, s / 12);
      const t = t0 + times[i];
      for (const [r, k, d] of [[1, 1, 1.6], [4, 0.18, 0.5], [6.4, 0.1, 0.3]] as const) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz * r;
        const g = c.createGain();
        this.env(g, t, 0.002, vol * k, d);
        o.connect(g);
        o.start(t);
        o.stop(t + d + 0.1);
        this.out(g, 0.7, 'event');
      }
    });
  }

  /** Pièce qui arrive au compteur : tic métallique dont la hauteur suit le degré `deg` de la gamme (puis à l'octave). */
  private coinSynth(deg = 0, vol = 0.09) {
    if (!this.ok || !this.voice(0.25)) return;
    const c = this.ctx!, t = this.now();
    const hz = scaleHz(10 + (deg % 10), this.transpose);
    for (const [r, k] of [[1, 1], [2.5, 0.3]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * r;
      const g = c.createGain();
      this.env(g, t, 0.002, vol * k * varyDb(2), 0.18);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
      this.out(g, 0.2, 'reward');
    }
    this.transient(t, vol * 0.5, 5000, 'reward');
  }

  /** Deux notes descendantes douces (refus, erreur) — jamais de buzzer. */
  decline(vol = 0.1) {
    this.note(2, vol, 0.3);
    this.note(0, vol, 0.45, 0.14);
  }

  /** Nappe scintillante (rareté haute), dans la gamme. */
  shimmer(tier = 4, dur = 2.2, vol = 0.12) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const degs = [5, 7, 9, 10, 12, 14].slice(0, 2 + tier);
    degs.forEach((dg, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = scaleHz(dg, this.transpose);
      const lfo = c.createOscillator();
      lfo.frequency.value = 5 + i;
      const lg = c.createGain();
      lg.gain.value = 3;
      lfo.connect(lg).connect(o.detune);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol / (1 + i * 0.4), t + 0.08 + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.1);
      lfo.stop(t + dur + 0.1);
      this.out(g, 0.8, tier >= 5 ? 'event' : 'reward');
    });
  }

  /** Craquement sec (verre, fracture). */
  private crackSynth(vol = 0.5) {
    if (!this.ok || !this.voice(0.3)) return;
    const c = this.ctx!, t = this.now();
    for (let k = 0; k < 4; k++) {
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500 + Math.random() * 3000;
      const g = c.createGain();
      this.env(g, t + k * 0.018 + Math.random() * 0.01, 0.002, vol * (1 - k * 0.2), 0.08 + Math.random() * 0.1);
      this.noise(t, 0.3).connect(f).connect(g);
      this.out(g, 0.5);
    }
  }

  /** Grondement grave (+ harmoniques 150–400 Hz pour le téléphone). */
  rumble(dur = 1.2, vol = 0.4) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    for (const [hz, k] of [[140, 1], [360, 0.35]] as const) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = hz;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * k, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      this.noise(t, dur).connect(f).connect(g);
      this.out(g, 0.3);
    }
  }

  /** Battement de cœur (« lub-dub ») : deux coups sourds, le second plus doux, avec leurs harmoniques (160–320 Hz). */
  heartbeat(vol = 0.5, low = 40) {
    if (!this.ok || !this.voice(0.6)) return;
    const c = this.ctx!, t0 = this.now();
    for (const [dt, k] of [[0, 1], [0.17, 0.62]] as const) {
      const t = t0 + dt;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(low * 1.9, t);
      o.frequency.exponentialRampToValueAtTime(low, t + 0.12);
      const g = c.createGain();
      this.env(g, t, 0.006, vol * k, 0.32);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.45);
      // harmoniques : la même enveloppe, saturée, 150–500 Hz
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 150;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const hg = c.createGain();
      this.env(hg, t, 0.006, vol * k * 0.45, 0.2);
      g.connect(this.shaper!).connect(hp).connect(lp).connect(hg);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      const ng = c.createGain();
      this.env(ng, t, 0.003, vol * k * 0.5, 0.12);
      this.noise(t, 0.2).connect(f).connect(ng);
      this.out(g, 0.15);
      this.out(hg, 0.05);
      this.out(ng, 0.1);
    }
  }

  /** Arrêt de bande : tout s'effondre vers le grave (la fausse ouverture « déraille »). */
  tapeStop(vol = 0.35, dur = 0.45) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(28, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const ng = c.createGain();
    ng.gain.setValueAtTime(vol * 0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur).connect(f).connect(ng);
    this.out(g, 0.2, 'feedback');
    this.out(ng, 0.2, 'feedback');
  }

  /** Chœur synthétique (« aah » : scies désaccordées → formants), accord majeur 9 qui s'ouvre — sol (ou la pendant la 6★). */
  choir(dur = 4.5, vol = 0.14, base = 220) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const root = base * Math.pow(2, this.transpose / 12);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 800;
    f1.Q.value = 3;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1150;
    f2.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.7);
    g.gain.setValueAtTime(vol, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f1.connect(g);
    f2.connect(g);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = c.createGain();
    lg.gain.value = 7;
    lfo.connect(lg);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    [0, 4, 7, 11, 14, 19].forEach((n, i) => {
      for (const det of [-9, 0, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = root * Math.pow(2, n / 12);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        lg.connect(o.detune);
        const og = c.createGain();
        og.gain.value = 0.22 / (1 + i * 0.25);
        o.connect(og);
        og.connect(f1);
        og.connect(f2);
        o.start(t + i * 0.05);
        o.stop(t + dur + 0.1);
      }
    });
    this.out(g, 0.9, 'event');
  }

  // ─────────────────────────────── invocation Yu-Gi-Oh (6★, scènes/duelSummon) — motifs ORIGINAUX, rien de la série

  /** cuivre synthétique : 3 scies désaccordées, filtre qui s'ouvre à l'attaque (le « blat » d'un cuivre), `at` absolu */
  private brass(at: number, hz: number, dur: number, vol: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2.2;
    f.frequency.setValueAtTime(hz * 1.3, at);
    f.frequency.exponentialRampToValueAtTime(Math.min(9000, hz * 10), at + 0.045);
    f.frequency.exponentialRampToValueAtTime(Math.min(6000, hz * 3.4), at + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.018);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, at + 0.22);
    g.gain.setValueAtTime(vol * 0.5, at + Math.max(0.23, dur - 0.18));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    f.connect(g);
    for (const det of [-12, 0, 10]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = det;
      o.connect(f);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
    this.out(g, 0.5, 'event');
  }

  /** tambour (taiko) : corps grave qui chute + peau (bruit) + couche saturée 150–500 Hz pour le haut-parleur du téléphone */
  private taiko(at: number, vol: number, low = 52) {
    const c = this.ctx!;
    this.transient(at, vol * 0.4, 2400, 'event');
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(low * 2.4, at);
    o.frequency.exponentialRampToValueAtTime(low, at + 0.22);
    const g = c.createGain();
    this.env(g, at, 0.005, vol, 0.75);
    o.connect(g);
    o.start(at);
    o.stop(at + 0.85);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const hg = c.createGain();
    this.env(hg, at, 0.005, vol * 0.5, 0.4);
    g.connect(this.shaper!).connect(hp).connect(lp).connect(hg);
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 700;
    nf.Q.value = 0.8;
    const ng = c.createGain();
    this.env(ng, at, 0.002, vol * 0.35, 0.18);
    this.noise(at, 0.25).connect(nf).connect(ng);
    this.out(g, 0.25, 'event');
    this.out(hg, 0.15, 'event');
    this.out(ng, 0.3, 'event');
  }

  /**
   * « L'heure du duel » (motif original) : aspiration de cymbale inversée, puis TA — TA — TAAM : deux accents de cuivres en
   * ré mineur, le troisième s'ouvre en si bémol majeur (6e napolitaine… héroïque) sur un taiko et une sous-basse qui tombe.
   * Les premières harmoniques des cuivres passent sur un téléphone ; ≈ 2,9 s.
   */
  duelSting(vol = 0.5) {
    if (!this.ok || !this.voice(3.2)) return;
    const c = this.ctx!, t = this.now();
    const pre = 0.55;
    // cymbale inversée (bruit aigu qui gonfle jusqu'au premier coup)
    const hf = c.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.setValueAtTime(2500, t);
    hf.frequency.exponentialRampToValueAtTime(7000, t + pre);
    const hg = c.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(vol * 0.28, t + pre - 0.01);
    hg.gain.linearRampToValueAtTime(0.0001, t + pre + 0.01);
    this.noise(t, pre + 0.05).connect(hf).connect(hg);
    this.out(hg, 0.6, 'event');
    const dm = [146.83, 220, 293.66, 349.23, 440];
    const bb = [116.54, 233.08, 293.66, 349.23, 466.16, 587.33];
    const hits: Array<[number, number[], number, number]> = [
      [pre, dm, 0.24, 0.72],
      [pre + 0.29, dm, 0.24, 0.72],
      [pre + 0.6, bb, 2.1, 1],
    ];
    for (const [dt, chord, dur, k] of hits) {
      chord.forEach((hz, i) => this.brass(t + dt, hz, dur, (vol * 0.1 * k) / (1 + i * 0.12)));
      this.taiko(t + dt, vol * 0.75 * k, k > 0.9 ? 40 : 56);
    }
    // TAAM : sous-basse qui tombe + crash (bruit large qui s'éteint)
    const at = t + pre + 0.6;
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(74, at);
    sub.frequency.exponentialRampToValueAtTime(36, at + 1.6);
    const sg = c.createGain();
    this.env(sg, at, 0.01, vol * 0.55, 1.7);
    sub.connect(sg);
    sub.start(at);
    sub.stop(at + 1.8);
    this.out(sg, 0.1, 'event');
    const cf = c.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 3200;
    const cg = c.createGain();
    this.env(cg, at, 0.003, vol * 0.22, 1.9);
    this.noise(at, 2).connect(cf).connect(cg);
    this.out(cg, 0.7, 'event');
  }

  /** Bourdonnement du projecteur d'hologramme : scie à 55 Hz dans un filtre qui balaie, crépitements, `dur` s. */
  holoHum(dur = 2.4, vol = 0.18) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    for (const [hz, type] of [[55, 'sawtooth'], [110.4, 'square']] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    // crépitements : quelques clics de bruit aléatoires
    for (let i = 0; i < 9; i++) this.transient(t + Math.random() * dur * 0.8, vol * (0.25 + Math.random() * 0.35), 3800 + Math.random() * 2500, 'event');
    this.out(g, 0.4, 'event');
  }

  /** Balayage de matérialisation (bas → haut) : sinus qui monte + souffle filtré qui le suit. */
  scanSweep(dur = 1.6, vol = 0.14) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = this.now();
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(scaleHz(0, this.transpose) / 2, t);
    o.frequency.exponentialRampToValueAtTime(scaleHz(10, this.transpose), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.1);
    g.gain.setValueAtTime(vol * 0.5, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(vol, t + dur * 0.9);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    this.noise(t, dur + 0.1).connect(f).connect(ng);
    this.out(g, 0.5, 'event');
    this.out(ng, 0.4, 'event');
  }

  /**
   * Cri de créature, synthétisé (jamais un enregistrement) : source riche (scies + carré) dont la hauteur monte puis
   * s'effondre, grognement (modulation d'amplitude), formants de gueule, souffle rauque, saturation.
   * dragon : cri perçant · darkDragon : plus grave et sale · skyDragon : aigu + tonnerre · giant : grondement de colosse ;
   * mage / fairy : pas de cri — magie (éclat FM + arpège / clochettes) ; duelist : accord de cuivres héroïque.
   */
  creature(kind: CreatureKind, vol = 0.5) {
    if (!this.ok) return;
    const c = this.ctx!, t = this.now();
    if (kind === 'mage' || kind === 'fairy') {
      if (!this.voice(2.4)) return;
      // éclat magique : sinus modulé en fréquence qui monte (FM), puis arpège / clochettes dans la gamme
      const car = c.createOscillator();
      const mod = c.createOscillator();
      const mg = c.createGain();
      car.type = 'sine';
      car.frequency.setValueAtTime(kind === 'fairy' ? 520 : 260, t);
      car.frequency.exponentialRampToValueAtTime(kind === 'fairy' ? 2100 : 1300, t + 0.7);
      mod.frequency.value = kind === 'fairy' ? 37 : 23;
      mg.gain.setValueAtTime(0, t);
      mg.gain.linearRampToValueAtTime(kind === 'fairy' ? 420 : 640, t + 0.5);
      mod.connect(mg).connect(car.frequency);
      const g = c.createGain();
      this.env(g, t, 0.08, vol * 0.22, 1.1);
      car.connect(g);
      car.start(t);
      mod.start(t);
      car.stop(t + 1.3);
      mod.stop(t + 1.3);
      this.out(g, 0.7, 'event');
      if (kind === 'fairy') for (let k = 0; k < 7; k++) this.chime(3, vol * 0.08, scaleHz(5 + k, this.transpose), 0.25 + k * 0.07);
      else this.arp(6, vol * 0.12, 0.08, 0, 0.9);
      this.choir(2.2, vol * 0.14, kind === 'fairy' ? 330 : 196);
      return;
    }
    if (kind === 'duelist') {
      if (!this.voice(2.4)) return;
      const major = [196, 293.66, 392, 493.88, 587.33];
      major.forEach((hz, i) => this.brass(t + i * 0.012, hz * Math.pow(2, this.transpose / 12), 2.2, (vol * 0.1) / (1 + i * 0.15)));
      this.taiko(t, vol * 0.6, 48);
      return;
    }
    const P = {
      dragon: { f0: 230, f1: 360, f2: 120, dur: 1.9, form: [720, 1550, 2700], growl: 36, screech: 1 },
      darkDragon: { f0: 150, f1: 250, f2: 78, dur: 2.1, form: [540, 1180, 2350], growl: 28, screech: 0.45 },
      skyDragon: { f0: 270, f1: 430, f2: 150, dur: 2.0, form: [820, 1750, 3050], growl: 42, screech: 1.2 },
      giant: { f0: 72, f1: 112, f2: 44, dur: 2.7, form: [320, 760, 1850], growl: 21, screech: 0 },
    }[kind];
    if (!this.voice(P.dur)) return;
    const d = P.dur;
    const src = c.createGain();
    src.gain.value = 1;
    const oscs: OscillatorNode[] = [];
    for (const [type, k, det] of [['sawtooth', 1, -14], ['sawtooth', 1, 12], ['square', 0.5, 0]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.setValueAtTime(P.f0 * k * vary(0.03), t);
      o.frequency.exponentialRampToValueAtTime(P.f1 * k, t + d * 0.32);
      o.frequency.setValueAtTime(P.f1 * k, t + d * 0.5);
      o.frequency.exponentialRampToValueAtTime(P.f2 * k, t + d);
      o.connect(src);
      oscs.push(o);
    }
    // grognement : modulation d'amplitude rapide (la gorge qui vibre) + petit vibrato
    const am = c.createGain();
    am.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(P.growl, t);
    lfo.frequency.linearRampToValueAtTime(P.growl * 1.3, t + d);
    const lg = c.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(am.gain);
    src.connect(am);
    const vib = c.createOscillator();
    vib.frequency.value = 6.5;
    const vg = c.createGain();
    vg.gain.value = 18;
    vib.connect(vg);
    oscs.forEach((o) => vg.connect(o.detune));
    // saturation puis formants (gueule) en parallèle
    const pre = c.createGain();
    pre.gain.value = 0.6;
    am.connect(pre).connect(this.shaper!);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.12);
    env.gain.setValueAtTime(vol * 0.5, t + d * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    P.form.forEach((hz, i) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 5;
      bp.frequency.setValueAtTime(hz * 0.85, t);
      bp.frequency.exponentialRampToValueAtTime(hz * 1.15, t + d * 0.35);
      bp.frequency.exponentialRampToValueAtTime(hz * 0.8, t + d);
      const fg = c.createGain();
      fg.gain.value = [1, 0.6, 0.32][i];
      this.shaper!.connect(bp).connect(fg).connect(env);
    });
    // souffle rauque (bruit dans les mêmes formants)
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = P.form[1];
    nf.Q.value = 1.2;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.15);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + d);
    this.noise(t, d).connect(nf).connect(ng);
    // cri perçant (dragons) : harmonique aiguë au sommet de la courbe
    if (P.screech > 0) {
      const s = c.createOscillator();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(P.f1 * 4, t + d * 0.18);
      s.frequency.exponentialRampToValueAtTime(P.f1 * 5.2, t + d * 0.38);
      s.frequency.exponentialRampToValueAtTime(P.f1 * 3, t + d * 0.8);
      const sf = c.createBiquadFilter();
      sf.type = 'bandpass';
      sf.frequency.value = P.form[2] * 1.1;
      sf.Q.value = 3;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, t + d * 0.18);
      sg.gain.exponentialRampToValueAtTime(vol * 0.12 * P.screech, t + d * 0.32);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.82);
      s.connect(sf).connect(sg);
      vg.connect(s.detune);
      s.start(t + d * 0.18);
      s.stop(t + d * 0.85);
      this.out(sg, 0.6, 'event');
    }
    for (const o of [...oscs, lfo, vib]) {
      o.start(t);
      o.stop(t + d + 0.05);
    }
    this.out(env, 0.55, 'event');
    this.out(ng, 0.5, 'event');
    if (kind === 'giant') this.rumble(d, vol * 0.5);
    if (kind === 'skyDragon') this.crack(vol * 0.5);
  }

  /**
   * Accès brut à la chaîne audio pour les scènes des 6★ (game/mythic/sounds.ts) : contexte, bruit blanc partagé et
   * sortie sur un bus (compresseur + limiteur + volume général compris). `null` si le son est coupé ou bloqué.
   * `voice(d)` réserve une voix (plafond global de 24) : faux = on saute ce son.
   */
  rig(): { c: AudioContext; t: number; noise: (t0: number, dur: number) => AudioBufferSourceNode; out: (g: AudioNode, wet?: number, bus?: Bus) => void; voice: (dur: number) => boolean; shaper: WaveShaperNode } | null {
    if (!this.ok) return null;
    const c = this.ctx!;
    return { c, t: this.now(), noise: (t0, d) => this.noise(t0, d), out: (g, wet = 0.3, bus = 'event') => this.out(g, wet, bus), voice: (d) => this.voice(d), shaper: this.shaper! };
  }

  /** Fichiers son facultatifs (déposés par le joueur dans public/fx/yugioh/sfx) : décodés une fois, null s'ils n'existent pas. */
  private samples = new Map<string, Promise<AudioBuffer | null>>();
  loadSample(url: string): Promise<AudioBuffer | null> {
    let p = this.samples.get(url);
    if (!p) {
      p = fetch(url)
        .then(async (r) => {
          if (!r.ok || !/^audio\//.test(r.headers.get('content-type') ?? 'audio/')) return null;
          // décodage hors du contexte de lecture (il peut ne pas encore exister : premier toucher pas encore fait)
          const off = new OfflineAudioContext(2, 1, 44100);
          return await off.decodeAudioData(await r.arrayBuffer());
        })
        .catch(() => {
          queueMicrotask(() => this.samples.delete(url)); // (A2-08) raté passager : nouvel essai la prochaine fois
          return null;
        });
      this.samples.set(url, p);
    }
    return p;
  }
  /** (audit 12/11, S16 / A2-06) oublie un échantillon décodé dont l'appelant ne veut pas (trop long pour un cri…) */
  dropSample(url: string): void {
    if (this.samples.has(url)) this.samples.set(url, Promise.resolve(null)); // (refusé une fois pour toutes : ni gardé, ni redécodé)
  }
  /** Joue un fichier décodé ; `fade(s)` l'éteint en douceur (fin de séquence, passage). */
  playSample(buf: AudioBuffer, vol = 0.8, wet = 0.08): { fade(s?: number): void } | null {
    if (!this.ok || !this.voice(buf.duration)) return null;
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g);
    s.start(this.now());
    this.out(g, wet, 'event');
    return {
      fade: (d = 0.8) => {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + d);
        try {
          s.stop(t + d + 0.05);
        } catch {
          /* déjà arrêté */
        }
      },
    };
  }
}

export type CreatureKind = 'dragon' | 'darkDragon' | 'skyDragon' | 'giant' | 'mage' | 'fairy' | 'duelist';
