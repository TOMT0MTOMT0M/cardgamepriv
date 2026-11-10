/**
 * SIMULATEUR HORS-LIGNE de la déchirure du sachet (10/11, demande de Tom : « une vraie collision et un vrai réalisme de
 * déchirure… simulation full qualité, puis on enregistre les déformations pour juste les rejouer »).
 *
 *   npm run bake:tear                        → public/bake/tear-0.tear … tear-2.tear (+ résumé dans la console)
 *   npm run bake:tear -- --only=0 --preview  → aussi .cache/bake-tear/preview-0.json (contrôle : scripts/bake-tear/preview.py)
 *   options : --variants=N  --debug (mesures toutes les 25 ms)
 *   APRÈS une nouvelle cuisson : monter BAKE_REV dans src/core/tearBake.ts (le service worker garde les fichiers par version)
 *
 * Le film : stratifié alu / PET (~90 µm). Quasi inextensible, raide en flexion, PLASTIQUE (au-delà d'un petit angle le pli
 * reste marqué). XPBD à petits pas (Macklin 2019), 2 400 Hz :
 *  - 4 nappes triangulées comme à l'affichage : corps avant, corps dos, bande avant, bande dos (même grille en x) ;
 *  - arêtes des triangles = distances quasi rigides ; FLEXION = angle dièdre SIGNÉ de chaque arête intérieure
 *    (Bridson 2003 : gradients bien définis même à plat), dont l'angle de repos FLUE au-delà du seuil d'élasticité
 *    → plis permanents, avec leur sens ;
 *  - soudures thermoscellées (côtés, crans haut / bas) : les deux faces liées, crans plus raides (double épaisseur) ;
 *  - LIGNE DE DÉCHIRURE : bande de recouvrement ±δ autour de TEAR_V, corps et bande y sont soudés colonne par colonne
 *    (sommets doublés, longueur nulle), chaque soudure CÈDE quand le front la dépasse, par à-coups ; le bord dentelé fin
 *    reste dans le shader du jeu (tearEdge), la géométrie porte le grand mouvement ;
 *  - le doigt (attache souple : il ne peut pas étirer le film) pince le bout gauche de la bande, la tire vers la droite,
 *    vers le haut et vers soi ; à la fin, coup de poignet, il lâche : la bande vole (gravité + traînée selon sa normale) ;
 *  - l'autre main tient le sachet par le cran du bas. Le corps ne subit pas la gravité : à cette échelle le film est
 *    bien plus raide que lourd (et un XPBD à une itération le ferait s'affaisser) ;
 *  - les 5 CARTES : plaques rigides à bords arrondis qui sortent par le haut avec EXACTEMENT la timeline du jeu
 *    (opening.ts onTorn : départ 0,25 s + 35 ms par carte, 0,8 s, EASE.glide) ; film ↔ cartes par champ de hauteur
 *    (le film est toujours d'un côté de la pile) avec frottement : la lèvre accroche, est entraînée, puis glisse ;
 *    les cartes écartent les lèvres de l'ouverture ;
 *  - auto-collisions : avant ↔ dos du corps (ordre en z), avant ↔ dos de la bande, bande ↔ corps (grille de hachage).
 *
 * Enregistrement : phase DÉCHIRURE indexée par la progression (0..1 : le doigt la pilote en jeu), phase SORTIE indexée
 * par le temps (30 i/s, calée sur la timeline des cartes). Positions quantifiées (int16, 20 µm), écart à l'image
 * précédente, par plans x / y / z, gzip. Format : src/core/tearBakeFormat.ts ; rejeu : src/core/tearBake.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PACK, PACK_SIDE_SEAM, PACK_STACK, TEAR_V, lcg, packRestZ } from '../../src/core/packCrease';
import { EASE } from '../../src/core/ease';
import { TEAR_BAKE_FORMAT, type TearBakeHeader } from '../../src/core/tearBakeFormat';

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const PREVIEW = flag('preview');
const DEBUG = flag('debug');
const VARIANTS = +(opt('variants') ?? 3);
const ONLY = opt('only');
const SKIP = new Set((process.env.SKIP ?? '').split(','));
const ENV = (k: string, d: number) => (process.env[k] !== undefined ? +process.env[k]! : d);

// ───────────────────────────── dimensions (unités de la scène : 1 = 100 mm)
const { w: W, h: H, crimp: CRIMP } = PACK;
const NX = 64; // colonnes (65 sommets)
const yTear = (TEAR_V - 0.5) * H;
const DELTA = 0.016; // demi-hauteur de la bande de recouvrement (> amplitude du bord dentelé du shader)
const yA = yTear - DELTA, yB = yTear + DELTA;
const NB_ROWS = 70; // rangées du corps jusqu'à yA
const NS_ROWS = 11; // rangées de la bande au-dessus de yB
const G = 98.1; // 9,81 m/s² en unités de 10 cm
const CARD_T = 0.012 * PACK_STACK.s, CARD_E = CARD_T / 2, CARD_R = 0.031 * PACK_STACK.s;
const FILM_R = 0.0016; // demi-épaisseur + marge de contact
const SEAM_X = W / 2 - PACK_SIDE_SEAM, SEAM_Y = H / 2 - CRIMP;

// timeline des cartes (opening.ts onTorn, style « tear » : sp = 1)
const CARDS = 5;
const CARD_START = (k: number) => 0.25 + (CARDS - 1 - k) * 0.035;
const CARD_DUR = 0.8;
const CARD_Y1 = PACK.h / 1.18; // PACK.h / PACK_FRAME.h
const cardZ = (k: number) => (k - (CARDS - 1) / 2) * 0.0072;
const cardY = (k: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - CARD_START(k)) / CARD_DUR));
  return PACK_STACK.cy + (CARD_Y1 - PACK_STACK.cy) * EASE.glide(u);
};

// enregistrement
const TEAR_DUR = 1.0; // la déchirure « nominale » (le jeu la pilote ensuite au doigt)
const N_TEAR = 49; // images de la phase déchirure (p = 0, 1/48 … 1)
const EXIT_DUR = 1.4;
const EXIT_FPS = 30;
const N_EXIT = Math.round(EXIT_DUR * EXIT_FPS) + 1;
const STRIP_HIDE = 0.75; // la bande disparaît du jeu à 0,75 s (comme l'ancienne `fly`)
const Q = 2e-4; // quantification (20 µm) — ±6,5 unités en int16
const FRAME_DT = 1 / 240;
const GRIP_COLS = 3; // le doigt pince les 4 premières colonnes (≈ 5 mm) : l'encoche, déjà fendue au départ
const SUB = ENV('SUB', 10); // sous-pas par image → 2 400 Hz
const VMAX = 40; // garde-fou (unités / s)

// matière
const A_BEND = ENV('ABEND', 3e-3); // souplesse de flexion (XPBD) — plus petit = plus raide
const A_BEND_SEAM = A_BEND / 6; // soudures et crans : double épaisseur
const A_STRETCH = ENV('ASTR', 1e-7); // souplesse d'étirement (quasi nulle : le film ne s'étire pas)
const A_GRIP = ENV('AGRIP', 1e-5); // attache du doigt (souple : il ne peut pas étirer le film)
const YIELD = ENV('YIELD', 0.05); // angle (rad) au-delà duquel le pli reste
const CREEP = 0.3; // part de l'excès qui devient permanente à chaque image
const DRAG_N = 9, DRAG_T = 0.6;
const CONTACT_V = ENV('CV', 1.2); // vitesse max donnée au film par une carte (unités / s, normale)
const DAMP = ENV('DAMP', 0.9995); // amortissement interne du film (par sous-pas) // traînée de l'air (1/s) : selon la normale, le long du film

// ───────────────────────────── nappes
type Part = 'body' | 'strip';
interface Sheet { part: Part; side: 1 | -1; ny: number; ys: number[]; base: number }
function rowsBody(): number[] {
  const ys: number[] = [];
  for (let j = 0; j <= NB_ROWS; j++) ys.push(-H / 2 + ((yA + H / 2) * j) / NB_ROWS);
  ys.push(yB);
  return ys;
}
function rowsStrip(): number[] {
  const ys = [yA, yB];
  for (let j = 1; j <= NS_ROWS; j++) ys.push(yB + ((H / 2 - yB) * j) / NS_ROWS);
  return ys;
}

interface Variant {
  seed: number;
  /** direction finale de la traction (front → doigt) */
  pull: [number, number, number];
  /** fraction de la longueur arrachée entre le front et le doigt (< 1 : la bande fait une boucle) */
  lag: number;
  /** coup de poignet final (unités / s) */
  flick: [number, number, number];
  /** bruit de rupture des soudures (progression) */
  noise: number;
  /** à-coups : la déchirure cède par paquets de colonnes */
  chunk: number;
}
const VARIANT_LIST: Variant[] = [
  { seed: 11, pull: [-0.3, 0.42, 0.86], lag: 0.72, flick: [2.6, 1.7, 1.1], noise: 0.012, chunk: 3 },
  { seed: 23, pull: [-0.12, 0.62, 0.78], lag: 0.66, flick: [2.2, 2.3, 0.7], noise: 0.016, chunk: 2 },
  { seed: 37, pull: [-0.45, 0.25, 0.86], lag: 0.78, flick: [3.0, 1.2, 1.4], noise: 0.01, chunk: 4 },
  { seed: 51, pull: [-0.2, 0.5, 0.84], lag: 0.7, flick: [2.4, 1.9, 1.0], noise: 0.014, chunk: 3 },
];

