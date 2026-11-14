/**
 * SONS DES SCÈNES 6★ — (son V2, 11/11) sur le système son V2 du jeu : chaque bruitage (cloche, sifflet, moteur, foule,
 * déclencheur, gong…) est un son CUIT (core/sound/mythicBank.ts : matières, attaques arrondies, aigus feutrés), cuit dans
 * le Worker dès qu'un booster contient une 6★ (`prepareMythic`) ; les impacts sont ceux du jeu (land / thud / boom) ;
 * les souffles et les montées SUIVENT LA COURBE de l'animation qu'ils accompagnent (`whoosh(…, ease)` : la vitesse de
 * l'ease, timeline accélérée comprise) ; le moteur (runtime.ts `at`) programme chaque son en avance sur l'horloge audio
 * pour qu'il sorte pile sur l'image. Aucun fichier, aucun son repris d'un jeu, d'un film ou d'une marque.
 *
 * Tant que la banque n'est pas cuite (toute première seconde, vieux navigateur), la synthèse d'origine (`legacy`, deux
 * primitives `tone` / `hiss`) joue à sa place. Tout passe par la chaîne du jeu (bus « event », feutre, compresseur,
 * limiteur, volume général) : coupé quand le son du jeu est coupé. Chaque son part « maintenant » : les scènes les
 * placent dans leur timeline (`k.at`), donc la version courte suit toute seule.
 */
import gsap from 'gsap';
import type { PlayO, Sfx } from '../../core/audio';
import { ENGINE_S, SWELL_S } from '../../core/sound/mythicBank';
import type { Ease } from '../../core/sound/motion';
import { EASE } from '../../core/ease';

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

/** courbe d'une animation gsap (« power3.out »…) ou fonction : ce que le souffle doit suivre */
type EaseLike = string | Ease;
const easeOf = (e?: EaseLike): Ease | undefined => (typeof e === 'function' ? e : e ? (gsap.parseEase(e) as Ease) : undefined);

/**
 * NIVEAUX des sons cuits des scènes (crête −6 dBFS) face à l'ancienne synthèse au même `vol` : ~×2 rendrait la même
 * crête ; un peu moins, la direction V2 est « étouffée ». À régler à l'oreille (voir docs du chantier son).
 */
const L = { bell: 1.6, whistle: 1.3, buzzer: 1.3, engine: 1.4, crowd: 1.7, shutter: 1.6, crackle: 1.2, snow: 0.9, tvOn: 1.5, chip: 1.5, slot: 1.6, projector: 1.4, boing: 1.6, buzz: 1.4, sizzle: 1.2, clank: 1.6, flood: 1.5, shing: 1.4, beep: 1.4, bounce: 1.8, gong: 1.6, chirp: 1.3, cricket: 1.0, roll: 1.3, slash: 1.6, rumble: 1.8, swell: 1.2, tick: 0.85 };

