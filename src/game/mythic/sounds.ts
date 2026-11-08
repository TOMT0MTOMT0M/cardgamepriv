/**
 * SONS DES SCÈNES 6★ — 100 % synthétisés (Web Audio), comme le reste du jeu : aucun fichier, aucun son repris d'un jeu,
 * d'un film ou d'une marque. Tout passe par la chaîne du jeu (`Sfx.rig()` : bus « event », compresseur, limiteur,
 * volume général) : coupé quand le son du jeu est coupé.
 *
 * Deux primitives (`tone`, `hiss`) et une trentaine de sons composés à partir d'elles. Chaque son part « maintenant » :
 * les scènes les placent dans leur timeline (`tl.call`), donc la version courte (timeline accélérée) suit toute seule.
 */
import type { Sfx } from '../../core/audio';

type Filt = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';
interface ToneO {
  f: number;
  /** glissando vers… (exponentiel) */
  f2?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  /** décalage (s) */
  at?: number;
  /** attaque (s) */
  a?: number;
  wet?: number;
  /** passe-bas (Hz) */
  lp?: number;
  /** vibrato : [Hz, profondeur en Hz] */
  vib?: [number, number];
  /** tenue avant la chute (0..1 de la durée) */
  hold?: number;
  /** saturation douce */
  drive?: boolean;
  /** rafale de petits coups dans UNE seule voix : [décalage (s), gain 0..1] (crépitement, grillons…) */
  gates?: Array<[number, number]>;
}
interface HissO {
  dur: number;
  vol?: number;
  type?: Filt;
  f?: number;
  f2?: number;
  q?: number;
  at?: number;
  a?: number;
  wet?: number;
  hold?: number;
  /** grésillement : gain haché (n coupures par seconde) */
  chop?: number;
  gates?: Array<[number, number]>;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** sol majeur pentatonique transposé en la (la 6★ module en la majeur, charte sonore) */
const PENTA = [0, 2, 4, 7, 9];
const A4 = 440;
export const deg = (d: number) => A4 * Math.pow(2, (PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5)) / 12);

