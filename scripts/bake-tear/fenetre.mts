/**
 * SIMULATEUR HORS-LIGNE de la « Fenêtre » (27/11, V3, succès « Braise ») : les cartes ouvrent le sachet DE L'INTÉRIEUR,
 * à travers la face avant. Même film que la Déchirure et le Retroussé (alu / PET, XPBD, flexion par angle dièdre,
 * plasticité), sa propre boucle de pas : rien de bake.mts ni de retrousse.mts n'est modifié.
 *
 *   npm run bake:fenetre                              → public/bake/fenetre-0.tear, fenetre-1.tear
 *   npm run bake:fenetre -- --only=0 --preview        → aussi $STATSDIR/preview-0.json (défaut .cache/bake-fenetre)
 *   réglages (variables d'environnement) : PUSH, FBRK, KCORNER, RCORNER, JIT, TAU, ACUT, SUB, ITER, POSTD, ABEND,
 *     YIELD, DAMPB, ZOUT, GPANEL, SMOOTH ; PSTOP (arrêt anticipé), NOBRK=1 (aucune rupture : mesure des efforts)
 *
 * Le scénario :
 *  - nappes : `body` face avant = le CADRE (grille entière, trou au format exact de la pile : `hole`), `body` dos (entier),
 *    `strip` = le PANNEAU (la face avant dans le contour de la pile, sa propre grille). Grille non uniforme (`xs`) pour que
 *    le contour tombe sur des lignes de la grille ; sommets du contour doublés (cadre ≡ panneau), liés à longueur nulle ;
 *  - avant la rupture, le cadre et le panneau sont UN film : distances de chaque côté, flexion à travers le contour ;
 *  - la PILE pousse vers le joueur (z) : le doigt pilote son avancée (phase pilotée, p = 0..1). La face avant se tend
 *    sur elle ; aucune rupture n'est écrite d'avance : chaque lien du contour S'USE quand l'effort qu'il transmet passe
 *    son seuil (usure ∝ dépassement, constante de temps TAU), et cède usé. Les coins de la pile sont plus fragiles
 *    (KCORNER, rayon RCORNER : un coin de carte perce) ; un lien rompu reporte l'effort sur ses voisins, d'où les fronts
 *    qui courent le long des bords ;
 *  - soudures avant ↔ dos (côtés, crans) : ne cèdent jamais. La main tient le cran du bas (épinglé), ni pouce ni doigts ;
 *  - sortie (temps) : la pile sort droit vers le joueur (ZOUT) avec le panneau plaqué dessus, puis le panneau glisse et
 *    tombe (gravité GPANEL, part de g) ; le sachet reste, percé au format des cartes.
 * Enregistrement : N_DRIVE images pilotées + sortie à EXIT_FPS. En-tête : ruptures (`events` : `corner` = un coin perce,
 * `free` = le dernier lien cède), part du contour rompue à chaque image pilotée (`cut`), la fenêtre (`window`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PACK, PACK_SIDE_SEAM, PACK_STACK, TEAR_V, lcg, packRestZ } from '../../src/core/packCrease';
import { EASE } from '../../src/core/ease';
import { TEAR_BAKE_FORMAT, type TearBakeEvent, type TearBakeHeader, type TearBakeSheet } from '../../src/core/tearBakeFormat';

const ENV = (k: string, d: number) => (process.env[k] !== undefined ? +process.env[k]! : d);

// ───────────────────────────── dimensions (unités de la scène : 1 = 100 mm)
const { w: W, h: H, crimp: CRIMP } = PACK;
const SEAM_X = W / 2 - PACK_SIDE_SEAM, SEAM_Y = H / 2 - CRIMP;
const FILM_R = 0.0016;
/** marge du bord du trou contre la tranche de la pile */
const LAT_R = 0.0003;
const G = 98.1;
const CARDS = 5;
const CARD_T = 0.012 * PACK_STACK.s, CARD_E = CARD_T / 2, CARD_R = 0.031 * PACK_STACK.s;
const cardZ = (k: number) => (k - (CARDS - 1) / 2) * 0.0072;
/** la fenêtre = le contour de la pile */
export const WIN = { x0: -PACK_STACK.hw, x1: PACK_STACK.hw, y0: PACK_STACK.cy - PACK_STACK.hh, y1: PACK_STACK.cy + PACK_STACK.hh };
// grille : colonnes et rangées tombent exactement sur le contour (pas ≈ 1,44 mm partout)
const NXL = 11, NXW = 40, NYB = 17, NYW = 56, NYT = 21;
const lin = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
const XS = [...lin(-W / 2, WIN.x0, NXL), ...lin(WIN.x0, WIN.x1, NXW).slice(1), ...lin(WIN.x1, W / 2, NXL).slice(1)];
const YS = [...lin(-H / 2, WIN.y0, NYB), ...lin(WIN.y0, WIN.y1, NYW).slice(1), ...lin(WIN.y1, H / 2, NYT).slice(1)];
const NC = XS.length, NR = YS.length;
const I0 = NXL, I1 = NXL + NXW, J0 = NYB, J1 = NYB + NYW;
const PNC = NXW + 1, PNR = NYW + 1;

// pile : avancée vers le joueur pendant la phase pilotée (PUSH à p = 1), puis sortie (ZOUT)
const PUSH = ENV('PUSH', 0.045);
const Z_OUT = ENV('ZOUT', 0.16);
const OUT_DUR = 0.32, DROP_AT = 0.3;
const pushZ = (p: number) => PUSH * p;
const outZ = (t: number) => PUSH + (Z_OUT - PUSH) * EASE.glide(Math.min(1, Math.max(0, t / OUT_DUR)));