/** angle dièdre signé de l'arête (x3, x4), ailes x1, x2 ; gradients dans g (12) — Bridson et al. 2003 */
function dihedral(P: Float64Array, i1: number, i2: number, i3: number, i4: number, g?: Float64Array): number {
  const o1 = i1 * 3, o2 = i2 * 3, o3 = i3 * 3, o4 = i4 * 3;
  const ex = P[o4] - P[o3], ey = P[o4 + 1] - P[o3 + 1], ez = P[o4 + 2] - P[o3 + 2];
  const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (el < 1e-12) return NaN;
  const a1x = P[o1] - P[o3], a1y = P[o1 + 1] - P[o3 + 1], a1z = P[o1 + 2] - P[o3 + 2];
  const b1x = P[o1] - P[o4], b1y = P[o1 + 1] - P[o4 + 1], b1z = P[o1 + 2] - P[o4 + 2];
  const a2x = P[o2] - P[o4], a2y = P[o2 + 1] - P[o4 + 1], a2z = P[o2 + 2] - P[o4 + 2];
  const b2x = P[o2] - P[o3], b2y = P[o2 + 1] - P[o3 + 1], b2z = P[o2 + 2] - P[o3 + 2];
  const n1x = a1y * b1z - a1z * b1y, n1y = a1z * b1x - a1x * b1z, n1z = a1x * b1y - a1y * b1x;
  const n2x = a2y * b2z - a2z * b2y, n2y = a2z * b2x - a2x * b2z, n2z = a2x * b2y - a2y * b2x;
  const l1 = n1x * n1x + n1y * n1y + n1z * n1z, l2 = n2x * n2x + n2y * n2y + n2z * n2z;
  if (l1 < 1e-20 || l2 < 1e-20) return NaN;
  const s12 = 1 / Math.sqrt(l1 * l2);
  const cx = n1y * n2z - n1z * n2y, cy = n1z * n2x - n1x * n2z, cz = n1x * n2y - n1y * n2x;
  const th = Math.atan2(((cx * ex + cy * ey + cz * ez) / el) * s12, (n1x * n2x + n1y * n2y + n1z * n2z) * s12);
  if (g) {
    const k1 = el / l1, k2 = el / l2;
    const d13 = (a1x * ex + a1y * ey + a1z * ez) / el, d14 = (b1x * ex + b1y * ey + b1z * ez) / el;
    const d23 = (b2x * ex + b2y * ey + b2z * ez) / el, d24 = (a2x * ex + a2y * ey + a2z * ez) / el;
    g[0] = -k1 * n1x, g[1] = -k1 * n1y, g[2] = -k1 * n1z;
    g[3] = -k2 * n2x, g[4] = -k2 * n2y, g[5] = -k2 * n2z;
    g[6] = -(d14 * n1x) / l1 - (d24 * n2x) / l2, g[7] = -(d14 * n1y) / l1 - (d24 * n2y) / l2, g[8] = -(d14 * n1z) / l1 - (d24 * n2z) / l2;
    g[9] = (d13 * n1x) / l1 + (d23 * n2x) / l2, g[10] = (d13 * n1y) / l1 + (d23 * n2y) / l2, g[11] = (d13 * n1z) / l1 + (d23 * n2z) / l2;
  }
  return th;
}