/** `speed()` : vitesse de la timeline de la scène (version courte ×2,2) — un souffle dure ce que dure le geste réel */
export function soundKit(sfx: Sfx, speed: () => number = () => 1) {
  const rig = () => sfx.rig();
  // (son V2) cuisson à la demande, si `prepareMythic` ne l'a pas déjà lancée (labo, visionneuse)
  sfx.loadBook('mythic');

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

  const legacy = {
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

  /** joue un son cuit des scènes 6★ sur le bus « event » ; faux s'il n'est pas (encore) cuit */
  const P = (id: string, o: PlayO = {}) => sfx.play(id, { bus: 'event', wet: 0.22, ...o });
  /** texture en boucle à la durée voulue, départ au hasard, fondus doux */
  const T = (id: string, dur: number, o: PlayO = {}) => sfx.play(id, { bus: 'event', wet: 0.2, loop: true, dur, offset: Math.random() * 0.8, fadeIn: Math.min(0.08, dur * 0.2), ...o });
  const sp = () => Math.max(0.2, speed());
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  /** note de la gamme des 6★ (la majeur pentatonique : sol + 2 demi-tons, charte sonore), lame de bois feutrée du jeu */
  const noteLa = (d: number, vol: number, dur: number, at = 0) => {
    const keep = sfx.transpose;
    sfx.transpose = 2;
    sfx.note(d, vol, dur, at);
    sfx.transpose = keep;
  };
  /** impact : les coups cuits du jeu (pat / coup feutré / grand impact selon la force), grave réglé par `low` */
  const hitV2 = (vol = 0.5, low = 55) => {
    if (sfx.has('thud')) sfx.thump(vol, low, 0, 'event');
    else legacy.hit(vol, low);
  };

  return {
    /** primitives brutes (gardées pour les rares sons sur mesure des scènes) */
    tone,
    /** bruit filtré : (V2) un lit de texture cuite (air / papier), même filtre, même enveloppe */
    hiss: (o: HissO) => {
      if (o.gates || !sfx.bed(o.dur, { vol: o.vol ?? 0.2, type: o.type, f: o.f, f2: o.f2, q: o.q, at: o.at, a: o.a, hold: o.hold, wet: o.wet })) hiss(o);
    },
    hit: hitV2,
    /**
     * souffle qui passe — `ease` : la courbe du mouvement qu'il accompagne (« power3.out »…) ; le souffle suit sa
     * vitesse (fort là où ça va vite). Sans courbe : sortie douce.
     */
    whoosh: (dur = 0.45, vol = 0.25, up = true, ease?: EaseLike) => {
      if (!sfx.sweep(dur / sp(), { vol: vol * 0.9, up, ease: easeOf(ease), bus: 'event', lo: 320, hi: dur < 0.34 ? 2200 : 1700 })) legacy.whoosh(dur, vol, up);
    },
    /** tic feutré (roulette, défilement) */
    tick: (pitch = 1, vol = 0.18) => {
      if (!P('tick', { rate: clamp(pitch, 0.5, 2.6), vol: vol * L.tick, wet: 0.05 })) legacy.tick(pitch, vol);
    },
    /**
     * montée de tension : souffle qui ENFLE (départ retenu, `EASE.heave` par défaut : il culmine à l'arrivée, là où tombe
     * l'impact) + nappe tonale qui monte et finit toujours à son sommet, quelle que soit la durée
     */
    riser: (dur = 1.2, vol = 0.18, ease?: EaseLike) => {
      const d = dur / sp();
      const a = sfx.sweep(d, { vol: vol * 0.8, up: true, ease: easeOf(ease) ?? EASE.heave, bus: 'event', tex: 'air', lo: 380, hi: 2600 });
      const b = P('mSwell', { vol: vol * L.swell, offset: Math.max(0, SWELL_S - d), rate: d > SWELL_S ? SWELL_S / d : 1, vary: false, wet: 0.35 });
      if (!a && !b) legacy.riser(dur, vol);
    },
    /** note de la gamme (la majeur pentatonique) */
    note: (d: number, vol = 0.14, dur = 0.6, at = 0, type: OscillatorType = 'triangle') => {
      if (sfx.has('note5')) noteLa(d, vol, dur, at);
      else legacy.note(d, vol, dur, at, type);
    },
    /** CLOCHE (ring, cloche de service) : bol frappé au maillet feutré ; `f` = hauteur */
    bell: (f = 1320, vol = 0.22, dur = 1.6) => {
      if (!P('mBell', { rate: f / 1150, vol: vol * L.bell, dur: Math.max(0.3, dur), vary: false, wet: 0.4 })) legacy.bell(f, vol, dur);
    },
    /** SIFFLET d'arbitre */
    whistle: (dur = 0.6, vol = 0.16) => {
      if (!P('mWhistle', { vol: vol * L.whistle, dur, wet: 0.2 })) legacy.whistle(dur, vol);
    },
    /** SIRÈNE de fin de temps (corne feutrée) */
    buzzer: (dur = 0.9, vol = 0.2) => {
      if (!P('mBuzzer', { vol: vol * L.buzzer, dur, wet: 0.12 })) legacy.buzzer(dur, vol);
    },
    /** MOTEUR qui monte en régime (de `from` Hz, sur `dur` s) */
    engine: (dur = 1.4, vol = 0.22, from = 55, to = 190) => {
      if (!P('mEngine', { rate: clamp((from / 55) * Math.pow(ENGINE_S / Math.max(0.3, dur), 0.25), 0.6, 2), vol: vol * L.engine, dur, wet: 0.15 })) legacy.engine(dur, vol, from, to);
    },
    /** CLAMEUR de stade (enfle, voix éparses) */
    crowd: (dur = 2, vol = 0.2) => {
      if (!P('mCrowd', { rate: clamp(1.8 / dur, 0.85, 1.4), vol: vol * L.crowd, dur, wet: 0.5 })) legacy.crowd(dur, vol);
    },
    /** DÉCLENCHEUR d'appareil photo (rideau mécanique) */
    shutter: (vol = 0.2) => {
      if (!P('mShutter', { vol: vol * L.shutter, wet: 0.12 })) legacy.shutter(vol);
    },
    /** CRÉPITEMENT de vinyle */
    crackle: (dur = 1.5, vol = 0.12) => {
      if (!T('mCrackle', dur, { vol: vol * L.crackle, wet: 0.05 })) legacy.crackle(dur, vol);
    },
    /** NEIGE de télé (feutrée) */
    staticNoise: (dur = 0.8, vol = 0.14) => {
      if (!T('mSnow', dur, { vol: vol * L.snow, fadeIn: 0.01, wet: 0.05 })) legacy.staticNoise(dur, vol);
    },
    /** télé cathodique qui s'allume */
    tvOn: (vol = 0.16) => {
      if (!P('mTvOn', { vol: vol * L.tvOn, wet: 0.15 })) legacy.tvOn(vol);
    },
    /** petit jingle 8 bits ORIGINAL (carré adouci, gamme du jeu) */
    chip: (vol = 0.1) => {
      if (!P('mChip', { vol: vol * L.chip, vary: false, wet: 0.1 })) legacy.chip(vol);
    },
    /** cartouche enfoncée */
    slot: (vol = 0.25) => {
      if (!P('mSlot', { vol: vol * L.slot, wet: 0.08 })) legacy.slot(vol);
    },
    /** ronron du projecteur de cinéma */
    projector: (dur = 2, vol = 0.1) => {
      if (!T('mProjector', dur, { vol: vol * L.projector, fadeIn: 0.15 })) legacy.projector(dur, vol);
    },
    /** BOING (dessin animé) */
    boing: (vol = 0.18) => {
      if (!P('mBoing', { vol: vol * L.boing, wet: 0.2 })) legacy.boing(vol);
    },
    /** NOTIFICATION (deux notes de la gamme) */
    notif: (vol = 0.14) => {
      if (!sfx.has('note5')) return legacy.notif(vol);
      noteLa(7, vol, 0.25);
      noteLa(9, vol, 0.4, 0.12);
    },
    /** vibreur de téléphone posé sur une table */
    buzz: (dur = 0.4, vol = 0.16) => {
      if (!P('mBuzz', { vol: vol * L.buzz, dur, rate: dur > 0.8 ? 0.8 / dur : 1, wet: 0.05 })) legacy.buzz(dur, vol);
    },
    /** GRÉSILLEMENT (plat chaud) */
    sizzle: (dur = 1.4, vol = 0.12) => {
      if (!T('mSizzle', dur, { vol: vol * L.sizzle, fadeIn: 0.12 })) legacy.sizzle(dur, vol);
    },
    /** CLAQUEMENT métallique (casier, distributeur) ; `f` = hauteur */
    clank: (vol = 0.25, f = 420) => {
      if (!P('mClank', { rate: clamp(f / 420, 0.4, 2.5), vol: vol * L.clank, wet: 0.3 })) legacy.clank(vol, f);
    },
    /** projecteur de stade (gros interrupteur + bourdon) */
    flood: (vol = 0.24) => {
      if (!P('mFlood', { vol: vol * L.flood, wet: 0.2 })) legacy.flood(vol);
    },
    /** lame : « shing » métallique */
    shing: (vol = 0.18) => {
      if (!P('mShing', { vol: vol * L.shing, wet: 0.45 })) legacy.shing(vol);
    },
    /** bip électronique (chrono, compte à rebours) ; `f` = hauteur */
    beep: (f = 1320, vol = 0.12, dur = 0.12) => {
      if (!P('mBeep', { rate: clamp(f / 1320, 0.3, 2), vol: vol * L.beep, dur: Math.max(0.05, dur * 1.3), vary: false, wet: 0.1 })) legacy.beep(f, vol, dur);
    },
    /** ballon / balle qui rebondit */
    bounce: (vol = 0.25) => {
      if (!P('mBounce', { vol: vol * L.bounce, wet: 0.08 })) legacy.bounce(vol);
    },
    /** gong (combat, esport) */
    gong: (vol = 0.2) => {
      if (!P('mGong', { vol: vol * L.gong, vary: false, wet: 0.55 })) legacy.gong(vol);
    },
    /** gazouillis d'oiseau */
    chirp: (vol = 0.08) => {
      if (!P('mChirp', { vol: vol * L.chirp, wet: 0.5 })) legacy.chirp(vol);
    },
    /**
     * AMBIANCE (savane, forêt, océan, glace, ville, nuit) : lit de texture filtré + petits événements cuits
     */
    ambience: (kind: 'savane' | 'foret' | 'ocean' | 'glace' | 'ville' | 'nuit', dur = 3, vol = 0.12) => {
      if (!sfx.has('mCrickets') || !sfx.has('air')) return legacy.ambience(kind, dur, vol);
      const bed = (d: number, o: Parameters<Sfx['bed']>[1]) => sfx.bed(d, { bus: 'event', ...o });
      if (kind === 'ocean') {
        // trois vagues : chacune enfle puis se retire (respiration lente du filtre)
        for (let i = 0; i < 3; i++) bed(1.4, { vol: vol * 1.1, type: 'lowpass', f: 500, f2: 1500, a: 0.7, at: i * 1.0, wet: 0.6 });
        return;
      }
      if (kind === 'glace') {
        bed(dur, { vol: vol * 0.8, f: 600, q: 0.7, a: dur * 0.4, hold: 0.3, wet: 0.7 });
        noteLa(14, vol * 0.25, dur * 0.8);
        return;
      }
      const base = kind === 'foret' ? 1100 : kind === 'savane' ? 700 : kind === 'ville' ? 400 : 300;
      bed(dur, { vol: vol * 0.75, type: kind === 'ville' ? 'lowpass' : 'bandpass', f: base, q: 0.6, a: dur * 0.3, hold: 0.4, wet: 0.6 });
      if (kind === 'nuit') T('mCrickets', Math.max(0.3, dur - 0.2), { vol: vol * L.cricket * 0.6, at: 0.2, offset: 0, fadeIn: 0.01, wet: 0.4 });
      if (kind === 'foret' || kind === 'savane')
        for (let i = 0; i < (kind === 'foret' ? 3 : 2); i++) P('mChirp', { vol: vol * L.chirp * 0.7, at: 0.2 + Math.random() * dur * 0.6, wet: 0.5 });
    },
    /** feux de départ : bip grave par feu */
    light: (vol = 0.14) => {
      if (!P('mBeep', { rate: 0.5, vol: vol * L.beep, dur: 0.2, vary: false, wet: 0.15 })) legacy.light(vol);
    },
    /** chiffre qui défile vite (compteur) */
    roll: (dur = 0.6, vol = 0.1) => {
      if (!T('mRoll', dur, { vol: vol * L.roll, fadeIn: 0.02, wet: 0.05 })) legacy.roll(dur, vol);
    },
    /** déchirure d'air (coupe nette, lame, fente de case de manga) */
    slash: (vol = 0.26) => {
      if (!P('mSlash', { vol: vol * L.slash, wet: 0.15 })) return legacy.slash(vol);
      hitV2(vol * 0.7, 70);
    },
    /** grondement sourd (globe, tunnel) */
    rumble: (dur = 1.4, vol = 0.2) => {
      if (!T('mRumble', dur, { vol: vol * L.rumble, fadeIn: dur * 0.3, wet: 0.1 })) legacy.rumble(dur, vol);
    },
    /** tampon (carte postale) : coup feutré + papier */
    stamp: (vol = 0.3) => {
      hitV2(vol, 60);
      if (!sfx.bed(0.06, { vol: vol * 0.5, f: 900, q: 1, bus: 'event' })) hiss({ dur: 0.06, vol: vol * 0.5, f: 900, q: 1 });
    },
  };
}

export type SoundKit = ReturnType<typeof soundKit>;