// enregistrement
export const N_DRIVE = 73;
const STEP_PER_IMG = 3;
const FRAME_DT = 1 / 240;
const EXIT_DUR = 1.0;
export const EXIT_FPS = 24;
export const N_EXIT = Math.round(EXIT_DUR * EXIT_FPS) + 1;
const PANEL_HIDE = 0.95;
const Q = 5e-5; // corps : 5 µm (±1,6 unité)
const Q_PANEL = 2e-4; // panneau : 20 µm (±6,5 unités : il tombe loin)
const SUB = ENV('SUB', 12);
const VMAX = 40;

// matière
const A_BEND = ENV('ABEND', 3e-3);
const A_BEND_SEAM = A_BEND / 6;
const A_STRETCH = ENV('ASTR', 1e-8);
const A_WELD = 1e-7;
const A_CUT = ENV('ACUT', 1e-7);
const YIELD = ENV('YIELD', 0.05), CREEP = 0.3;
const DRAG_N = 9, DRAG_T = 0.6;
const CONTACT_V = ENV('CV', 1.2);
const DAMP = ENV('DAMP', 0.9995);
const DAMP_BODY = ENV('DAMPB', 0.995);
const ITER = ENV('ITER', 2), POSTD = ENV('POSTD', 2);
const G_PANEL = ENV('GPANEL', 0.35);
/** panneau plaqué : rattrapé s'il s'écarte de moins de STICK_Z de la carte (pendant la sortie, avant DROP_AT) */
const STICK_Z = ENV('STICKZ', 0.006);
/**
 * raideur de flexion du panneau (A_BEND / PSTIFF). Essayé le 27/11 : 3 → le panneau vibre et se plisse en bas à gauche
 * dès que son coin se libère (XPBD à une itération) ; 1 (comme le film) + panneau plaqué (STICK_Z) : plat jusqu'à sa chute
 */
const PSTIFF = ENV('PSTIFF', 1);
// rupture à l'effort
/**
 * seuil d'effort d'un lien du contour (λ / h², masses unitaires). Mesuré le 27/11 (variante 0, NOBRK=1, DUMPP) : à 1 mm
 * de poussée, ≈ 150-190 près des coins du haut, 250-400 près de ceux du bas (la main), 20-60 au milieu des bords. À 250
 * (± 15 %) : les 4 coins percent entre p 0,17 et 0,18, les fronts courent jusqu'à p ≈ 0,6, les derniers liens cèdent au
 * bout du geste
 */
const F_BRK = ENV('FBRK', 250);
const K_CORNER = ENV('KCORNER', 0.6), R_CORNER = ENV('RCORNER', 0.035);
const JIT = ENV('JIT', 0.15);
const TAU = ENV('TAU', 0.012);
const NOBRK = ENV('NOBRK', 0) > 0;
/** bombé de la pile pendant la poussée (avance des coins sur le centre) */
const BOW = ENV('BOW', 0.008);

interface FVariant {
  seed: number;
  /** décalage latéral du panneau qui tombe (unités / s) */
  slide: number;
}
const VARIANT_LIST: FVariant[] = [
  { seed: 71, slide: 0.35 },
  { seed: 97, slide: -0.3 },
];

/** angle dièdre signé de l'arête (x3, x4), ailes x1, x2 ; gradients dans g (12) — Bridson et al. 2003 (copie de bake.mts) */
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

export interface FrameDiag {
  /** étirement max des arêtes du film (hors liens) */
  st: number;
  /** effort max transmis par un lien du contour encore entier (unités du seuil) */
  fmax: number;
  /** liens du contour rompus (cumul) */
  cut: number;
  vmax: number;
  caps: number;
}

