/**
 * (V3, lot 11) TRAJECTOIRE DE LA BILLE de la roulette (rouletteWheel.ts) — module pur, sans DOM, testé par
 * `scripts/test-roulette.mts` (chaque numéro × 60/90/120/144 Hz × onglet en arrière-plan : écart final = 0).
 *
 * Tout est une fonction du temps ABSOLU `k = (performance.now() - t0) / T` (0..1) : aucun pas d'intégration, aucune
 * accumulation de dt, donc la même image à 60 ou 144 Hz et aucune dérive si l'onglet dort pendant le tirage. La
 * trajectoire est calculée À REBOURS depuis l'alvéole du numéro donné par le serveur, en quatre phases :
 *  0. orbite sur la piste extérieure (rayon TRACK), décélération constante ;
 *  1. décrochage : la bille glisse vers les déflecteurs et en touche 1 à 3 (losanges fixes tous les 45°), chaque
 *     choc lui prend de la vitesse, petits sauts de l'un à l'autre ;
 *  2. chute à travers les numéros jusqu'au fond de l'alvéole, où le cylindre l'attrape (vitesse raccordée) ;
 *  3. capture amortie : petit va-et-vient entre les frettes, puis la bille est emportée par le cylindre jusqu'à
 *     l'arrêt. À k = 1 la pose vaut EXACTEMENT `restPose` (centre de l'alvéole sous le repère).
 * Positions angulaires en degrés, sens SVG (0 = en haut, positif = horaire) ; la roue tourne en positif, la bille
 * en négatif. Chaque segment est un polynôme d'Hermite (position + vitesse aux deux bouts) : la position est continue
 * partout, la vitesse aussi sauf aux chocs (déflecteurs, fond de l'alvéole), comme une vraie bille.
 */

/** Rayons (repère SVG de la roue, rotor 62..94, piste 94..100, jante 100..106) */
export const BALL_R = {
  /** orbite sur la piste extérieure, bord de la jante */
  track: 100.5,
  /** centre des losanges déflecteurs (fixes, sur la piste) */
  deflector: 95,
  /** rayon du centre de la bille quand elle frappe un losange */
  impact: 97,
  /** fond de l'alvéole : entre le moyeu (62) et l'anneau des numéros (82), sans cacher le numéro */
  pocket: 70,
} as const;
/** Losanges déflecteurs : 8, tous les 45°, décalés d'un demi-pas pour laisser le repère (0°) dégagé */
export const DEFLECTORS = 8;
export const DEFLECTOR_GAP = 360 / DEFLECTORS;
export const DEFLECTOR_AT = DEFLECTOR_GAP / 2;

// ── réglages physiques (fractions du tirage T, degrés par unité de k) ──
/** instant où la bille tombe dans l'alvéole (la fin, 1 - CAPTURE, est l'amorti emporté par le cylindre) */
const CAPTURE = 0.8;
/** relance depuis l'alvéole du tirage précédent jusqu'à la piste */
const LAUNCH = 0.07;
/** glissade de la piste au premier déflecteur */
const DROP = 0.06;
/** vitesse moyenne visée sur l'orbite et vitesse juste après le dernier choc */
const V_ORBIT = 5000;
const V_LAST = 1000;
/** restitution tangentielle d'un choc, et frottement pendant une glissade / un saut */
const E_HIT = 0.85;
const RHO = 0.95;
/** dernier saut : la bille couvre 30..75° entre le dernier losange et l'alvéole */
const LAST_MIN = -75;
/** hauteur (radiale) du premier saut entre deux losanges, et rebond juste après le dernier */
const HOP_H = 3;
const HOP_DECAY = 0.55;
const BOUNCE_OUT = 4;
/** va-et-vient dans l'alvéole : amplitude (°, < demi-alvéole moins la bille), radial (unités), oscillations, amorti */
const RATTLE_A = 3.2;
const RATTLE_R = 3;
const RATTLE_W = 2 * Math.PI * 1.5;
const RATTLE_WR = 2 * Math.PI * 1.25;
const RATTLE_DAMP = 5;
/** roue : même courbe qu'avant le lot 11 (≥ 3 tours, arrêt sans à-coup) */
const WHEEL_POW = 3.2;

export interface BallPose {
  /** angle du cylindre */
  wheel: number;
  /** angle de la bille (monde) */
  ball: number;
  /** rayon du centre de la bille */
  r: number;
  /** 0 orbite · 1 déflecteurs · 2 chute · 3 dans l'alvéole */
  phase: 0 | 1 | 2 | 3;
}