export function soundKit(sfx: Sfx) {
  const rig = () => sfx.rig();

  function env(g: GainNode, t: number, a: number, peak: number, d: number, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.003, a));
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + d * hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /** enveloppe en rafale : un coup de `len` s à chaque porte */
  function gated(g: GainNode, t: number, peak: number, gates: Array<[number, number]>, len = 0.012) {
    g.gain.setValueAtTime(0, t);
    for (const [dt, k] of gates.sort((a, b) => a[0] - b[0])) {
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(peak * k, t + dt + 0.002);
      g.gain.linearRampToValueAtTime(0, t + dt + len);
    }
  }

  function tone(o: ToneO) {
    const r = rig();
    if (!r || !r.voice(o.dur + (o.at ?? 0))) return;
    const { c } = r;
    const t = r.t + (o.at ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + o.dur);
    let node: AudioNode = osc;
    if (o.vib) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.05);
    }
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node = node.connect(f);
    }
    if (o.drive) node = node.connect(r.shaper);
    const g = c.createGain();
    if (o.gates) gated(g, t, o.vol ?? 0.2, o.gates, 0.03);
    else env(g, t, o.a ?? 0.005, o.vol ?? 0.2, o.dur, o.hold);
    node.connect(g);
    osc.start(t);
    osc.stop(t + (o.a ?? 0.005) + o.dur + 0.05);
    r.out(g, o.wet ?? 0.25);
  }

  function hiss(o: HissO) {
    const r = rig();
    if (!r || !r.voice(o.dur + (o.at ?? 0))) return;
    const { c } = r;
    const t = r.t + (o.at ?? 0);
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 1800, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    if (o.gates) gated(g, t, o.vol ?? 0.2, o.gates);
    else env(g, t, o.a ?? 0.004, o.vol ?? 0.2, o.dur, o.hold);
    let src: AudioNode = r.noise(t, o.dur + (o.a ?? 0));
    if (o.chop) {
      const ch = c.createGain();
      const n = Math.floor(o.dur * o.chop);
      for (let i = 0; i < n; i++) ch.gain.setValueAtTime(Math.random() < 0.55 ? rnd(0.2, 1) : 0.02, t + i / o.chop);
      src = src.connect(ch);
    }
    src.connect(f).connect(g);
    r.out(g, o.wet ?? 0.2);
  }

  /** impact « frappe » : transitoire + corps qui chute (pour un téléphone : harmoniques saturées) */
  const hit = (vol = 0.5, low = 55) => {
    hiss({ dur: 0.02, vol: vol * 0.5, f: 3600, q: 1.4 });
    tone({ f: low * 2.6, f2: low, dur: 0.38, vol, drive: true, lp: 900, wet: 0.15 });
  };

  return {
    tone,
    hiss,
    hit,
    /** souffle qui passe */
    whoosh: (dur = 0.45, vol = 0.25, up = true) => hiss({ dur, vol, f: up ? 300 : 2400, f2: up ? 2600 : 280, q: 1.2, a: dur * 0.5 }),
    /** tic sec (roulette, défilement) */
    tick: (pitch = 1, vol = 0.18) => hiss({ dur: 0.04, vol, f: 2600 * pitch, q: 4, wet: 0.05 }),
    /** montée de tension */
    riser: (dur = 1.2, vol = 0.18) => {
      hiss({ dur, vol, f: 400, f2: 5200, q: 2, a: dur * 0.9 });
      tone({ f: 220, f2: 880, dur, vol: vol * 0.5, type: 'sawtooth', lp: 2400, a: dur * 0.9 });
    },
    /** note de la gamme (la majeur pentatonique) */
    note: (d: number, vol = 0.14, dur = 0.6, at = 0, type: OscillatorType = 'triangle') => tone({ f: deg(d), dur, vol, at, type, wet: 0.35 }),
    /** CLOCHE (ring, cloche de service) : partiels inharmoniques qui s'éteignent */
    bell: (f = 1320, vol = 0.22, dur = 1.6) => {
      for (const [k, v] of [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]] as const) tone({ f: f * k, dur: dur / Math.sqrt(k), vol: vol * v, wet: 0.4 });
      hiss({ dur: 0.02, vol: vol * 0.6, f: 5000, q: 2 });
    },
    /** SIFFLET d'arbitre : sinus aigu avec roulement (vibrato rapide) + souffle */
    whistle: (dur = 0.6, vol = 0.16) => {
      tone({ f: 2900, dur, vol, vib: [38, 160], hold: 0.8, a: 0.02, wet: 0.2 });
      hiss({ dur, vol: vol * 0.4, f: 3000, q: 3, hold: 0.8 });
    },
    /** SIRÈNE de fin de temps (buzzer) */
    buzzer: (dur = 0.9, vol = 0.2) => {
      tone({ f: 233, dur, vol, type: 'square', lp: 1800, hold: 0.85, a: 0.01, wet: 0.1 });
      tone({ f: 466.5, dur, vol: vol * 0.5, type: 'sawtooth', lp: 2400, hold: 0.85, a: 0.01, wet: 0.1 });
    },
    /** MOTEUR qui rugit (dents de scie, montée de régime, saturé) */
    engine: (dur = 1.4, vol = 0.22, from = 55, to = 190) => {
      tone({ f: from, f2: to, dur, vol, type: 'sawtooth', lp: 1400, drive: true, a: 0.08, hold: 0.4, vib: [24, 6] });
      tone({ f: from * 1.5, f2: to * 1.5, dur, vol: vol * 0.45, type: 'square', lp: 900, a: 0.1, hold: 0.4 });
      hiss({ dur, vol: vol * 0.3, type: 'lowpass', f: 900, a: 0.05 });
    },
    /** CLAMEUR de stade : bruit large bande qui enfle, quelques « hé ! » */
    crowd: (dur = 2, vol = 0.2) => {
      hiss({ dur, vol, f: 900, f2: 1300, q: 0.5, a: dur * 0.45, hold: 0.3, wet: 0.5 });
      hiss({ dur, vol: vol * 0.5, f: 2400, q: 0.8, a: dur * 0.5, wet: 0.5 });
      for (let i = 0; i < 3; i++) tone({ f: rnd(260, 420), f2: rnd(200, 300), dur: 0.25, vol: vol * 0.18, type: 'sawtooth', lp: 1200, at: rnd(0.3, dur * 0.8), wet: 0.6 });
    },
    /** DÉCLENCHEUR + flash d'appareil photo */
    shutter: (vol = 0.2) => {
      hiss({ dur: 0.015, vol, f: 4200, q: 2 });
      hiss({ dur: 0.03, vol: vol * 0.7, f: 2400, q: 3, at: 0.05 });
      tone({ f: 5200, f2: 7800, dur: 0.12, vol: vol * 0.08, at: 0.06 });
    },
    /** CRÉPITEMENT de vinyle */
    crackle: (dur = 1.5, vol = 0.12) => {
      hiss({ dur, vol: vol * 0.25, type: 'highpass', f: 3000, hold: 0.9 });
      hiss({ dur, vol, f: 2600, q: 0.8, wet: 0, gates: Array.from({ length: Math.round(dur * 26) }, () => [Math.random() * dur, rnd(0.25, 1)] as [number, number]) });
    },
    /** NEIGE de télé */
    staticNoise: (dur = 0.8, vol = 0.14) => hiss({ dur, vol, type: 'highpass', f: 1200, hold: 0.85, a: 0.01, wet: 0.05 }),
    /** télé cathodique qui s'allume : sifflement haut + claquement */
    tvOn: (vol = 0.16) => {
      tone({ f: 15600, dur: 1.2, vol: vol * 0.08, hold: 0.7 });
      hit(vol * 0.6, 70);
    },
    /** petit jingle 8 bits ORIGINAL (carré, gamme du jeu) */
    chip: (vol = 0.1) => {
      [0, 2, 4, 5, 7, 9].forEach((d, i) => tone({ f: deg(d + 5), dur: 0.09, vol, type: 'square', at: i * 0.075, wet: 0.05, hold: 0.6 }));
      tone({ f: deg(12), dur: 0.36, vol, type: 'square', at: 0.48, wet: 0.1, hold: 0.5 });
      tone({ f: deg(7), dur: 0.36, vol: vol * 0.6, type: 'square', at: 0.48, wet: 0.1, hold: 0.5 });
    },
    /** cartouche enfoncée */
    slot: (vol = 0.25) => {
      hiss({ dur: 0.05, vol, f: 1800, q: 3 });
      tone({ f: 180, f2: 90, dur: 0.12, vol: vol * 0.8, at: 0.02 });
    },
    /** ronron du projecteur de cinéma (claquement régulier) */
    projector: (dur = 2, vol = 0.1) => hiss({ dur, vol, f: 1400, q: 2, chop: 24, hold: 0.9, wet: 0.2 }),
    /** BOING (dessin animé) */
    boing: (vol = 0.18) => tone({ f: 180, f2: 520, dur: 0.5, vol, type: 'triangle', vib: [16, 40], wet: 0.2 }),
    /** NOTIFICATION (deux notes) + vibreur */
    notif: (vol = 0.14) => {
      tone({ f: deg(7), dur: 0.18, vol, wet: 0.3 });
      tone({ f: deg(9), dur: 0.35, vol, at: 0.12, wet: 0.3 });
    },
    buzz: (dur = 0.4, vol = 0.16) => tone({ f: 120, dur, vol, type: 'square', lp: 300, hold: 0.9, vib: [30, 20] }),
    /** GRÉSILLEMENT (plat chaud) */
    sizzle: (dur = 1.4, vol = 0.12) => hiss({ dur, vol, type: 'highpass', f: 4200, chop: 60, a: 0.1, hold: 0.6, wet: 0.2 }),
    /** CLAQUEMENT métallique (casier, projecteur de stade, chute dans un distributeur) */
    clank: (vol = 0.25, f = 420) => {
      for (const k of [1, 2.3, 3.9]) tone({ f: f * k * rnd(0.97, 1.03), dur: 0.35 / k, vol: vol / k, type: 'square', lp: 3000, wet: 0.35 });
      hiss({ dur: 0.04, vol, f: 2500, q: 2 });
    },
    /** projecteur qui claque (gros interrupteur + bourdon électrique) */
    flood: (vol = 0.24) => {
      hit(vol, 48);
      tone({ f: 100, dur: 0.7, vol: vol * 0.15, type: 'sawtooth', lp: 400, at: 0.02 });
    },
    /** lame : « shing » métallique résonant */
    shing: (vol = 0.18) => {
      hiss({ dur: 0.5, vol, f: 5200, f2: 8800, q: 12 });
      tone({ f: 3300, dur: 0.9, vol: vol * 0.35, wet: 0.5 });
      tone({ f: 4950, dur: 0.6, vol: vol * 0.18, wet: 0.5 });
    },
    /** bip électronique (chrono, compte à rebours) */
    beep: (f = 1320, vol = 0.12, dur = 0.12) => tone({ f, dur, vol, type: 'square', lp: 4000, hold: 0.8, wet: 0.1 }),
    /** ballon / balle qui rebondit */
    bounce: (vol = 0.25) => {
      tone({ f: 160, f2: 60, dur: 0.16, vol });
      hiss({ dur: 0.03, vol: vol * 0.5, f: 1200, q: 2 });
    },
    /** gong (combat, esport) */
    gong: (vol = 0.2) => {
      for (const [k, v] of [[1, 1], [1.48, 0.6], [2.1, 0.4], [2.9, 0.2]] as const) tone({ f: 110 * k, dur: 2.2, vol: vol * v, wet: 0.6, vib: [3, 1.5] });
      hiss({ dur: 0.05, vol: vol * 0.7, f: 1500, q: 1 });
    },
    /** gazouillis d'oiseau (sinus qui glisse) */
    chirp: (vol = 0.08) => {
      const f = rnd(2600, 4200);
      tone({ f, f2: f * rnd(1.2, 1.6), dur: 0.08, vol, wet: 0.5 });
      tone({ f: f * 1.1, f2: f * 0.8, dur: 0.1, vol, at: 0.11, wet: 0.5 });
    },
    /**
     * AMBIANCE (savane, forêt, océan, glace, ville, nuit) : nappe de bruit filtré + petits événements.
     */
    ambience: (kind: 'savane' | 'foret' | 'ocean' | 'glace' | 'ville' | 'nuit', dur = 3, vol = 0.12) => {
      if (kind === 'ocean') {
        for (let i = 0; i < 3; i++) hiss({ dur: 1.4, vol, type: 'lowpass', f: 500, f2: 1600, a: 0.7, at: i * 1.0, wet: 0.6 });
        return;
      }
      if (kind === 'glace') {
        hiss({ dur, vol: vol * 0.8, f: 600, q: 0.7, a: dur * 0.4, hold: 0.3, wet: 0.7 });
        tone({ f: deg(14), dur: dur * 0.8, vol: vol * 0.15, a: 0.8, wet: 0.8 });
        return;
      }
      const base = kind === 'foret' ? 1100 : kind === 'savane' ? 700 : kind === 'ville' ? 400 : 300;
      hiss({ dur, vol: vol * 0.7, type: kind === 'ville' ? 'lowpass' : 'bandpass', f: base, q: 0.6, a: dur * 0.3, hold: 0.4, wet: 0.6 });
      // grillons (nuit) : une seule voix en rafale
      if (kind === 'nuit') tone({ f: 4300, dur, vol: vol * 0.3, wet: 0.4, gates: Array.from({ length: 12 }, (_, i) => [0.2 + i * 0.22 + (i % 2) * 0.04, 1] as [number, number]) });
      if (kind === 'foret' || kind === 'savane')
        for (let i = 0; i < (kind === 'foret' ? 3 : 2); i++) {
          const at = rnd(0.2, dur * 0.8);
          const f = rnd(2600, 4200);
          tone({ f, f2: f * rnd(1.2, 1.6), dur: 0.08, vol: vol * 0.6, at, wet: 0.5 });
          tone({ f: f * 1.1, f2: f * 0.8, dur: 0.1, vol: vol * 0.6, at: at + 0.11, wet: 0.5 });
        }
    },
    /** feux de départ : bip grave par feu */
    light: (vol = 0.14) => tone({ f: 660, dur: 0.18, vol, type: 'square', lp: 2200, hold: 0.7, wet: 0.15 }),
    /** chiffre qui défile vite (compteur) */
    roll: (dur = 0.6, vol = 0.1) => hiss({ dur, vol, f: 3200, q: 6, chop: 40, hold: 0.9 }),
    /** déchirure d'air (coupe nette, lame, fente de case de manga) */
    slash: (vol = 0.26) => {
      hiss({ dur: 0.18, vol, f: 6000, f2: 900, q: 1.5 });
      hit(vol * 0.7, 70);
    },
    /** grondement sourd (globe, tunnel) */
    rumble: (dur = 1.4, vol = 0.2) => tone({ f: 46, f2: 38, dur, vol, type: 'sawtooth', lp: 160, a: dur * 0.3, hold: 0.4, vib: [7, 3] }),
    /** tampon (carte postale) */
    stamp: (vol = 0.3) => {
      hit(vol, 60);
      hiss({ dur: 0.06, vol: vol * 0.5, f: 900, q: 1 });
    },
  };
}

export type SoundKit = ReturnType<typeof soundKit>;
