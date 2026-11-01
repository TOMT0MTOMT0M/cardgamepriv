/**
 * Courbes et ressorts. Rien de linéaire : chaque mouvement a une masse.
 */

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
/** Lissage exponentiel indépendant du framerate. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInQuart = (t: number) => t * t * t * t;
export const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

/** Recul puis élan : l'anticipation classique. */
export const anticipate = (s = 1.6) => (t: number) => {
  const k = t * t * ((s + 1) * t - s);
  return k;
};

/** Dépassement en sortie. */
export const backOut = (s = 1.7) => (t: number) => {
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};

/**
 * Courbe de ressort amorti analytique (réponse indicielle) normalisée sur [0,1].
 * zeta < 1 : rebond ; omega : raideur. Utilisable comme ease GSAP.
 */
export const springCurve = (zeta = 0.45, omega = 14) => (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const T = t * 1.0;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const v = 1 - Math.exp(-zeta * omega * T) * (Math.cos(wd * T) + ((zeta * omega) / wd) * Math.sin(wd * T));
    // force l'arrivée exacte à 1 sur la fin
    return lerp(v, 1, smoothstep(0.85, 1, t));
  }
  const v = 1 - Math.exp(-omega * T) * (1 + omega * T);
  return lerp(v, 1, smoothstep(0.85, 1, t));
};

/** cubic-bezier CSS-like (x1,y1,x2,y2). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(clamp(t));
  };
}

/** Courbes maison nommées (cohérentes dans tout le lab). */
export const EASE = {
  /** Sortie franche et longue traîne : apparition d'UI, glissements. */
  glide: cubicBezier(0.16, 1, 0.3, 1),
  /** Accélération retenue : départs de mouvements lourds. */
  heave: cubicBezier(0.7, 0, 0.84, 0),
  /** Aller-retour feutré. */
  breathe: cubicBezier(0.65, 0, 0.35, 1),
  /** Petit rebond de "carte posée". */
  settle: springCurve(0.55, 16),
  /** Rebond vif. */
  snap: springCurve(0.35, 20),
};

/** Ressort scalaire semi-implicite, sous-pas fixes (stable à bas fps). */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  constructor(value = 0, public stiffness = 170, public damping = 18) {
    this.value = value;
    this.target = value;
  }
  update(dt: number): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const f = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += f * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  set(v: number) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
  impulse(v: number) {
    this.velocity += v;
  }
}

/** Pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