// ───────────────────────────── simulation
function simulate(V: Variant) {
  const rnd = lcg(V.seed);
  const sheets: Sheet[] = [];
  let n = 0;
  for (const part of ['body', 'strip'] as Part[])
    for (const side of [1, -1] as const) {
      const ys = part === 'body' ? rowsBody() : rowsStrip();
      sheets.push({ part, side, ny: ys.length, ys, base: n });
      n += ys.length * (NX + 1);
    }
  const id = (s: Sheet, i: number, j: number) => s.base + j * (NX + 1) + i;
  const [bF, bB, sF, sB] = sheets;

  const pos = new Float64Array(n * 3), prev = new Float64Array(n * 3), vel = new Float64Array(n * 3), rest = new Float64Array(n * 3);
  const inv = new Float64Array(n).fill(1);
  const grav = new Uint8Array(n); // soumis à la gravité (la bande, une fois lâchée)
  const colOf = new Uint16Array(n);
  for (const s of sheets)
    for (let j = 0; j < s.ny; j++)
      for (let i = 0; i <= NX; i++) {
        const k = id(s, i, j), u = i / NX, y = s.ys[j], v = y / H + 0.5;
        const x = (u - 0.5) * W;
        // imperceptible irrégularité du film, fonction du POINT (pas de l'ordre de tirage) : les sommets doublés de la
        // bande de recouvrement, soudés à longueur nulle, doivent avoir exactement le même repos
        const hz = Math.sin(i * 12.9898 + Math.round(y * 1e5) * 0.0078233 + s.side * 3.7 + V.seed) * 43758.5453;
        const z = packRestZ(u, v, s.side, 0, true) + s.side * (hz - Math.floor(hz) - 0.5) * 0.0004 * (Math.abs(x) < SEAM_X ? 1 : 0);
        rest[k * 3] = x, rest[k * 3 + 1] = y, rest[k * 3 + 2] = z;
        colOf[k] = i;
      }
  pos.set(rest);
  prev.set(rest);
  const fusedAt = (x: number, y: number) => Math.abs(x) >= SEAM_X - 1e-6 || Math.abs(y) >= SEAM_Y - 1e-6;
  const len = (a: number, b: number) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);

  // ── distances
  const dI: number[] = [], dJ: number[] = [], dL: number[] = [], dA: number[] = [], dBrk: number[] = [];
  const dist = (a: number, b: number, alpha: number, brk = -1, L = len(a, b)) => {
    dI.push(a), dJ.push(b), dA.push(alpha), dBrk.push(brk), dL.push(L);
  };
  // ── flexion : angle dièdre des arêtes intérieures de chaque nappe
  const bW1: number[] = [], bW2: number[] = [], bE1: number[] = [], bE2: number[] = [], bA: number[] = [];
  for (const s of sheets) {
    const tris: Array<[number, number, number]> = [];
    for (let j = 0; j < s.ny - 1; j++)
      for (let i = 0; i < NX; i++) {
        const a = id(s, i, j), b = a + 1, c = a + NX + 1, d = c + 1;
        tris.push([a, b, d], [a, d, c]);
      }
    const edges = new Map<number, number[]>();
    for (const t of tris)
      for (let e = 0; e < 3; e++) {
        const p = t[e], q = t[(e + 1) % 3], o = t[(e + 2) % 3];
        const key = Math.min(p, q) * n + Math.max(p, q);
        const E = edges.get(key);
        if (E) E.push(o);
        else edges.set(key, [Math.min(p, q), Math.max(p, q), o]);
      }
    for (const E of edges.values()) {
      dist(E[0], E[1], 0);
      if (E.length < 4) continue;
      const seam = (k: number) => fusedAt(rest[k * 3], rest[k * 3 + 1]);
      bE1.push(E[0]), bE2.push(E[1]), bW1.push(E[2]), bW2.push(E[3]);
      bA.push(seam(E[0]) && seam(E[1]) ? A_BEND_SEAM : A_BEND);
    }
  }
  const BN = bE1.length;
  const be1 = Int32Array.from(bE1), be2 = Int32Array.from(bE2), bw1 = Int32Array.from(bW1), bw2 = Int32Array.from(bW2), ba = Float64Array.from(bA);
  const bTh = new Float64Array(BN);
  const restAngles = () => {
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      bTh[c] = Number.isNaN(th) ? 0 : th;
    }
  };
  restAngles();
  // soudures avant ↔ dos (même (i, j), même partie)
  for (const [F, B] of [[bF, bB], [sF, sB]] as const)
    for (let j = 0; j < F.ny; j++)
      for (let i = 0; i <= NX; i++) {
        const kf = id(F, i, j), kb = id(B, i, j);
        if (!SKIP.has('seam') && fusedAt(rest[kf * 3], rest[kf * 3 + 1])) dist(kf, kb, 0);
      }
  // LIGNE DE DÉCHIRURE : corps (rangées A et B') ≡ bande (rangées A' et B), une rupture par colonne
  const breakAt = new Float64Array(NX + 1);
  for (let i = 0; i <= NX; i++) breakAt[i] = Math.min(0.995, ((Math.ceil((i + 0.5) / V.chunk) * V.chunk) / NX) * 0.985 + (rnd() - 0.5) * V.noise);
  for (let i = 0; i <= GRIP_COLS; i++) breakAt[i] = 0; // l'encoche
  for (let i = 1; i <= NX; i++) breakAt[i] = Math.max(breakAt[i], breakAt[i - 1]);
  for (const [body, strip] of [[bF, sF], [bB, sB]] as const)
    for (let i = 0; i <= NX; i++) {
      dist(id(body, i, body.ny - 2), id(strip, i, 0), 0, i, 0);
      dist(id(body, i, body.ny - 1), id(strip, i, 1), 0, i, 0);
    }
  const DN = dI.length;
  const di = Int32Array.from(dI), dj = Int32Array.from(dJ), dl = Float64Array.from(dL), da = Float64Array.from(dA), dbrk = Int32Array.from(dBrk);
  const dAlive = new Uint8Array(DN).fill(1);
  const colTorn = new Uint8Array(NX + 1);
  // écart minimal avant ↔ dos : 0,9 mm, jamais plus que 80 % de l'écart au repos (sinon la contrainte se bat contre le
  // repos à chaque pas et injecte de l'énergie)
  const gapMin = new Float64Array(bF.ny * (NX + 1)), sgapMin = new Float64Array(sF.ny * (NX + 1));
  for (let j = 0; j < bF.ny; j++) for (let i = 0; i <= NX; i++) gapMin[j * (NX + 1) + i] = Math.min(0.0009, 0.8 * (rest[id(bF, i, j) * 3 + 2] - rest[id(bB, i, j) * 3 + 2]));
  for (let j = 0; j < sF.ny; j++) for (let i = 0; i <= NX; i++) sgapMin[j * (NX + 1) + i] = Math.min(0.0009, 0.8 * len(id(sF, i, j), id(sB, i, j)));

  // ── la main : cran du bas, épinglé
  for (const s of [bF, bB])
    for (let j = 0; j < s.ny; j++) if (s.ys[j] <= -H / 2 + CRIMP * 0.85) for (let i = 0; i <= NX; i++) inv[id(s, i, j)] = 0;
  // ── le doigt : bout gauche de la bande (2 faces), attache souple vers une cible rigide
  const grip: number[] = [];
  for (const s of [sF, sB])
    for (let j = 0; j < s.ny; j++)
      for (let i = 0; i <= NX; i++) if (i <= GRIP_COLS && s.ys[j] >= yB + 0.02) grip.push(id(s, i, j));
  const gripRest = grip.map((k) => [rest[k * 3], rest[k * 3 + 1], rest[k * 3 + 2]]);
  const gripC = [0, 1, 2].map((a) => gripRest.reduce((s, p) => s + p[a], 0) / grip.length);
  const gripT = new Float64Array(grip.length * 3);
  let gripOn = true;

  const pullDir = (p: number): number[] => {
    const k = Math.min(1, p / 0.3);
    const e = k * k * (3 - 2 * k);
    const d = [-1 + (V.pull[0] + 1) * e, V.pull[1] * e, V.pull[2] * e];
    const l = Math.hypot(d[0], d[1], d[2]);
    return d.map((x) => x / l);
  };
  const quatFromTo = (a: number[], b: number[]) => {
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const q = [c[0], c[1], c[2], 1 + d];
    const l = Math.hypot(...q);
    return q.map((x) => x / l);
  };
  const rot = (q: number[], v: number[]) => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  };
  // le bout de la bande suit le front à `lag × longueur arrachée`, dans une direction qui tourne de « le long de la
  // ligne » vers « en haut et vers soi » ; la pince tourne avec
  const gripPose = (p: number) => {
    const L = Math.min(1, p) * W;
    const dir = pullDir(p);
    const fx = -W / 2 + Math.min(1, p) * W;
    const c = [fx + dir[0] * L * V.lag, gripC[1] + dir[1] * L * V.lag, gripC[2] + dir[2] * L * V.lag];
    // au départ, le bout est à sa place (le front est encore sur lui)
    const k0 = Math.min(1, p / 0.06);
    const c0 = c.map((x, a) => gripC[a] * (1 - k0) + x * k0);
    return { c: c0, q: quatFromTo([-1, 0, 0], dir) };
  };
  const setGripTarget = (c: number[], q: number[]) => {
    for (let g = 0; g < grip.length; g++) {
      const r = rot(q, [gripRest[g][0] - gripC[0], gripRest[g][1] - gripC[1], gripRest[g][2] - gripC[2]]);
      gripT[g * 3] = c[0] + r[0], gripT[g * 3 + 1] = c[1] + r[1], gripT[g * 3 + 2] = c[2] + r[2];
    }
  };
  setGripTarget(gripC, [0, 0, 0, 1]);

  // ── cartes
  const cy = new Float64Array(CARDS).fill(PACK_STACK.cy), cyPrev = new Float64Array(CARDS).fill(PACK_STACK.cy);
  const hx = PACK_STACK.hw, hy = PACK_STACK.hh;
  let stackVy = 0;
  /** hauteur de la pile côté s au point (x, y) ; NaN = hors de la pile ; `stackVy` = déplacement de la carte touchée */
  const stackH = (x: number, y: number, s: number): number => {
    let best = NaN;
    for (let k = 0; k < CARDS; k++) {
      const qx = Math.abs(x) - hx + CARD_R, qy = Math.abs(y - cy[k]) - hy + CARD_R;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CARD_R;
      if (d >= 0) continue;
      const top = d < -CARD_E ? CARD_E : Math.sqrt(Math.max(0, CARD_E * CARD_E - (d + CARD_E) * (d + CARD_E)));
      const z = cardZ(k) + s * top;
      if (Number.isNaN(best) || (s > 0 ? z > best : z < best)) (best = z), (stackVy = cy[k] - cyPrev[k]);
    }
    return best;
  };

  // ── grille de hachage (bande ↔ corps)
  const CELL = 0.012;
  const hash = new Map<number, number[]>();
  const hk = (cx: number, cy2: number, cz: number) => ((cx + 512) * 1024 + (cy2 + 512)) * 1024 + (cz + 512);
  const stripIds: number[] = [];
  for (const s of [sF, sB]) for (let j = 2; j < s.ny; j++) for (let i = 0; i <= NX; i++) stripIds.push(id(s, i, j));
  const bodyIds: number[] = [];
  for (const s of [bF, bB]) for (let j = 0; j < s.ny - 3; j++) for (let i = 0; i <= NX; i++) bodyIds.push(id(s, i, j));
  const rebuildHash = () => {
    hash.clear();
    for (const k of bodyIds) {
      const key = hk(Math.floor(pos[k * 3] / CELL), Math.floor(pos[k * 3 + 1] / CELL), Math.floor(pos[k * 3 + 2] / CELL));
      const b = hash.get(key);
      if (b) b.push(k);
      else hash.set(key, [k]);
    }
  };

  // ── normales (traînée de l'air)
  const nrm = new Float64Array(n * 3);
  const normals = () => {
    for (const s of sheets)
      for (let j = 0; j < s.ny; j++)
        for (let i = 0; i <= NX; i++) {
          const k = id(s, i, j);
          const a = id(s, Math.min(NX, i + 1), j), b = id(s, Math.max(0, i - 1), j), c = id(s, i, Math.min(s.ny - 1, j + 1)), d = id(s, i, Math.max(0, j - 1));
          const ux = pos[a * 3] - pos[b * 3], uy = pos[a * 3 + 1] - pos[b * 3 + 1], uz = pos[a * 3 + 2] - pos[b * 3 + 2];
          const vx = pos[c * 3] - pos[d * 3], vy = pos[c * 3 + 1] - pos[d * 3 + 1], vz = pos[c * 3 + 2] - pos[d * 3 + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nrm[k * 3] = nx / l, nrm[k * 3 + 1] = ny / l, nrm[k * 3 + 2] = nz / l;
        }
  };

  const g12 = new Float64Array(12);
  let contacts = 0;
  const step = (h: number, stripFree: boolean) => {
    const h2 = h * h;
    for (let k = 0; k < n; k++) {
      if (inv[k] === 0) continue;
      const o = k * 3;
      const vn = SKIP.has('drag') ? 0 : vel[o] * nrm[o] + vel[o + 1] * nrm[o + 1] + vel[o + 2] * nrm[o + 2];
      vel[o] -= (DRAG_N * vn * nrm[o] + DRAG_T * vel[o]) * h;
      vel[o + 1] -= (DRAG_N * vn * nrm[o + 1] + DRAG_T * vel[o + 1]) * h + (grav[k] ? G * h : 0);
      vel[o + 2] -= (DRAG_N * vn * nrm[o + 2] + DRAG_T * vel[o + 2]) * h;
      const sp = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
      if (sp > VMAX) for (let a = 0; a < 3; a++) vel[o + a] *= VMAX / sp;
    }
    for (let o = 0; o < n * 3; o++) (prev[o] = pos[o]), (pos[o] += vel[o] * h);
    // le doigt
    if (gripOn && !SKIP.has('grip')) {
      const k = 1 / (1 + A_GRIP / h2);
      for (let g = 0; g < grip.length; g++) {
        const o = grip[g] * 3;
        pos[o] += (gripT[g * 3] - pos[o]) * k, pos[o + 1] += (gripT[g * 3 + 1] - pos[o + 1]) * k, pos[o + 2] += (gripT[g * 3 + 2] - pos[o + 2]) * k;
      }
    }
    // distances
    for (let c = 0; c < (SKIP.has('dist') ? 0 : DN); c++) {
      if (!dAlive[c]) continue;
      const a = di[c], b = dj[c];
      const wa = inv[a], wb = inv[b], ws = wa + wb;
      if (ws === 0) continue;
      const ax = a * 3, bx = b * 3;
      const ex = pos[bx] - pos[ax], ey = pos[bx + 1] - pos[ax + 1], ez = pos[bx + 2] - pos[ax + 2];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (L < 1e-12) continue;
      const s = -(L - dl[c]) / (ws + (da[c] + A_STRETCH) / h2) / L;
      pos[ax] -= wa * s * ex, pos[ax + 1] -= wa * s * ey, pos[ax + 2] -= wa * s * ez;
      pos[bx] += wb * s * ex, pos[bx + 1] += wb * s * ey, pos[bx + 2] += wb * s * ez;
    }
    // flexion
    for (let c = 0; c < (SKIP.has('bend') ? 0 : BN); c++) {
      const i1 = bw1[c], i2 = bw2[c], i3 = be1[c], i4 = be2[c];
      const w1 = inv[i1], w2 = inv[i2], w3 = inv[i3], w4 = inv[i4];
      if (w1 + w2 + w3 + w4 === 0) continue;
      const th = dihedral(pos, i1, i2, i3, i4, g12);
      if (Number.isNaN(th)) continue;
      let C = th - bTh[c];
      if (C > Math.PI) C -= 2 * Math.PI;
      else if (C < -Math.PI) C += 2 * Math.PI;
      const g = g12;
      const den = w1 * (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) + w2 * (g[3] * g[3] + g[4] * g[4] + g[5] * g[5]) + w3 * (g[6] * g[6] + g[7] * g[7] + g[8] * g[8]) + w4 * (g[9] * g[9] + g[10] * g[10] + g[11] * g[11]) + ba[c] / h2;
      if (den < 1e-12) continue;
      const lam = -C / den;
      const o1 = i1 * 3, o2 = i2 * 3, o3 = i3 * 3, o4 = i4 * 3;
      for (let a = 0; a < 3; a++) {
        pos[o1 + a] += w1 * lam * g[a];
        pos[o2 + a] += w2 * lam * g[3 + a];
        pos[o3 + a] += w3 * lam * g[6 + a];
        pos[o4 + a] += w4 * lam * g[9 + a];
      }
    }
    // film ↔ cartes (corps), avec frottement : la lèvre est entraînée par la carte qui glisse
    for (const s of SKIP.has('card') ? [] : [bF, bB])
      for (let k = s.base, e = s.base + s.ny * (NX + 1); k < e; k++) {
        if (inv[k] === 0) continue;
        const o = k * 3;
        const hz = stackH(pos[o], pos[o + 1], s.side);
        if (Number.isNaN(hz)) continue;
        const lim = hz + s.side * FILM_R;
        if (s.side > 0 ? pos[o + 2] < lim : pos[o + 2] > lim) {
          contacts++;
          pos[o + 2] = lim;
          // contact mou et sans rebond : la lèvre est écartée par la carte, pas projetée (vitesse normale bornée)
          const vz = (pos[o + 2] - prev[o + 2]) / h;
          if (Math.abs(vz) > CONTACT_V) prev[o + 2] = pos[o + 2] - Math.sign(vz) * CONTACT_V * h;
          const dy = pos[o + 1] - prev[o + 1];
          pos[o + 1] += (stackVy / SUB - dy) * 0.3;
          pos[o] -= (pos[o] - prev[o]) * 0.3;
        }
      }
    // avant ↔ dos du corps : l'avant reste devant (hors soudures)
    for (let j = 0; j < (SKIP.has('zo') ? 0 : bF.ny); j++)
      for (let i = 0; i <= NX; i++) {
        const f = id(bF, i, j), b = id(bB, i, j);
        if (fusedAt(rest[f * 3], rest[f * 3 + 1])) continue;
        const gap = pos[f * 3 + 2] - pos[b * 3 + 2], MIN = gapMin[j * (NX + 1) + i];
        if (gap >= MIN) continue;
        const wf = inv[f], wb = inv[b];
        if (wf + wb === 0) continue;
        const c = (MIN - gap) / (wf + wb);
        pos[f * 3 + 2] += wf * c, pos[b * 3 + 2] -= wb * c;
      }
    // avant ↔ dos de la bande : distance minimale
    for (let j = 2; j < (SKIP.has('smin') ? 0 : sF.ny); j++)
      for (let i = 0; i <= NX; i++) {
        const f = id(sF, i, j), b = id(sB, i, j);
        if (fusedAt(rest[f * 3], rest[f * 3 + 1])) continue;
        const ex = pos[f * 3] - pos[b * 3], ey = pos[f * 3 + 1] - pos[b * 3 + 1], ez = pos[f * 3 + 2] - pos[b * 3 + 2];
        const L = Math.hypot(ex, ey, ez), MIN = sgapMin[j * (NX + 1) + i];
        if (L >= MIN || L < 1e-9) continue;
        const wf = inv[f], wb = inv[b];
        if (wf + wb === 0) continue;
        const c = (MIN - L) / L / (wf + wb);
        pos[f * 3] += wf * c * ex, pos[f * 3 + 1] += wf * c * ey, pos[f * 3 + 2] += wf * c * ez;
        pos[b * 3] -= wb * c * ex, pos[b * 3 + 1] -= wb * c * ey, pos[b * 3 + 2] -= wb * c * ez;
      }
    // bande (déjà arrachée) ↔ corps
    if (!stripFree && !SKIP.has('hash')) {
      const R = 0.0035;
      for (const k of stripIds) {
        if (colTorn[colOf[k]] === 0) continue;
        const o = k * 3;
        const cx = Math.floor(pos[o] / CELL), cyy = Math.floor(pos[o + 1] / CELL), cz = Math.floor(pos[o + 2] / CELL);
        for (let ix = -1; ix <= 1; ix++)
          for (let iy = -1; iy <= 1; iy++)
            for (let iz = -1; iz <= 1; iz++) {
              const b = hash.get(hk(cx + ix, cyy + iy, cz + iz));
              if (!b) continue;
              for (const q of b) {
                const qo = q * 3;
                const ex = pos[o] - pos[qo], ey = pos[o + 1] - pos[qo + 1], ez = pos[o + 2] - pos[qo + 2];
                const d2 = ex * ex + ey * ey + ez * ez;
                if (d2 >= R * R || d2 < 1e-14) continue;
                const ws = inv[k] + inv[q];
                if (ws === 0) continue;
                const d = Math.sqrt(d2);
                const c = (R - d) / d / ws;
                pos[o] += inv[k] * c * ex, pos[o + 1] += inv[k] * c * ey, pos[o + 2] += inv[k] * c * ez;
                pos[qo] -= inv[q] * c * ex, pos[qo + 1] -= inv[q] * c * ey, pos[qo + 2] -= inv[q] * c * ez;
              }
            }
      }
    }
    for (let o = 0; o < n * 3; o++) vel[o] = ((pos[o] - prev[o]) / h) * DAMP;
  };

  /** plasticité : au-delà du seuil, l'angle de repos suit (le pli reste marqué) */
  const plastic = () => {
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      if (Number.isNaN(th)) continue;
      let ex = th - bTh[c];
      if (ex > Math.PI) ex -= 2 * Math.PI;
      else if (ex < -Math.PI) ex += 2 * Math.PI;
      if (Math.abs(ex) > YIELD) bTh[c] += (ex - Math.sign(ex) * YIELD) * CREEP;
    }
  };

  const diag = (tag: string) => {
    let vmax = 0, smax = 0, vk = 0, sk = 0;
    for (let k = 0; k < n; k++) {
      const v = Math.hypot(vel[k * 3], vel[k * 3 + 1], vel[k * 3 + 2]);
      if (v > vmax) (vmax = v), (vk = k);
    }
    for (let c = 0; c < DN; c++) {
      if (!dAlive[c] || dl[c] < 0.004) continue;
      const a = di[c] * 3, b = dj[c] * 3;
      const st = Math.abs(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / dl[c] - 1);
      if (st > smax) (smax = st), (sk = di[c]);
    }
    const where = (k: number) => {
      const s = sheets.find((q) => k >= q.base && k < q.base + q.ny * (NX + 1))!;
      return `${s.part === 'body' ? 'corps' : 'bande'}${s.side > 0 ? '+' : '-'}(${(k - s.base) % (NX + 1)},${Math.floor((k - s.base) / (NX + 1))})`;
    };
    tag += ` [v@${where(vk)} s@${where(sk)} contacts ${contacts}]`;
    contacts = 0;
    let gerr = 0;
    if (gripOn) for (let g = 0; g < grip.length; g++) gerr = Math.max(gerr, Math.hypot(pos[grip[g] * 3] - gripT[g * 3], pos[grip[g] * 3 + 1] - gripT[g * 3 + 1], pos[grip[g] * 3 + 2] - gripT[g * 3 + 2]));
    console.log(`${tag}  vmax ${vmax.toFixed(2)}  étirement max ${(smax * 100).toFixed(2)} %  doigt ${(gerr * 1000).toFixed(2)} mm`);
  };

  const frames: Float32Array[] = [];
  const runFrame = (stripFree: boolean) => {
    normals();
    rebuildHash();
    const h = FRAME_DT / SUB;
    for (let s = 0; s < SUB; s++) step(h, stripFree);
    plastic();
  };

  // repos : le film se pose (0,1 s), puis ce repos devient la référence de flexion
  for (let t = 0, fi = 0; t < 0.1; t += FRAME_DT, fi++) {
    runFrame(false);
    if (DEBUG && fi % 6 === 0) diag(`repos t=${t.toFixed(3)}`);
  }
  if (SKIP.has('stop')) process.exit(0);
  restAngles();
  vel.fill(0);

  // ── DÉCHIRURE
  let nextTear = 0;
  const totalTearFrames = Math.round(TEAR_DUR / FRAME_DT);
  for (let fi = 0; fi <= totalTearFrames; fi++) {
    const p = fi / totalTearFrames;
    const gp = gripPose(SKIP.has('gmove') ? 0 : p);
    setGripTarget(gp.c, gp.q);
    for (let c = 0; c < (SKIP.has('brk') ? 0 : DN); c++) if (dbrk[c] >= 0 && dAlive[c] && p >= breakAt[dbrk[c]]) (dAlive[c] = 0), (colTorn[dbrk[c]] = 1);
    runFrame(false);
    if (DEBUG && (fi % 6 === 0 || (p > 0.02 && p < 0.13))) diag(`déchirure p=${p.toFixed(3)}`);
    if (p > ENV('PSTOP', 2)) process.exit(0);
    while (nextTear < N_TEAR && p >= nextTear / (N_TEAR - 1) - 1e-9) frames.push(Float32Array.from(pos)), nextTear++;
  }
  for (let c = 0; c < DN; c++) if (dbrk[c] >= 0) dAlive[c] = 0;
  colTorn.fill(1);
  while (frames.length < N_TEAR) frames.push(Float32Array.from(pos));

  // ── SORTIE (horloge de la timeline des cartes)
  const g1 = gripPose(1);
  const totalExitFrames = Math.round(EXIT_DUR / FRAME_DT);
  const RELEASE = 0.16;
  let gc = g1.c.slice();
  const fl = V.flick, flL = Math.hypot(...fl);
  const qEnd = quatFromTo([-1, 0, 0], [fl[0] / flL, fl[1] / flL, fl[2] / flL]);
  let nextExit = 0;
  for (let fi = 0; fi <= totalExitFrames; fi++) {
    const t = fi * FRAME_DT;
    if (t < RELEASE) {
      // coup de poignet : le doigt accélère, la pince tourne vers le geste
      const k = t / RELEASE;
      gc = gc.map((x, a) => x + fl[a] * k * k * FRAME_DT);
      const qq = g1.q.map((x, a) => x * (1 - k * 0.6) + qEnd[a] * k * 0.6);
      const ql = Math.hypot(...qq);
      setGripTarget(gc, qq.map((x) => x / ql));
    } else if (gripOn) {
      // lâché : la bande part avec la vitesse du geste et tombe
      gripOn = false;
      for (const s of [sF, sB]) for (let k = s.base; k < s.base + s.ny * (NX + 1); k++) grav[k] = 1;
      for (const k of grip) for (let a = 0; a < 3; a++) vel[k * 3 + a] = fl[a] * (0.85 + rnd() * 0.3);
    }
    for (let k = 0; k < CARDS; k++) (cyPrev[k] = cy[k]), (cy[k] = cardY(k, t));
    runFrame(t >= STRIP_HIDE);
    if (DEBUG && fi % 6 === 0) diag(`sortie t=${t.toFixed(3)}`);
    while (nextExit < N_EXIT && t >= nextExit / EXIT_FPS - 1e-9) frames.push(Float32Array.from(pos)), nextExit++;
  }
  while (frames.length < N_TEAR + N_EXIT) frames.push(Float32Array.from(pos));
  return { sheets, rest, frames, n };
}

