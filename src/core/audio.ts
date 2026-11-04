/**
 * Sound design 100 % synthétisé (Web Audio). Muet tant que `enable()` n'a pas été appelé (le navigateur exige un geste) :
 * dans le jeu, le shell l'appelle au premier toucher sauf si le joueur a coupé le son (bouton 🔈, `bebou.sound` = '0') ;
 * coupé, le contexte audio est suspendu.
 *
 * CHARTE SONORE (réf. « Le son de Bebou Card », 4 nov. 2026) :
 *  - une seule gamme pour tout ce qui est musical : SOL MAJEUR PENTATONIQUE (sol la si ré mi), fondamentales ≥ 390 Hz
 *    → audibles sur le haut-parleur d'un téléphone ; seule la 6★ module (la majeur, +2 demi-tons) ; la secrète a son motif
 *    lydien, jamais entendu ailleurs ;
 *  - BUS : ui · feedback · reward · event · ambience → master → compresseur doux → LIMITEUR (−3 dBFS, 20:1) → sortie.
 *    Un événement (6★, secrète) baisse les autres bus (ducking planifié) ; `duck()` fait le vrai silence (queue de
 *    réverbe coupée aussi) ;
 *  - VARIATION anti-habituation : sons bruités (tick, whoosh, tear) ±4 % de hauteur, ±10 % de filtre, ±1,5 dB ;
 *    sons tonals : jamais désaccordés, vélocité ±2 dB, micro-décalages de 5–15 ms dans les arpèges ;
 *  - IMPACTS pour téléphone : un transitoire 2–5 kHz + un corps + une couche saturée 150–500 Hz (la « fondamentale
 *    manquante » : le cerveau reconstruit le grave que le petit haut-parleur ne sort pas) ;
 *  - plafond de voix (24) et débit limité des tics (35 ms) ; premier son de la session à −6 dB, remonte en 30 s.
 *
 * Batterie : le contexte audio (réverbe à convolution + compresseur, qui tournent en continu sur le thread audio même
 * sans aucun son) est mis en veille après quelques secondes de silence et dès que l'onglet est caché ; il se réveille
 * tout seul au son suivant (~10 ms).
 */
/** Silence avant la mise en veille : plus long que le plus long son (chœur 5,2 s) + la queue de réverbe. */
const IDLE_MS = 9000;
/** sol majeur pentatonique, en demi-tons depuis G4 (392 Hz) : sol la si ré mi */
const PENTA = [0, 2, 4, 7, 9];
const G4 = 392;
/** fréquence du `deg`-ième degré de la gamme (0 = sol4), transposée de `semis` demi-tons */
export const scaleHz = (deg: number, semis = 0) => G4 * Math.pow(2, (PENTA[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5) + semis) / 12);
/** cale une fréquence sur le degré de la gamme le plus proche (le carillon historique à 392 Hz reste sol4) */
export function quantize(hz: number, semis = 0): number {
  let best = hz, dist = Infinity;
  for (let deg = -10; deg < 20; deg++) {
    const f = scaleHz(deg, semis);
    const d = Math.abs(Math.log2(f / hz));
    if (d < dist) (dist = d), (best = f);
  }
  return best;
}
/** ±pct de variation multiplicative (anti-habituation) */
const vary = (pct: number) => 1 + (Math.random() * 2 - 1) * pct;
/** ±dB de variation de vélocité */
const varyDb = (db: number) => Math.pow(10, ((Math.random() * 2 - 1) * db) / 20);

type Bus = 'ui' | 'feedback' | 'reward' | 'event' | 'ambience';

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

  constructor() {
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.nap();
      });
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
      for (const b of ['ui', 'feedback', 'reward', 'event', 'ambience'] as Bus[]) {
        const g = ctx.createGain();
        g.connect(master);
        buses[b] = g;
      }
      const verb = ctx.createConvolver();
      // réponse impulsionnelle courte et lumineuse (1,4 s ; téléphone : tronquée à 1,2 s, création moins chère)
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      verb.buffer = this.impulse(ctx, 1.4, 2.6, touch ? 1.2 : 1.4);
      const send = ctx.createGain();
      send.gain.value = 0.28;
      const ret = ctx.createGain();
      send.connect(verb).connect(ret).connect(master);
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
    await this.ctx.resume();
    this.enabled = true;
    if (this.ctx.state === 'running') this.wake(); // veille armée dès l'activation (aucun son → suspendu au bout de 9 s)
  }

  disable() {
    this.stopMusic(0.05);
    this.enabled = false;
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
    const t = this.ctx.currentTime;
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
    const t = this.ctx.currentTime;
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
    // tant que la musique joue, le contexte ne se met pas en veille
    const keep = window.setInterval(() => (this.music?.src === src ? this.wake() : clearInterval(keep)), 4000);
  }
  /** Arrête la musique en cours (fondu `fade` s). */
  stopMusic(fade = 0.6) {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
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
      for (let i = 0; i < len; i++) {
        const f = fadeN && i > len - fadeN ? (len - i) / fadeN : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / total, decay) * f;
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

  /** Petit clic sec (flip, UI) — bus feedback, débit limité à un tic / 35 ms, variation ±4 % / ±1,5 dB. */
  tick(pitch = 1, vol = 0.25) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    if (t - this.lastTick < 0.035) return;
    this.lastTick = t;
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
  whoosh(dur = 0.45, vol = 0.3, up = true) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = c.currentTime;
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
  tear(dur = 0.6, vol = 0.35) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = c.currentTime;
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
  thump(vol = 0.6, low = 46) {
    if (!this.ok || !this.voice(0.5)) return;
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
  chime(tier = 2, vol = 0.22, base = 392, at = 0) {
    if (!this.ok || !this.voice(1.5 + tier * 0.4)) return;
    const c = this.ctx!, t = c.currentTime + at;
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
  note(deg: number, vol = 0.15, dur = 0.8, at = 0) {
    if (!this.ok || !this.voice(dur)) return;
    const c = this.ctx!, t = c.currentTime + at;
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
    const c = this.ctx!, t0 = c.currentTime;
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
  coin(deg = 0, vol = 0.09) {
    if (!this.ok || !this.voice(0.25)) return;
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
  crack(vol = 0.5) {
    if (!this.ok || !this.voice(0.3)) return;
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t0 = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
    const c = this.ctx!, t = c.currentTime;
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
        .catch(() => null);
      this.samples.set(url, p);
    }
    return p;
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
    s.start();
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