function simulate(V: FVariant, debug: boolean) {
  const rnd = lcg(V.seed);
  const inHoleCell = (i: number, j: number) => i >= I0 && i < I1 && j >= J0 && j < J1;
  const ghost = (i: number, j: number) => i > I0 && i < I1 && j > J0 && j < J1;
  const sheets: TearBakeSheet[] = [
    { part: 'body', side: 1, ny: NR, ys: YS, base: 0, nx: NC, xs: XS, hole: [I0, I1, J0, J1] },
    { part: 'body', side: -1, ny: NR, ys: YS, base: NR * NC, nx: NC, xs: XS },
    { part: 'strip', side: 1, ny: PNR, ys: YS.slice(J0, J1 + 1), base: 2 * NR * NC, nx: PNC, xs: XS.slice(I0, I1 + 1) },
  ];
  const n = 2 * NR * NC + PNR * PNC;
  const fid = (i: number, j: number) => j * NC + i; // cadre (face avant)
  const bid = (i: number, j: number) => NR * NC + j * NC + i; // dos
  const pid = (i: number, j: number) => 2 * NR * NC + (j - J0) * PNC + (i - I0); // panneau, en indices de la grille entière
  /** sommet réel d'un coin de cellule : la cellule dedans → panneau, dehors → cadre */
  const vOf = (i: number, j: number, inside: boolean) => (inside ? pid(i, j) : fid(i, j));

  const pos = new Float64Array(n * 3), prev = new Float64Array(n * 3), vel = new Float64Array(n * 3), rest = new Float64Array(n * 3);
  const inv = new Float64Array(n).fill(1);
  const grav = new Uint8Array(n);
  const isPanel = (k: number) => k >= 2 * NR * NC;
  const setRest = (k: number, i: number, j: number, side: 1 | -1) => {
    const x = XS[i], y = YS[j], u = x / W + 0.5, v = y / H + 0.5;
    // imperceptible irrégularité du film (même formule que la déchirure ; colonne de la grille ENTIÈRE : le cadre et le
    // panneau ont exactement le même repos sur le contour)
    const hz = Math.sin(i * 12.9898 + Math.round(y * 1e5) * 0.0078233 + side * 3.7 + V.seed) * 43758.5453;
    const z = packRestZ(u, v, side, 0, true) + side * (hz - Math.floor(hz) - 0.5) * 0.0004 * (Math.abs(x) < SEAM_X ? 1 : 0);
    rest[k * 3] = x, rest[k * 3 + 1] = y, rest[k * 3 + 2] = z;
  };
  for (let j = 0; j < NR; j++)
    for (let i = 0; i < NC; i++) {
      setRest(fid(i, j), i, j, 1);
      setRest(bid(i, j), i, j, -1);
      if (ghost(i, j)) inv[fid(i, j)] = 0; // sommets du cadre DANS le trou : jamais utilisés (ni triangles ni liens)
      if (i >= I0 && i <= I1 && j >= J0 && j <= J1) setRest(pid(i, j), i, j, 1);
    }
  pos.set(rest);
  prev.set(rest);
  const fusedAt = (x: number, y: number) => Math.abs(x) >= SEAM_X - 1e-6 || Math.abs(y) >= SEAM_Y - 1e-6;
  const len = (a: number, b: number) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);

  // ── triangles : face avant sur la grille ENTIÈRE (sommets réels du cadre ou du panneau selon la cellule), dos entier
  const dI: number[] = [], dJ: number[] = [], dL: number[] = [];
  const bW1: number[] = [], bW2: number[] = [], bE1: number[] = [], bE2: number[] = [], bA: number[] = [], bCut: number[] = [];
  const distSeen = new Set<number>();
  const addDist = (a: number, b: number) => {
    const key = Math.min(a, b) * n + Math.max(a, b);
    if (distSeen.has(key)) return;
    distSeen.add(key);
    dI.push(a), dJ.push(b), dL.push(len(a, b));
  };
  /** contour : sommet de la grille entière sur le bord de la fenêtre */
  const onCut = (i: number, j: number) => ((i === I0 || i === I1) && j >= J0 && j <= J1) || ((j === J0 || j === J1) && i >= I0 && i <= I1);
  const cutIndex = new Map<number, number>(); // clé grille (j·NC + i) → lien du contour
  for (const face of ['front', 'back'] as const) {
    // arêtes clés par sommets de la GRILLE (pas réels) : une arête du contour a deux copies réelles, une par côté
    const edges = new Map<number, { e: Array<[number, number]>; w: number[] }>();
    for (let j = 0; j < NR - 1; j++)
      for (let i = 0; i < NC - 1; i++) {
        const inside = face === 'front' && inHoleCell(i, j);
        const V4 = (ii: number, jj: number) => (face === 'back' ? bid(ii, jj) : vOf(ii, jj, inside));
        const g = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const; // a b c d
        for (const t of [[0, 1, 3], [0, 3, 2]]) {
          for (let e = 0; e < 3; e++) {
            const p = g[t[e]], q = g[t[(e + 1) % 3]], o = g[t[(e + 2) % 3]];
            const kp = p[1] * NC + p[0], kq = q[1] * NC + q[0];
            const key = Math.min(kp, kq) * (NC * NR) + Math.max(kp, kq);
            const rp = V4(p[0], p[1]), rq = V4(q[0], q[1]);
            addDist(rp, rq);
            const E = edges.get(key);
            const pair: [number, number] = kp < kq ? [rp, rq] : [rq, rp];
            if (E) E.e.push(pair), E.w.push(V4(o[0], o[1]));
            else edges.set(key, { e: [pair], w: [V4(o[0], o[1])] });
          }
        }
      }
    for (const E of edges.values()) {
      if (E.w.length < 2) continue;
      // flexion : arête du cadre si elle en a une (copie dehors), sinon du panneau ; `cut` = à travers le contour
      const [e1, e2] = E.e.find(([a]) => !isPanel(a)) ?? E.e[0];
      const across = E.e.length === 2 && (isPanel(E.e[0][0]) !== isPanel(E.e[1][0]));
      bE1.push(e1), bE2.push(e2), bW1.push(E.w[0]), bW2.push(E.w[1]);
      const seam = (k: number) => fusedAt(rest[k * 3], rest[k * 3 + 1]);
      bA.push(seam(e1) && seam(e2) ? A_BEND_SEAM : isPanel(e1) && isPanel(E.w[0]) && isPanel(E.w[1]) ? A_BEND / PSTIFF : A_BEND);
      bCut.push(across ? 1 : 0);
    }
  }
  const EN = dI.length;
  // ── soudures avant ↔ dos (ne cèdent jamais), écart de repos
  const sI: number[] = [], sJ: number[] = [];
  for (let j = 0; j < NR; j++)
    for (let i = 0; i < NC; i++) if (fusedAt(XS[i], YS[j])) sI.push(fid(i, j)), sJ.push(bid(i, j));
  const SN = sI.length;
  // ── liens du contour (cadre ≡ panneau), longueur nulle, seuil d'effort par lien
  const cI: number[] = [], cJ: number[] = [], cF: number[] = [], cX: number[] = [], cY: number[] = [];
  for (let j = J0; j <= J1; j++)
    for (let i = I0; i <= I1; i++) {
      if (!onCut(i, j)) continue;
      const x = XS[i], y = YS[j];
      // distance au coin le plus proche : un coin de carte perce plus tôt
      const dc = Math.min(...[[WIN.x0, WIN.y0], [WIN.x1, WIN.y0], [WIN.x0, WIN.y1], [WIN.x1, WIN.y1]].map(([cx, cy]) => Math.hypot(x - cx, y - cy)));
      const kc = dc < R_CORNER ? K_CORNER + (1 - K_CORNER) * (dc / R_CORNER) ** 2 : 1;
      cutIndex.set(j * NC + i, cI.length);
      cI.push(fid(i, j)), cJ.push(pid(i, j)), cF.push(F_BRK * kc * (1 + JIT * (rnd() * 2 - 1))), cX.push(x), cY.push(y);
    }
  const CN = cI.length;
  const cAlive = new Uint8Array(CN).fill(1), cDmg = new Float64Array(CN), cFrame = new Float64Array(CN), cBrkP = new Float64Array(CN).fill(-1);
  const di = Int32Array.from([...dI, ...sI]), dj = Int32Array.from([...dJ, ...sJ]);
  const dl = Float64Array.from([...dL, ...sI.map((a, c) => len(a, sJ[c]))]);
  const DN = EN + SN;
  const ci = Int32Array.from(cI), cj = Int32Array.from(cJ), cf = Float64Array.from(cF);
  // flexion à travers le contour : coupée dès qu'un lien d'une extrémité cède
  const BN = bE1.length;
  const be1 = Int32Array.from(bE1), be2 = Int32Array.from(bE2), bw1 = Int32Array.from(bW1), bw2 = Int32Array.from(bW2), ba = Float64Array.from(bA);
  const bAlive = new Uint8Array(BN).fill(1);
  const cutOfVert = new Map<number, number>();
  for (let c = 0; c < CN; c++) cutOfVert.set(ci[c], c);
  const bCutLinks: number[][] = bCut.map((x, c) => (x ? [cutOfVert.get(be1[c]) ?? -1, cutOfVert.get(be2[c]) ?? -1].filter((v) => v >= 0) : []));
  const bTh = new Float64Array(BN);
  const restAngles = () => {
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      bTh[c] = Number.isNaN(th) ? 0 : th;
    }
  };
  restAngles();
  // avant ↔ dos (cadre seulement : le panneau a les cartes entre lui et le dos)
  const gapMin = new Float64Array(NR * NC);
  for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) gapMin[j * NC + i] = Math.min(0.0009, 0.8 * (rest[fid(i, j) * 3 + 2] - rest[bid(i, j) * 3 + 2]));

  // ── les mains : cran du bas épinglé (face avant et dos) ; PINTOP : le cran du haut aussi (sachet tenu des deux
  // côtés : sinon le haut, libre, glisse vers la pile et le film n'y est jamais tendu — le bord du haut ne cédait pas)
  const PINTOP = ENV('PINTOP', 1) > 0;
  for (let j = 0; j < NR; j++)
    if (YS[j] <= -H / 2 + CRIMP * 0.85 || (PINTOP && YS[j] >= H / 2 - CRIMP * 0.85)) for (let i = 0; i < NC; i++) (inv[fid(i, j)] = 0), (inv[bid(i, j)] = 0);

  /** empreinte de la pile (rectangle à coins arrondis) : distance signée d (< 0 dedans) et direction de sortie (gx, gy) */
  const footprint = (x: number, y: number) => {
    const sx = x < 0 ? -1 : 1, sy = y < PACK_STACK.cy ? -1 : 1;
    const qx = Math.abs(x) - PACK_STACK.hw + CARD_R, qy = Math.abs(y - PACK_STACK.cy) - PACK_STACK.hh + CARD_R;
    if (qx > 0 && qy > 0) {
      const l = Math.hypot(qx, qy);
      return { d: l - CARD_R, gx: (sx * qx) / l, gy: (sy * qy) / l };
    }
    return qx > qy ? { d: qx - CARD_R, gx: sx, gy: 0 } : { d: qy - CARD_R, gx: 0, gy: sy };
  };
  // ── cartes (pile entière avancée de zOff). BOMBÉ : la pile pousse d'abord par ses coins (BOW au coin, BOW / 2 au
  // milieu d'un bord, 0 au centre ; seulement côté joueur et seulement pendant la poussée) — ce sont eux qui tendent le
  // film en premier, d'où les coins qui percent. Moins d'un millimètre : invisible une fois les cartes dehors.
  let zOff = 0, zPrev = 0, bow = 0;
  const stackH = (x: number, y: number, s: number): number => {
    let best = NaN;
    const qx = Math.abs(x) - PACK_STACK.hw + CARD_R, qy = Math.abs(y - PACK_STACK.cy) - PACK_STACK.hh + CARD_R;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CARD_R;
    if (d >= 0) return NaN;
    const top = d < -CARD_E ? CARD_E : Math.sqrt(Math.max(0, CARD_E * CARD_E - (d + CARD_E) * (d + CARD_E)));
    const ux = Math.abs(x) / PACK_STACK.hw, uy = Math.abs(y - PACK_STACK.cy) / PACK_STACK.hh;
    const zb = s > 0 && bow > 0 ? (bow * (ux ** 4 + uy ** 4)) / 2 : 0;
    for (let k = 0; k < CARDS; k++) {
      const z = cardZ(k) + zOff + zb + s * top;
      if (Number.isNaN(best) || (s > 0 ? z > best : z < best)) best = z;
    }
    return best;
  };

  // ── normales (traînée de l'air) : différences centrées sur chaque grille
  const nrm = new Float64Array(n * 3);
  const gridNormals = (base: number, nx: number, ny: number) => {
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = base + j * nx + i;
        const a = base + j * nx + Math.min(nx - 1, i + 1), b = base + j * nx + Math.max(0, i - 1), c = base + Math.min(ny - 1, j + 1) * nx + i, d = base + Math.max(0, j - 1) * nx + i;
        const ux = pos[a * 3] - pos[b * 3], uy = pos[a * 3 + 1] - pos[b * 3 + 1], uz = pos[a * 3 + 2] - pos[b * 3 + 2];
        const vx = pos[c * 3] - pos[d * 3], vy = pos[c * 3 + 1] - pos[d * 3 + 1], vz = pos[c * 3 + 2] - pos[d * 3 + 2];
        const nx2 = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx2, ny2, nz) || 1;
        nrm[k * 3] = nx2 / l, nrm[k * 3 + 1] = ny2 / l, nrm[k * 3 + 2] = nz / l;
      }
  };
  const normals = () => {
    gridNormals(0, NC, NR);
    gridNormals(NR * NC, NC, NR);
    gridNormals(2 * NR * NC, PNC, PNR);
  };

  const g12 = new Float64Array(12);
  let caps = 0, fric = 0.3, panelFree = false, carried = false, vWhere = '', stWhere = '';
  const distances = (h2: number) => {
    for (let c = 0; c < DN; c++) {
      const a = di[c], b = dj[c];
      const wa = inv[a], wb = inv[b], ws = wa + wb;
      if (ws === 0) continue;
      const ax = a * 3, bx = b * 3;
      const ex = pos[bx] - pos[ax], ey = pos[bx + 1] - pos[ax + 1], ez = pos[bx + 2] - pos[ax + 2];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (L < 1e-12) continue;
      const s = -(L - dl[c]) / (ws + (c < EN ? A_STRETCH : A_WELD) / h2) / L;
      pos[ax] -= wa * s * ex, pos[ax + 1] -= wa * s * ey, pos[ax + 2] -= wa * s * ez;
      pos[bx] += wb * s * ex, pos[bx + 1] += wb * s * ey, pos[bx + 2] += wb * s * ez;
    }
  };
  /** liens du contour : projection à longueur nulle ; l'effort transmis (λ / h²) est cumulé pour l'usure */
  const cutLinks = (h2: number, acc: boolean) => {
    for (let c = 0; c < CN; c++) {
      if (!cAlive[c]) continue;
      const a = ci[c], b = cj[c];
      const wa = inv[a], wb = inv[b], ws = wa + wb;
      if (ws === 0) continue;
      const ax = a * 3, bx = b * 3;
      const ex = pos[bx] - pos[ax], ey = pos[bx + 1] - pos[ax + 1], ez = pos[bx + 2] - pos[ax + 2];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (L < 1e-14) continue;
      const lam = L / (ws + A_CUT / h2);
      if (acc) cFrame[c] = Math.max(cFrame[c], lam / h2);
      const s = -lam / L;
      pos[ax] -= wa * s * ex, pos[ax + 1] -= wa * s * ey, pos[ax + 2] -= wa * s * ez;
      pos[bx] += wb * s * ex, pos[bx + 1] += wb * s * ey, pos[bx + 2] += wb * s * ez;
    }
  };
  const step = (h: number) => {
    const h2 = h * h;
    for (let k = 0; k < n; k++) {
      if (inv[k] === 0) continue;
      const o = k * 3;
      const vn = vel[o] * nrm[o] + vel[o + 1] * nrm[o + 1] + vel[o + 2] * nrm[o + 2];
      vel[o] -= (DRAG_N * vn * nrm[o] + DRAG_T * vel[o]) * h;
      vel[o + 1] -= (DRAG_N * vn * nrm[o + 1] + DRAG_T * vel[o + 1]) * h + (grav[k] ? G * G_PANEL * h : 0);
      vel[o + 2] -= (DRAG_N * vn * nrm[o + 2] + DRAG_T * vel[o + 2]) * h;
      const sp = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
      if (sp > VMAX) {
        caps++;
        for (let a = 0; a < 3; a++) vel[o + a] *= VMAX / sp;
      }
    }
    for (let o = 0; o < n * 3; o++) (prev[o] = pos[o]), (pos[o] += vel[o] * h);
    for (let it = 0; it < ITER; it++) {
      distances(h2);
      cutLinks(h2, it === ITER - 1);
    }
    // flexion
    for (let c = 0; c < BN; c++) {
      if (!bAlive[c]) continue;
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
    for (let it = 0; it < POSTD; it++) {
      distances(h2);
      cutLinks(h2, false);
    }
    // film ↔ cartes : face avant (cadre + panneau) devant la pile, dos derrière ; frottement (le panneau est plaqué).
    // Un sommet du CADRE dans l'empreinte de la pile mais plus près de sa tranche que de sa face (la pile passe par le
    // trou) est écarté DE CÔTÉ, sur le bord de l'empreinte, au lieu d'être renvoyé devant la pile
    const dzs = (zOff - zPrev) / SUB;
    for (let k = 0; k < n; k++) {
      if (inv[k] === 0) continue;
      const o = k * 3;
      const side = k >= NR * NC && k < 2 * NR * NC ? -1 : 1;
      const hz = stackH(pos[o], pos[o + 1], side);
      if (Number.isNaN(hz)) continue;
      const lim = hz + side * FILM_R;
      if (k < NR * NC && pos[o + 2] < lim) {
        const e = footprint(pos[o], pos[o + 1]);
        // (marge latérale 0,3 mm : avec FILM_R, 1,6 mm, plus d'une maille, l'arête voisine s'étirait de 11 %)
        if (-e.d + LAT_R < lim - pos[o + 2]) {
          const m = -e.d + LAT_R;
          pos[o] += e.gx * m, pos[o + 1] += e.gy * m;
          continue;
        }
      }
      // panneau PLAQUÉ sur la carte de devant pendant la sortie (avant DROP_AT) : il ne la quitte pas quand elle freine
      const stick = isPanel(k) && carried && pos[o + 2] > lim && pos[o + 2] < lim + STICK_Z;
      if (stick || (side > 0 ? pos[o + 2] < lim : pos[o + 2] > lim)) {
        pos[o + 2] = lim;
        const vz = (pos[o + 2] - prev[o + 2]) / h;
        const vmax = CONTACT_V + Math.max(0, (dzs / h) * side);
        if (Math.abs(vz) > vmax) prev[o + 2] = pos[o + 2] - Math.sign(vz) * vmax * h;
        pos[o] -= (pos[o] - prev[o]) * fric;
        pos[o + 1] -= (pos[o + 1] - prev[o + 1]) * fric;
      }
    }
    // avant ↔ dos du cadre : l'avant reste devant
    for (let j = 0; j < NR; j++)
      for (let i = 0; i < NC; i++) {
        if (ghost(i, j)) continue;
        const f = fid(i, j), b = bid(i, j);
        const gap = pos[f * 3 + 2] - pos[b * 3 + 2], MIN = gapMin[j * NC + i];
        if (gap >= MIN) continue;
        const wf = inv[f], wb = inv[b];
        if (wf + wb === 0) continue;
        const c = (MIN - gap) / (wf + wb);
        pos[f * 3 + 2] += wf * c, pos[b * 3 + 2] -= wb * c;
      }
    for (let k = 0; k < n; k++) {
      const o = k * 3, dk = isPanel(k) ? (panelFree ? DAMP : DAMP_BODY) : DAMP_BODY;
      vel[o] = ((pos[o] - prev[o]) / h) * dk, vel[o + 1] = ((pos[o + 1] - prev[o + 1]) / h) * dk, vel[o + 2] = ((pos[o + 2] - prev[o + 2]) / h) * dk;
    }
  };

  const plastic = () => {
    for (let c = 0; c < BN; c++) {
      if (!bAlive[c]) continue;
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      if (Number.isNaN(th)) continue;
      let ex = th - bTh[c];
      if (ex > Math.PI) ex -= 2 * Math.PI;
      else if (ex < -Math.PI) ex += 2 * Math.PI;
      if (Math.abs(ex) > YIELD) bTh[c] += (ex - Math.sign(ex) * YIELD) * CREEP;
    }
  };

  /** usure des liens du contour sur l'image qui vient de passer ; renvoie les liens rompus */
  const wear = (dt: number, p: number): number[] => {
    const broke: number[] = [];
    if (NOBRK) return broke;
    for (let c = 0; c < CN; c++) {
      if (!cAlive[c]) continue;
      const r = cFrame[c] / cf[c];
      if (r > 1) cDmg[c] += ((r - 1) * dt) / TAU;
      if (cDmg[c] >= 1) broke.push(c);
    }
    for (const c of broke) {
      cAlive[c] = 0;
      cBrkP[c] = p;
    }
    if (broke.length)
      for (let c = 0; c < BN; c++) if (bAlive[c] && bCutLinks[c].length && bCutLinks[c].some((l) => !cAlive[l])) bAlive[c] = 0;
    return broke;
  };

  const measure = (): FrameDiag => {
    let st = 0, vmax = 0, fmax = 0, cut = 0, sc = 0;
    for (let c = 0; c < EN; c++) {
      const a = di[c] * 3, b = dj[c] * 3;
      if (inv[di[c]] === 0 && inv[dj[c]] === 0) continue;
      const s2 = Math.abs(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / dl[c] - 1);
      if (s2 > st) (st = s2), (sc = c);
    }
    const tagOf = (k: number) => {
      const sh = k >= 2 * NR * NC ? 'panneau' : k >= NR * NC ? 'dos' : 'cadre';
      const kk = k >= 2 * NR * NC ? k - 2 * NR * NC : k % (NR * NC), nx = k >= 2 * NR * NC ? PNC : NC;
      return `${sh}(${kk % nx},${Math.floor(kk / nx)})`;
    };
    if (debug) stWhere = ` [étirement@${tagOf(di[sc])}-${tagOf(dj[sc])}]`;
    for (let c = 0; c < CN; c++) {
      if (cAlive[c]) fmax = Math.max(fmax, cFrame[c] / F_BRK);
      else cut++;
    }
    let vk = 0;
    for (let k = 0; k < n; k++) {
      const v = Math.hypot(vel[k * 3], vel[k * 3 + 1], vel[k * 3 + 2]);
      if (v > vmax) (vmax = v), (vk = k);
    }
    const d = { st, fmax, cut, vmax, caps };
    if (debug) {
      const sh = vk >= 2 * NR * NC ? 'panneau' : vk >= NR * NC ? 'dos' : 'cadre';
      const kk = vk >= 2 * NR * NC ? vk - 2 * NR * NC : vk % (NR * NC), nx = vk >= 2 * NR * NC ? PNC : NC;
      vWhere = ` [vmax@${sh}(${kk % nx},${Math.floor(kk / nx)})]`;
    }
    caps = 0;
    return d;
  };

  const frames: Float32Array[] = [];
  const diags: FrameDiag[] = [];
  const cutRec: number[] = [];
  const runFrame = () => {
    normals();
    cFrame.fill(0);
    const h = FRAME_DT / SUB;
    for (let s = 0; s < SUB; s++) step(h);
    plastic();
  };

  // repos : le film se pose (0,2 s), puis ce repos devient la référence de flexion
  for (let t = 0; t < 0.2; t += FRAME_DT) runFrame();
  restAngles();
  vel.fill(0);

  // ── PHASE PILOTÉE : la pile avance de pushZ(p)
  const events: TearBakeEvent[] = [];
  const PSTOP = ENV('PSTOP', 2);
  const nSteps = (N_DRIVE - 1) * STEP_PER_IMG;
  const cornerSeen = new Set<string>();
  let freeP = -1;
  for (let s = 0; s <= nSteps; s++) {
    const p = s / nSteps;
    if (p > PSTOP) break;
    zPrev = zOff;
    zOff = pushZ(p);
    bow = BOW * Math.min(1, p / 0.2);
    runFrame();
    const broke = wear(FRAME_DT, p);
    for (const c of broke) {
      // un coin perce : premier lien rompu à moins de R_CORNER d'un coin (un événement par coin)
      const sx = cX[c] < 0 ? -1 : 1, sy = cY[c] < PACK_STACK.cy ? -1 : 1;
      const dc = Math.hypot(cX[c] - (sx < 0 ? WIN.x0 : WIN.x1), cY[c] - (sy < 0 ? WIN.y0 : WIN.y1));
      const key = `${sx}:${sy}`;
      if (dc < R_CORNER * 1.5 && !cornerSeen.has(key)) {
        cornerSeen.add(key);
        events.push({ k: 'corner', p: +p.toFixed(4), x: sx, y: +(sy < 0 ? WIN.y0 : WIN.y1).toFixed(4), f: 1 });
      }
    }
    if (freeP < 0 && cAlive.every((a) => !a)) {
      freeP = p;
      events.push({ k: 'free', p: +p.toFixed(4), x: 0, y: +PACK_STACK.cy.toFixed(4), f: 1 });
    }
    if (debug && Math.abs(p - ENV('DUMPP', -1)) < 0.5 / nSteps) {
      // réglage : effort de chaque lien du contour (en seuils F_BRK), bord par bord, du coin vers le milieu
      const at = (x: number, y: number) => {
        let best = -1, bd = Infinity;
        for (let c = 0; c < CN; c++) {
          const dd = Math.hypot(cX[c] - x, cY[c] - y);
          if (dd < bd) (bd = dd), (best = c);
        }
        return (cFrame[best] / F_BRK).toFixed(0);
      };
      const tx = [0, 0.02, 0.05, 0.1, 0.2, 0.29].map((d) => at(WIN.x0 + d, WIN.y1));
      const ly = [0, 0.02, 0.05, 0.1, 0.2, 0.4].map((d) => at(WIN.x0, WIN.y1 - d));
      const bx = [0, 0.02, 0.05, 0.1, 0.2, 0.29].map((d) => at(WIN.x0 + d, WIN.y0));
      console.log(`   effort p=${p.toFixed(3)} haut ${tx.join(' ')} · gauche ${ly.join(' ')} · bas ${bx.join(' ')}`);
    }
    if (s % STEP_PER_IMG === 0) {
      frames.push(Float32Array.from(pos));
      const d = measure();
      diags.push(d);
      cutRec.push(+(d.cut / CN).toFixed(4));
      if (debug) console.log(`p=${p.toFixed(3)} poussée ${(zOff * 100).toFixed(2)} mm  étirement ${(d.st * 100).toFixed(2)} %${stWhere}  effort max ${d.fmax.toFixed(3)}  contour rompu ${d.cut}/${CN}  vmax ${d.vmax.toFixed(2)}${vWhere}  plafonnés ${d.caps}`);
    }
  }
  // ce qui tient encore à p = 1 cède (le doigt est au bout) : enregistré comme la libération
  if (freeP < 0 && PSTOP > 1) {
    for (let c = 0; c < CN; c++) if (cAlive[c]) (cAlive[c] = 0), (cBrkP[c] = 1);
    bAlive.fill(1);
    for (let c = 0; c < BN; c++) if (bCutLinks[c].length) bAlive[c] = 0;
    freeP = 1;
    events.push({ k: 'free', p: 1, x: 0, y: +PACK_STACK.cy.toFixed(4), f: 0.6 });
  }
  while (frames.length < N_DRIVE) frames.push(Float32Array.from(pos)), diags.push(measure()), cutRec.push(1);

  // ── SORTIE : la pile sort vers le joueur, le panneau plaqué dessus, puis il glisse et tombe
  if (PSTOP > 1) {
    const totalExit = Math.round(EXIT_DUR / FRAME_DT);
    let nextExit = 0;
    for (let fi = 0; fi <= totalExit; fi++) {
      const t = fi * FRAME_DT;
      zPrev = zOff;
      zOff = outZ(t);
      bow = BOW * (1 - Math.min(1, t / OUT_DUR));
      carried = t < DROP_AT;
      if (t >= DROP_AT && !panelFree) {
        panelFree = true;
        fric = 0.04;
        for (let k = 2 * NR * NC; k < n; k++) {
          grav[k] = 1;
          vel[k * 3] += V.slide * (0.8 + 0.4 * rnd());
        }
      }
      runFrame();
      while (nextExit < N_EXIT && t >= nextExit / EXIT_FPS - 1e-9) {
        frames.push(Float32Array.from(pos));
        const d = measure();
        diags.push(d);
        if (debug) console.log(`sortie t=${t.toFixed(3)}  étirement ${(d.st * 100).toFixed(2)} %  vmax ${d.vmax.toFixed(2)}`);
        nextExit++;
      }
    }
    while (frames.length < N_DRIVE + N_EXIT) frames.push(Float32Array.from(pos)), diags.push(measure());
  }
  events.sort((a, b) => (a.p ?? 2) - (b.p ?? 2));
  return { sheets, rest, frames, n, diags, events, cut: cutRec, cutP: Array.from(cBrkP), cutXY: cX.map((x, c) => [x, cY[c]]) };
}

