/**
 * Sound design 100 % synthétisé (Web Audio). Coupé par défaut ; activé par le bouton 🔈 du shell.
 * Chaque son est court, filtré, et passe par une petite réverb générée : pas de "bip" nu.
 */
export class Sfx {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private verbSend: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  async enable(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp).connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(ctx, 2.4, 2.8);
      const send = ctx.createGain();
      send.gain.value = 0.28;
      send.connect(verb).connect(master);
      const len = ctx.sampleRate * 2;
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.verbSend = send;
      this.noiseBuf = nb;
    }
    await this.ctx.resume();
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    void this.ctx?.suspend();
  }

  private impulse(ctx: AudioContext, seconds: number, decay: number) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private get ok() {
    return this.enabled && !!this.ctx && this.ctx.state === 'running';
  }

  private out(g: AudioNode, wet = 0.5) {
    g.connect(this.master!);
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  /** Petit clic sec (flip, UI). */
  tick(pitch = 1, vol = 0.25) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 * pitch;
    f.Q.value = 3;
    const g = c.createGain();
    this.env(g, t, 0.002, vol, 0.05);
    this.noise(t, 0.08).connect(f).connect(g);
    this.out(g, 0.15);
  }

  /** Souffle d'air (mouvement rapide). */
  whoosh(dur = 0.45, vol = 0.3, up = true) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 300 : 2200, t);
    f.frequency.exponentialRampToValueAtTime(up ? 2400 : 280, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur).connect(f).connect(g);
    this.out(g, 0.35);
  }

  /** Déchirure : bruit granuleux modulé. */
  tear(dur = 0.6, vol = 0.35) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const steps = Math.floor(dur * 70);
    for (let i = 0; i < steps; i++) {
      const tt = t + (i / steps) * dur;
      g.gain.setValueAtTime(vol * (0.15 + Math.random() * 0.85) * (1 - (i / steps) * 0.5), tt);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    this.noise(t, dur).connect(f).connect(g);
    this.out(g, 0.25);
  }

  /** Impact sourd (pose, payoff). */
  thump(vol = 0.6, low = 46) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
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
  }

  /** Montée de tension (suspense). */
  riser(dur = 1.5, tier = 2, vol = 0.22) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(1800 + tier * 500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    this.noise(t, dur + 0.1).connect(f).connect(g);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(110 * Math.pow(2, 1 + tier * 0.25), t + dur);
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

  /** Cloche inharmonique : récompense. Plus de partiels selon la rareté. */
  chime(tier = 2, vol = 0.22, base = 392) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const ratios = [1, 2.0, 2.76, 4.07, 5.4, 6.8].slice(0, 2 + Math.min(4, tier));
    ratios.forEach((r, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * r * (1 + (Math.random() - 0.5) * 0.004);
      const g = c.createGain();
      this.env(g, t + i * 0.012, 0.004, vol / (1 + i * 0.7), 1.4 + tier * 0.4 - i * 0.15);
      o.connect(g);
      o.start(t);
      o.stop(t + 3.5);
      this.out(g, 0.6);
    });
  }

  /** Nappe scintillante (rareté haute). */
  shimmer(tier = 4, dur = 2.2, vol = 0.12) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const notes = [0, 7, 12, 16, 19, 24].slice(0, 2 + tier);
    notes.forEach((n, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = 523.25 * Math.pow(2, n / 12);
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
      this.out(g, 0.8);
    });
  }

  /** Craquement sec (verre, fracture). */
  crack(vol = 0.5) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    for (let k = 0; k < 4; k++) {
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500 + Math.random() * 3000;
      const g = c.createGain();
      this.env(g, t + k * 0.018 + Math.random() * 0.01, 0.001, vol * (1 - k * 0.2), 0.08 + Math.random() * 0.1);
      this.noise(t, 0.3).connect(f).connect(g);
      this.out(g, 0.5);
    }
  }

  /** Grondement grave. */
  rumble(dur = 1.2, vol = 0.4) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 140;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noise(t, dur).connect(f).connect(g);
    this.out(g, 0.3);
  }
}
