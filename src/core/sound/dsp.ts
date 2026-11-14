/**
 * ATELIER SONORE — outils de synthèse PURS (aucune API du navigateur) : tournent tels quels dans un Worker (cuisson de
 * la banque au démarrage, hors du fil principal) et dans Node (tests, mesures). Tout est déterministe : une graine
 * donne toujours le même son.
 *
 * Fréquence de cuisson : 32 kHz. La palette est feutrée (rien d'utile au-dessus de ~8 kHz) : un tiers de mémoire en
 * moins qu'à 48 kHz, et le navigateur ré-échantillonne à la lecture.
 */
export const SR = 32000;

/** Un son cuit : 1 canal (mono, placé à la lecture) ou 2 (stéréo, petite pièce cuite dedans). */
export interface Clip {
  sr: number;
  ch: Float32Array[];
}

export type Rng = () => number;
/** générateur pseudo-aléatoire à graine (mulberry32) */
export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** tirage uniforme dans [a, b] */
export const between = (r: Rng, a: number, b: number) => a + r() * (b - a);
/** nombre d'échantillons pour `s` secondes */
export const smp = (s: number) => Math.max(1, Math.round(s * SR));
export const zeros = (s: number) => new Float32Array(smp(s));
const TAU = Math.PI * 2;

// ───────────────────────────────────────────────────────────── sources

export function white(n: number, r: Rng): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

/** bruit rose (filtre de Paul Kellet) : −3 dB / octave, plus doux et plus « matière » que le bruit blanc */
export function pink(n: number, r: Rng): Float32Array {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}

/** Un mode de résonance : fréquence, temps de chute à −60 dB, amplitude. */
export interface Mode {
  f: number;
  t60: number;
  a: number;
}
/**
 * SYNTHÈSE MODALE : un objet frappé = une somme de sinus amortis (ses modes propres). C'est ce qui fait qu'un « toc »
 * sonne comme une matière (carton, bois, feutre) et pas comme un bip. `atk` (s) arrondit l'attaque : pas de clic.
 */
export function modal(out: Float32Array, modes: Mode[], at = 0, atk = 0.0008, gain = 1): Float32Array {
  const n0 = Math.round(at * SR);
  const ka = atk > 0 ? Math.exp(-1 / (atk * SR)) : 0;
  for (const m of modes) {
    if (m.f >= SR * 0.45 || m.a === 0) continue;
    const w = (TAU * m.f) / SR;
    const d = Math.exp(-6.9078 / (m.t60 * SR));
    const c = 2 * d * Math.cos(w);
    const d2 = d * d;
    // y[n] = dⁿ·sin(w·n) par récurrence : on amorce avec y[-1] et y[-2] (y[0] = 0 : départ sans clic)
    let y1 = -Math.sin(w) / d;
    let y2 = -Math.sin(2 * w) / d2;
    const end = Math.min(out.length, n0 + Math.ceil(m.t60 * 1.5 * SR));
    let e = 1;
    const a = m.a * gain;
    for (let i = n0; i < end; i++) {
      const y = c * y1 - d2 * y2;
      y2 = y1;
      y1 = y;
      e *= ka;
      out[i] += y * a * (1 - e);
    }
  }
  return out;
}

/** sinus dont la hauteur glisse de f0 à f1 (exponentiel, constante de temps `tau` s) — bulle, sous-basse qui tombe */
export function glide(n: number, f0: number, f1: number, tau: number): Float32Array {
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f1 + (f0 - f1) * Math.exp(-i / (tau * SR));
    ph += (TAU * f) / SR;
    x[i] = Math.sin(ph);
  }
  return x;
}

// ───────────────────────────────────────────────────────────── filtres (en place)

/** passe-bas 1 pôle (6 dB / octave) : le « feutre » */
export function lp1(x: Float32Array, hz: number): Float32Array {
  const a = 1 - Math.exp((-TAU * hz) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
  return x;
}
/** passe-haut 1 pôle */
export function hp1(x: Float32Array, hz: number): Float32Array {
  const a = 1 - Math.exp((-TAU * hz) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] -= y;
  }
  return x;
}
/** passe-bas 2 pôles (deux passes : pente plus franche, sans résonance) */
export const lp2 = (x: Float32Array, hz: number) => lp1(lp1(x, hz), hz);

/**
 * Filtre à variable d'état (forme TPT, stable même quand la fréquence bouge à chaque échantillon).
 * `f` : fréquence fixe ou fonction de l'avancement 0..1. mode : passe-bande ou passe-bas.
 */