/** Instant sonore prévu (choc sur un losange, pose dans l'alvéole, frette touchée en fin de course) */
export interface BallEvent {
  k: number;
  kind: 'deflector' | 'pocket' | 'fret';
  /** 0..1 */
  force: number;
  /** angle monde de la bille à cet instant (panoramique) */
  ball: number;
}

interface Seg {
  k0: number;
  k1: number;
  p0: number;
  p1: number;
  m0: number;
  m1: number;
}

export interface BallPlan {
  n: number;
  num: number;
  w0: number;
  w1: number;
  /** pose de repos exacte (fin) */
  rest: BallPose;
  /** angle de l'alvéole dans le repère du cylindre (k ≥ kc : bille = roue + pocketA + va-et-vient) */
  pocketA: number;
  kd: number;
  kc: number;
  /** segments angulaires (orbite, glissade, sauts, chute) et radiaux */
  ang: Seg[];
  rad: Seg[];
  /** fin de la relance radiale (0 si la bille était déjà sur la piste) */
  r0: number;
  impacts: number[];
  events: BallEvent[];
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** angle du cylindre qui met le numéro `num` (1..n) sous le repère */
export const restFor = (n: number, num: number) => -((num - 1) * (360 / n));

/** pose de repos : cylindre sur `restFor`, bille au centre de l'alvéole (sous le repère), à un multiple de 360° près */
export function restPose(n: number, num: number, nearWheel = 0): BallPose {
  const target = restFor(n, num);
  const wheel = target + Math.round((nearWheel - target) / 360) * 360;
  // wheel + (num-1)·pas = multiple entier de 360 : calculé directement (aucun arrondi flottant)
  const ball = Math.round((wheel - target) / 360) * 360;
  return { wheel, ball, r: BALL_R.pocket, phase: 3 };
}

const wheelAt = (p: BallPlan, k: number) => p.w0 + (p.w1 - p.w0) * (1 - Math.pow(1 - k, WHEEL_POW));
const wheelVel = (p: { w0: number; w1: number }, k: number) => (p.w1 - p.w0) * WHEEL_POW * Math.pow(1 - k, WHEEL_POW - 1);

/** Hermite cubique : position au temps k dans le segment (pentes `m` en unités par k) */
function herm(s: Seg, k: number): number {
  const d = s.k1 - s.k0;
  const t = d > 0 ? (k - s.k0) / d : 1;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * s.p0 + (t3 - 2 * t2 + t) * s.m0 * d + (-2 * t3 + 3 * t2) * s.p1 + (t3 - t2) * s.m1 * d;
}
/** vitesse Hermite (unités par k) */
function hermVel(s: Seg, k: number): number {
  const d = s.k1 - s.k0;
  const t = d > 0 ? (k - s.k0) / d : 1;
  const t2 = t * t;
  return ((6 * t2 - 6 * t) * s.p0 + (3 * t2 - 4 * t + 1) * s.m0 * d + (-6 * t2 + 6 * t) * s.p1 + (3 * t2 - 2 * t) * s.m1 * d) / (d || 1);
}

/** va-et-vient dans l'alvéole (s = 0..1 sur la fin du tirage) : nul et à vitesse nulle à s = 1, exactement */
const rattle = (s: number) => -RATTLE_A * Math.exp(-RATTLE_DAMP * s) * Math.sin(RATTLE_W * s) * (1 - s) * (1 - s);
const rattleR = (s: number) => -RATTLE_R * Math.exp(-RATTLE_DAMP * s) * Math.sin(RATTLE_WR * s) * (1 - s) * (1 - s);

/**
 * Prépare un tirage : cylindre à `w0`, bille à `b0` (angle monde) sur le rayon `r0`, numéro `num` (1..n) à faire
 * sortir. Le nombre de déflecteurs touchés (1 à 3) est déterministe : il dépend du numéro et de la position de départ.
 */
export function planSpin(n: number, num: number, w0: number, b0: number, r0: number = BALL_R.track): BallPlan {
  const step = 360 / n;
  const target = restFor(n, num);
  const w1 = w0 + 360 * 3 + mod(target - w0, 360);
  const rest = restPose(n, num, w1);
  const pocketA = (num - 1) * step;
  const kc = CAPTURE;
  const settle = 1 - kc;
  const wv = { w0, w1 };
  const hits = 1 + mod(num * 7 + Math.round(w0 / step), 3);

  // ── à rebours depuis l'alvéole ──
  // la bille arrive au fond de l'alvéole avec la vitesse du cylindre + celle du va-et-vient : raccord sans à-coup
  const vCatch = wheelVel(wv, kc) + (-RATTLE_A * RATTLE_W) / settle;
  const Pc = w0 + (w1 - w0) * (1 - Math.pow(1 - kc, WHEEL_POW)) + pocketA;
  // dernier losange : celui qui laisse 30..75° de chute jusqu'à l'alvéole
  const jLast = Math.floor((Pc - LAST_MIN - DEFLECTOR_AT) / DEFLECTOR_GAP);
  const aLast = DEFLECTOR_AT + DEFLECTOR_GAP * jLast;
  const dLast = Pc - aLast;
  const vA = -V_LAST;
  const fall = (2 * dLast) / (vA + vCatch);
  // chocs du dernier au premier : vitesse avant choc = après / E_HIT ; saut de 45° entre deux losanges
  const vOut: number[] = new Array(hits);
  const vIn: number[] = new Array(hits);
  const hop: number[] = new Array(Math.max(0, hits - 1));
  vOut[hits - 1] = vA;
  for (let i = hits - 1; i >= 0; i--) {
    vIn[i] = vOut[i] / E_HIT;
    if (i > 0) {
      vOut[i - 1] = vIn[i] / RHO;
      hop[i - 1] = (2 * -DEFLECTOR_GAP) / (vOut[i - 1] + vIn[i]);
    }
  }
  const vd = vIn[0] / RHO;
  const dDrop = (DROP * (vd + vIn[0])) / 2;
  const kHit: number[] = new Array(hits);
  kHit[hits - 1] = kc - fall;
  for (let i = hits - 2; i >= 0; i--) kHit[i] = kHit[i + 1] - hop[i];
  const kd = kHit[0] - DROP;
  const aFirst = aLast + DEFLECTOR_GAP * (hits - 1);
  const thD = aFirst - dDrop;
  // orbite : le nombre de tours (≈ 5) absorbe le reste, la vitesse de lancer varie de quelques pour cent
  const dWant = ((-V_ORBIT + vd) / 2) * kd;
  const dA = dWant + (mod(thD - b0 - dWant + 180, 360) - 180);
  const v0 = (2 * dA) / kd - vd;

  // départ déroulé : même angle que `b0` à 360° près, pour que toute la suite (et la pose de repos) se raccorde
  // sans saut de tour
  const bStart = thD - dA;
  const ang: Seg[] = [{ k0: 0, k1: kd, p0: bStart, p1: thD, m0: v0, m1: vd }];
  ang.push({ k0: kd, k1: kHit[0], p0: thD, p1: aFirst, m0: vd, m1: vIn[0] });
  for (let i = 0; i < hits - 1; i++) {
    const a = aFirst - DEFLECTOR_GAP * i;
    ang.push({ k0: kHit[i], k1: kHit[i + 1], p0: a, p1: a - DEFLECTOR_GAP, m0: vOut[i], m1: vIn[i + 1] });
  }
  ang.push({ k0: kHit[hits - 1], k1: kc, p0: aLast, p1: Pc, m0: vA, m1: vCatch });

  // ── rayon ──
  const R = BALL_R;
  const rad: Seg[] = [];
  const rStart = Math.abs(r0 - R.track) > 1e-6 ? r0 : 0;
  // glissade : départ tangent (vitesse radiale nulle), accélère vers les losanges
  rad.push({ k0: kd, k1: kHit[0], p0: R.track, p1: R.impact, m0: 0, m1: (2 * (R.impact - R.track)) / DROP });
  for (let i = 0; i < hits - 1; i++) {
    const hgt = HOP_H * Math.pow(HOP_DECAY, i);
    const d = kHit[i + 1] - kHit[i];
    rad.push({ k0: kHit[i], k1: kHit[i + 1], p0: R.impact, p1: R.impact, m0: (4 * hgt) / d, m1: (-4 * hgt) / d });
  }
  // chute : petit rebond vers l'extérieur, puis vers le fond, en raccordant la vitesse du va-et-vient radial
  rad.push({ k0: kHit[hits - 1], k1: kc, p0: R.impact, p1: R.pocket, m0: BOUNCE_OUT / fall, m1: (-RATTLE_R * RATTLE_WR) / settle });

  // ── sons prévus ──
  const plan: BallPlan = { n, num, w0, w1, rest, pocketA, kd, kc, ang, rad, r0: rStart, impacts: kHit, events: [] };
  kHit.forEach((k, i) => plan.events.push({ k, kind: 'deflector', force: Math.min(1, Math.abs(vIn[i]) / Math.abs(vIn[0])) * (1 - 0.18 * i), ball: aFirst - DEFLECTOR_GAP * i }));
  plan.events.push({ k: kc, kind: 'pocket', force: 1, ball: Pc });
  // les deux premières frettes touchées pendant le va-et-vient (extrêmes du sinus)
  for (let j = 0; j < 2; j++) {
    const s = (Math.PI / 2 + j * Math.PI) / RATTLE_W;
    plan.events.push({ k: kc + s * settle, kind: 'fret', force: Math.exp(-RATTLE_DAMP * s), ball: Pc });
  }
  plan.events.sort((a, b) => a.k - b.k);
  return plan;
}

/** Pose au temps absolu `k` (0..1). k ≥ 1 : exactement `plan.rest`. */
export function poseAt(p: BallPlan, k: number): BallPose {
  if (!(k < 1)) return { ...p.rest };
  if (k < 0) k = 0;
  const wheel = wheelAt(p, k);
  if (k >= p.kc) {
    const s = (k - p.kc) / (1 - p.kc);
    return { wheel, ball: wheel + p.pocketA + rattle(s), r: BALL_R.pocket + rattleR(s), phase: 3 };
  }
  let i = 0;
  while (i < p.ang.length - 1 && k >= p.ang[i].k1) i++;
  const ball = herm(p.ang[i], k);
  let r: number = BALL_R.track;
  if (k >= p.kd) {
    let j = 0;
    while (j < p.rad.length - 1 && k >= p.rad[j].k1) j++;
    r = herm(p.rad[j], k);
  } else if (p.r0 && k < LAUNCH) {
    // relance : la bille sort de l'alvéole précédente et remonte sur la piste (départ et arrivée en douceur)
    const t = k / LAUNCH;
    r = p.r0 + (BALL_R.track - p.r0) * t * t * (3 - 2 * t);
  }
  const phase = k < p.kd ? 0 : k < p.impacts[p.impacts.length - 1] ? 1 : 2;
  return { wheel, ball, r, phase };
}

/** vitesse angulaire de la bille (degrés par unité de k) — pour le volume du cliquetis */
export function ballVelAt(p: BallPlan, k: number): number {
  if (k >= p.kc || k >= 1) return wheelVel(p, Math.min(k, 1));
  let i = 0;
  while (i < p.ang.length - 1 && k >= p.ang[i].k1) i++;
  return hermVel(p.ang[i], Math.max(0, k));
}

/** Son à jouer : `pan` −1..1 (position de la bille sur la roue, sin θ), `force` 0..1 */
export interface BallSound {
  kind: 'track' | 'deflector' | 'pocket' | 'fret';
  force: number;
  pan: number;
}
/** au-delà de cet écart entre deux images (onglet en arrière-plan), les sons manqués ne sont pas rejoués en rafale */
export const SOUND_STALE_MS = 150;
const panOf = (deg: number) => Math.sin((deg * Math.PI) / 180) * 0.6;

/**
 * Sons entre deux images (kPrev, k] : chocs prévus du plan, cliquetis de la piste (la bille passe un losange pendant
 * l'orbite) et frettes franchies pendant la chute. Ne dépend que des deux instants : identique à toute cadence.
 */
export function soundsBetween(p: BallPlan, kPrev: number, k: number, T: number): BallSound[] {
  const out: BallSound[] = [];
  if (!(k > kPrev) || (k - kPrev) * T > SOUND_STALE_MS) return out;
  for (const e of p.events) if (e.k > kPrev && e.k <= k) out.push({ kind: e.kind, force: e.force, pan: panOf(e.ball) });
  const a = poseAt(p, kPrev), b = poseAt(p, k);
  if (b.phase === 0 && a.phase === 0) {
    if (Math.floor((a.ball - DEFLECTOR_AT) / DEFLECTOR_GAP) !== Math.floor((b.ball - DEFLECTOR_AT) / DEFLECTOR_GAP)) {
      const v0 = Math.abs(p.ang[0].m0) || 1;
      out.push({ kind: 'track', force: Math.min(1, Math.abs(ballVelAt(p, k)) / v0), pan: panOf(b.ball) });
    }
  } else if (b.phase === 2 && a.phase === 2) {
    const step = 360 / p.n;
    if (Math.round((a.ball - a.wheel) / step) !== Math.round((b.ball - b.wheel) / step)) out.push({ kind: 'fret', force: 0.6, pan: panOf(b.ball) });
  }
  return out;
}