// ───────────────────────────── encodage
const SMOOTH = ENV('SMOOTH', 2);
/** filtre temporel du CORPS (binomial 1-4-6-4-1, comme la déchirure), phases pilotée et sortie séparément ; panneau intact */
function smoothBody(r: ReturnType<typeof simulate>) {
  const bodyEnd = 2 * NR * NC * 3;
  for (const [a, b] of [[0, N_DRIVE - 1], [N_DRIVE, r.frames.length - 1]]) {
    for (let pass = 0; pass < SMOOTH; pass++) {
      const src = r.frames.slice(a, b + 1).map((f) => f.slice(0, bodyEnd));
      const L = src.length;
      for (let f = 1; f < L - 1; f++) {
        const g = (k: number) => src[Math.min(L - 1, Math.max(0, f + k))];
        const m2 = g(-2), m1 = g(-1), c = g(0), p1 = g(1), p2 = g(2);
        const dst = r.frames[a + f];
        for (let o = 0; o < bodyEnd; o++) dst[o] = (m2[o] + 4 * m1[o] + 6 * c[o] + 4 * p1[o] + p2[o]) / 16;
      }
    }
  }
}

function encode(V: FVariant, r: ReturnType<typeof simulate>, index: number) {
  if (SMOOTH > 0) smoothBody(r);
  const { sheets, rest, frames, n } = r;
  const header: TearBakeHeader = {
    format: TEAR_BAKE_FORMAT,
    seed: V.seed,
    index,
    q: Q,
    qStrip: Q_PANEL,
    nx: NC,
    sheets: sheets.map((s) => ({ ...s, ys: s.ys.map((y) => +y.toFixed(6)), xs: s.xs?.map((x) => +x.toFixed(6)) })),
    verts: n,
    nTear: N_DRIVE,
    nExit: frames.length - N_DRIVE,
    exitFps: EXIT_FPS,
    stripHide: PANEL_HIDE,
    tearV: TEAR_V,
    delta: 0,
    scenario: 'fenetre',
    events: r.events,
    cut: r.cut,
    window: { ...WIN, push: PUSH, out: Z_OUT, outDur: OUT_DUR, dropAt: DROP_AT },
  };
  const hj = Buffer.from(JSON.stringify(header));
  const restF = Float32Array.from(rest);
  const F = frames.length;
  const q = new Int16Array(F * n * 3);
  const last = new Int32Array(n * 3);
  const stripFrom = 2 * NR * NC * 3;
  let clamped = 0;
  for (let f = 0; f < F; f++)
    for (let o = 0; o < n * 3; o++) {
      let cur = Math.round((frames[f][o] - restF[o]) / (o < stripFrom ? Q : Q_PANEL));
      if (cur > 32767 || cur < -32767) (cur = Math.max(-32767, Math.min(32767, cur))), clamped++;
      q[f * n * 3 + (o % 3) * n + ((o / 3) | 0)] = cur - last[o];
      last[o] = cur;
    }
  const pad = (4 - ((8 + hj.length) % 4)) % 4;
  const raw = Buffer.concat([Buffer.from('TEAR'), Buffer.from(new Uint32Array([hj.length]).buffer), hj, Buffer.alloc(pad, 32), Buffer.from(restF.buffer), Buffer.from(q.buffer)]);
  return { gz: gzipSync(raw, { level: 9 }), raw: raw.length, clamped };
}