// ───────────────────────────── encodage
function encode(V: Variant, r: ReturnType<typeof simulate>, index: number) {
  const { sheets, rest, frames, n } = r;
  const header: TearBakeHeader = {
    format: TEAR_BAKE_FORMAT,
    seed: V.seed,
    index,
    q: Q,
    nx: NX + 1,
    sheets: sheets.map((s) => ({ part: s.part, side: s.side, ny: s.ny, ys: s.ys.map((y) => +y.toFixed(6)), base: s.base })),
    verts: n,
    nTear: N_TEAR,
    nExit: N_EXIT,
    exitFps: EXIT_FPS,
    stripHide: STRIP_HIDE,
    tearV: TEAR_V,
    delta: DELTA,
  };
  const hj = Buffer.from(JSON.stringify(header));
  const restF = Float32Array.from(rest);
  const F = frames.length;
  const q = new Int16Array(F * n * 3);
  const last = new Int32Array(n * 3);
  let clamped = 0;
  for (let f = 0; f < F; f++)
    for (let o = 0; o < n * 3; o++) {
      let cur = Math.round((frames[f][o] - restF[o]) / Q);
      if (cur > 32767 || cur < -32767) (cur = Math.max(-32767, Math.min(32767, cur))), clamped++;
      // écart à l'image précédente, plans x / y / z séparés (meilleure compression)
      q[f * n * 3 + (o % 3) * n + ((o / 3) | 0)] = cur - last[o];
      last[o] = cur;
    }
  const pad = (4 - ((8 + hj.length) % 4)) % 4;
  const raw = Buffer.concat([Buffer.from('TEAR'), Buffer.from(new Uint32Array([hj.length]).buffer), hj, Buffer.alloc(pad, 32), Buffer.from(restF.buffer), Buffer.from(q.buffer)]);
  return { gz: gzipSync(raw, { level: 9 }), raw: raw.length, clamped };
}