export function svf(x: Float32Array, f: number | ((p: number) => number), q: number, mode: 'bp' | 'lp' | 'hp' = 'bp'): Float32Array {
  const k = 1 / q;
  let ic1 = 0, ic2 = 0;
  const n = x.length;
  const fixed = typeof f === 'number';
  let g = Math.tan((Math.PI * Math.min(SR * 0.45, fixed ? f : f(0))) / SR);
  let a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  for (let i = 0; i < n; i++) {
    if (!fixed && (i & 15) === 0) {
      g = Math.tan((Math.PI * Math.min(SR * 0.45, (f as (p: number) => number)(i / n))) / SR);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = mode === 'bp' ? v1 * k : mode === 'lp' ? v2 : x[i] - k * v1 - v2;
  }
  return x;
}

// ───────────────────────────────────────────────────────────── enveloppes et dynamique (en place)

/** chute exponentielle (−60 dB en `t60` s) à partir de `at`, attaque arrondie de `atk` s */
export function decay(x: Float32Array, t60: number, atk = 0.001, at = 0): Float32Array {
  const n0 = Math.round(at * SR);
  const d = Math.exp(-6.9078 / (t60 * SR));
  const ka = Math.exp(-1 / (Math.max(1e-5, atk) * SR));
  let e = 1, a = 1;
  for (let i = 0; i < x.length; i++) {
    if (i < n0) {
      x[i] = 0;
      continue;
    }
    a *= ka;
    x[i] *= e * (1 - a);
    e *= d;
  }
  return x;
}
/** fondus en cosinus au début et à la fin (s) */
export function fade(x: Float32Array, tin: number, tout: number): Float32Array {
  const ni = Math.min(x.length, Math.round(tin * SR)), no = Math.min(x.length, Math.round(tout * SR));
  for (let i = 0; i < ni; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ni);
  for (let i = 0; i < no; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / no);
  return x;
}
export function scale(x: Float32Array, k: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}
/** ajoute `src` × k dans `dst` à partir de `at` s */
export function mix(dst: Float32Array, src: Float32Array, k = 1, at = 0): Float32Array {
  const n0 = Math.round(at * SR);
  const n = Math.min(src.length, dst.length - n0);
  for (let i = 0; i < n; i++) dst[n0 + i] += src[i] * k;
  return dst;
}
/** saturation douce (tanh) : ajoute des harmoniques — le grave « suggéré » sur un petit haut-parleur */
export function drive(x: Float32Array, k: number): Float32Array {
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k) * norm;
  return x;
}
export function peak(ch: Float32Array[]): number {
  let p = 0;
  for (const x of ch) for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}
/** met la crête à `db` dBFS */
export function normalize(ch: Float32Array[], db = -6): Float32Array[] {
  const p = peak(ch);
  if (p > 0) for (const x of ch) scale(x, Math.pow(10, db / 20) / p);
  return ch;
}
/** coupe le silence de fin (sous `db`), avec un fondu de 4 ms */
export function trim(ch: Float32Array[], db = -66): Float32Array[] {
  const th = Math.pow(10, db / 20) * Math.max(1e-9, peak(ch));
  let end = 0;
  for (const x of ch) for (let i = x.length - 1; i > end; i--) if (Math.abs(x[i]) > th) { end = i; break; }
  const n = Math.min(ch[0].length, end + smp(0.004));
  return ch.map((x) => fade(x.slice(0, n), 0, 0.004));
}
/** rend une texture bouclable : la fin se fond dans le début (fondu à puissance égale de `xf` s) */
export function loopable(x: Float32Array, xf: number): Float32Array {
  const nx = Math.round(xf * SR);
  const n = x.length - nx;
  const out = x.slice(0, n);
  for (let i = 0; i < nx; i++) {
    const p = i / nx;
    out[i] = x[i] * Math.sin((p * Math.PI) / 2) + x[n + i] * Math.cos((p * Math.PI) / 2);
  }
  return out;
}

// ───────────────────────────────────────────────────────────── espace

/**
 * Réverbération FDN (4 lignes à retard bouclées, matrice de Householder, amortissement des aigus dans la boucle) :
 * une petite pièce SOMBRE cuite dans le son — proche, feutrée, jamais de queue brillante. Coût linéaire.
 * Renvoie le signal réverbéré seul (gauche, droite), de longueur entrée + queue.
 */
export function fdn(inp: Float32Array, o: { t60: number; damp: number; size?: number }, r: Rng): [Float32Array, Float32Array] {
  const size = o.size ?? 1;
  const n = inp.length + Math.ceil(o.t60 * 1.15 * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const base = [0.0113, 0.0149, 0.0187, 0.0231].map((s) => Math.max(8, Math.round(s * size * SR * between(r, 0.96, 1.04))));
  const lines = base.map((d) => new Float32Array(d));
  const idx = [0, 0, 0, 0];
  const fb = base.map((d) => Math.pow(10, (-3 * d) / (o.t60 * SR)));
  const lpA = 1 - Math.exp((-TAU * o.damp) / SR);
  const lpS = [0, 0, 0, 0];
  // diffusion d'entrée : deux passe-tout (étalent le transitoire, queue lisse)
  const ap = [smp(0.0047 * size), smp(0.0017 * size)].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  const o4 = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    let x = i < inp.length ? inp[i] : 0;
    for (const a of ap) {
      const z = a.buf[a.i];
      const y = -0.6 * x + z;
      a.buf[a.i] = x + 0.6 * y;
      a.i = (a.i + 1) % a.buf.length;
      x = y;
    }
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const v = lines[k][idx[k]];
      lpS[k] += lpA * (v - lpS[k]);
      o4[k] = lpS[k];
      sum += o4[k];
    }
    const h = sum * 0.5;
    for (let k = 0; k < 4; k++) {
      lines[k][idx[k]] = x + (o4[k] - h) * fb[k];
      idx[k] = (idx[k] + 1) % base[k];
    }
    L[i] = o4[0] - o4[2];
    R[i] = o4[1] - o4[3];
  }
  return [L, R];
}

/**
 * Place un son mono dans une petite pièce feutrée : centre sec + réverbe stéréo courte (`mixK`). C'est la proximité
 * « ASMR » : le son est tout près, la pièce se devine à peine.
 */
export function room(mono: Float32Array, o: { t60: number; damp?: number; mixK?: number; size?: number }, r: Rng): Float32Array[] {
  const [wl, wr] = fdn(mono, { t60: o.t60, damp: o.damp ?? 2400, size: o.size ?? 0.7 }, r);
  const k = o.mixK ?? 0.15;
  const L = scale(wl, k), R = scale(wr, k);
  mix(L, mono);
  mix(R, mono);
  return [L, R];
}