export interface FenetreOpts {
  out: string;
  preview: boolean;
  debug: boolean;
  only?: string;
  variants?: number;
}

export function runFenetre(o: FenetreOpts) {
  mkdirSync(o.out, { recursive: true });
  const SD = process.env.STATSDIR ?? '.cache/bake-fenetre';
  mkdirSync(SD, { recursive: true });
  const NV = o.variants ?? VARIANT_LIST.length;
  for (let v = 0; v < NV; v++) {
    if (o.only !== undefined && +o.only !== v) continue;
    const V = VARIANT_LIST[v % VARIANT_LIST.length];
    const t0 = performance.now();
    const r = simulate(V, o.debug);
    const t1 = performance.now();
    const e = encode(V, r, v);
    writeFileSync(`${o.out}/fenetre-${v}.tear`, e.gz);
    const corners = r.events.filter((x) => x.k === 'corner').map((x) => x.p);
    const free = r.events.find((x) => x.k === 'free')?.p;
    const stats = { variant: v, seed: V.seed, seconds: +((t1 - t0) / 1000).toFixed(1), bytes: e.gz.length, clamped: e.clamped, stretchMaxPct: +(Math.max(...r.diags.map((d) => d.st)) * 100).toFixed(3), corners, free, cut: r.cut, diags: r.diags, cutP: r.cutP, cutXY: r.cutXY };
    writeFileSync(`${SD}/stats-${v}.json`, JSON.stringify(stats));
    console.log(`fenêtre ${v} (graine ${V.seed}) : ${r.n} sommets × ${r.frames.length} images, simulée en ${stats.seconds} s — ${(e.raw / 1e6).toFixed(2)} Mo bruts → ${(e.gz.length / 1e6).toFixed(2)} Mo gzip, écrêtées ${e.clamped}`);
    console.log(`  étirement max ${stats.stretchMaxPct} %  coins à p = ${corners.join(' / ') || '—'}  libre à p = ${free ?? '—'}`);
    if (o.preview) {
      const pick = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, ...[0.1, 0.3, 0.45, 0.6, 0.8, 1].map((t) => N_DRIVE + Math.round(t * EXIT_FPS))].filter((f) => f < r.frames.length);
      writeFileSync(
        `${SD}/preview-${v}.json`,
        JSON.stringify({
          scenario: 'fenetre',
          nTear: N_DRIVE,
          exitFps: EXIT_FPS,
          window: WIN,
          push: PUSH,
          sheets: r.sheets.map((s) => ({ part: s.part, side: s.side, ny: s.ny, nx: s.nx, base: s.base, hole: s.hole })),
          frames: pick.map((f) => ({ f, z: f < N_DRIVE ? pushZ(f / (N_DRIVE - 1)) : outZ((f - N_DRIVE) / EXIT_FPS), p: Array.from(r.frames[f], (x) => +x.toFixed(5)) })),
        }),
      );
    }
  }
}