mkdirSync('public/bake', { recursive: true });
if (PREVIEW) mkdirSync('.cache/bake-tear', { recursive: true });
for (let v = 0; v < VARIANTS; v++) {
  if (ONLY !== undefined && +ONLY !== v) continue;
  const V = VARIANT_LIST[v % VARIANT_LIST.length];
  const t0 = performance.now();
  const r = simulate(V);
  const t1 = performance.now();
  const e = encode(V, r, v);
  writeFileSync(`public/bake/tear-${v}.tear`, e.gz);
  console.log(`variante ${v} (graine ${V.seed}) : ${r.n} sommets × ${r.frames.length} images, simulée en ${((t1 - t0) / 1000).toFixed(1)} s — ${(e.raw / 1e6).toFixed(2)} Mo bruts → ${(e.gz.length / 1e6).toFixed(2)} Mo gzip${e.clamped ? ` (${e.clamped} valeurs écrêtées)` : ''}`);
  if (PREVIEW) {
    const pick = [0, 1, 2, 3, 4, 8, 16, 24, 32, 40, 48, 49 + 3, 49 + 6, 49 + 9, 49 + 12, 49 + 15, 49 + 18, 49 + 24, 49 + 30, 49 + 42];
    writeFileSync(`.cache/bake-tear/preview-${v}.json`, JSON.stringify({ nx: NX + 1, nTear: N_TEAR, exitFps: EXIT_FPS, sheets: r.sheets.map((s) => ({ part: s.part, side: s.side, ny: s.ny, base: s.base })), frames: pick.filter((f) => f < r.frames.length).map((f) => ({ f, p: Array.from(r.frames[f], (x) => +x.toFixed(5)) })) }));
  }
}
