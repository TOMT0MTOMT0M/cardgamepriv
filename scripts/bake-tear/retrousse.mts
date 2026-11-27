/**
 * SIMULATEUR HORS-LIGNE du « Retroussé » (27/11, V3) : le sachet se retourne vers le bas comme un revers de chaussette
 * et laisse les cartes debout. Même film (alu / PET, XPBD, flexion par angle dièdre, plasticité) que la déchirure
 * (bake.mts, dont rien n'est modifié : ce fichier a sa propre boucle de pas), mais à 4 800 Hz, avec 4 + 4 passes de
 * distances par sous-pas et un étirement 100 fois plus raide (le pli roulé comprimait le film de 3 à 5 %).
 *
 *   npm run bake:retrousse                                → public/bake/retrousse-0.tear, retrousse-1.tear
 *   npm run bake:retrousse -- --only=0 --preview          → aussi .cache/bake-retrousse/preview-0.json (preview.py)
 *   npm run bake:retrousse -- --trial --out=.cache/x      → cuisson d'essai : charnière seule (pas de soudures
 *                                                           latérales, pas de sortie)
 *   réglages (variables d'environnement) : R, YE, SIDEK, ABEND, AGRIP, AGRIPZ, TENS, DAMPL, DAMPB, ITER, POSTD,
 *     DRIVE, MIRROR, TMODE, GRIPREL, FRICX, YIELD, YIELDL, CREEPL, SET, SUB, ASTR, AWELD, LRA, GEXIT, SMOOTH, SMA, Q,
 *     SUPK, SUPA, SUPB, DRAMP, TSRC, EXITFPS ; PSTOP (arrêt anticipé), DUMPP et TRACEV / TRACEA / TRACEB (+ --debug),
 *     STATSDIR (dossier des mesures / aperçus)
 *   contrôle : scripts/bake-tear/check.mts
 *
 * Le scénario :
 *  - 2 nappes `body` (avant, dos), 65 × 81, aucune bande. Soudures avant ↔ dos (liens à l'écart de repos, ≈ 0,1 mm) : `top`
 *    (cran du haut, 6 rangées, coins compris), `side` (marges latérales, découpées en crans de 6 rangées), `bottom`
 *    (ne cède jamais) ;
 *  - la CHARNIÈRE y = yF(p) descend de y0 (le haut) à yE ; deux pinces (les 2 rangées du haut de chaque face)
 *    emmènent le bord de chaque lèvre sur le pli idéal : arc de rayon r tangent à la face, puis le repos de la colonne
 *    retourné en miroir, rabattu d'un angle φ ≤ π. Une cible PAR SOMMET, calculée avec la longueur d'arc de repos de sa
 *    propre colonne (le repos est bombé) ;
 *  - LE PLI QUI VOYAGE (driveFold) : le film qui passe dans l'arc prend l'angle de repos du pli idéal (l'alu marque le
 *    pli), celui du revers l'angle du repos retourné ; les positions restent libres (XPBD). Sans cela, le film élastique
 *    tenu par son seul bord faisait une boucle (le « cœur ») qui grossissait avec la longueur du revers ;
 *  - la soudure du haut cède du centre vers les bords (p 0,045 → 0,12, paquets de 2 colonnes ; le premier = le verrou),
 *    chaque cran latéral cède quand la charnière arrive à r/2 au-dessus de lui, un côté un peu avant l'autre ;
 *  - contacts : film ↔ cartes (champ de hauteur, comme la déchirure), avant ↔ dos (ordre en z), REVERS ↔ SA FACE
 *    (position courante de la face, même colonne) ;
 *  - la main tient le cran du bas (épinglé) ; ni pouce ni doigts (le revers passerait dessus) : à leur place, l'APPUI
 *    de la face (SUP_K), la face posée sur les cartes revient doucement à sa forme sous la charnière ;
 *  - sortie (0,9 s) : les pinces lâchent en GRIPREL s, le pli garde sa forme (angles du pli idéal figés), PAS de
 *    gravité (G_EXIT), les cartes se soulèvent de RETROUSSE.levee en RETROUSSE.leve (core/motion.ts) et glissent dans le
 *    revers. L'événement `land` marque la FIN DU LÂCHER (t = GRIPREL, durée fixe), pas une chute.
 * Enregistrement : 97 images pilotées (p = 0..1) + 23 images de sortie (24 i/s, comme décidé : avec le lâcher
 * progressif, l'étirement entre deux images de la sortie est le même qu'à 48 i/s, 1,12 %), un seul pas de quantification, filtre temporel seulement
 * sur la face sous la charnière (smoothFace : il écraserait le pli). L'en-tête porte les ruptures (`events`) et la
 * charnière (`fold`) : le jeu interpole dans le repère de la charnière (src/core/bakeInterp.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PACK, PACK_SIDE_SEAM, PACK_STACK, TEAR_V, lcg, packProfile, packRestZ } from '../../src/core/packCrease';
import { EASE } from '../../src/core/ease';
import { RETROUSSE } from '../../src/core/motion';
import { TEAR_BAKE_FORMAT, type TearBakeEvent, type TearBakeHeader, type TearBakeSheet } from '../../src/core/tearBakeFormat';

const ENV = (k: string, d: number) => (process.env[k] !== undefined ? +process.env[k]! : d);

// ───────────────────────────── dimensions (unités de la scène : 1 = 100 mm)
const { w: W, h: H, crimp: CRIMP } = PACK;
const NX = 64, NY = 80;
const NC = NX + 1, NR = NY + 1;
const DY = H / NY; // 1,70 mm
const Y0 = H / 2;
const SEAM_X = W / 2 - PACK_SIDE_SEAM, SEAM_Y = H / 2 - CRIMP;
const FILM_R = 0.0016;
const G = 98.1;
const CARDS = 5;
const CARD_T = 0.012 * PACK_STACK.s, CARD_E = CARD_T / 2, CARD_R = 0.031 * PACK_STACK.s;
const cardZ = (k: number) => (k - (CARDS - 1) / 2) * 0.0072;
/** y du centre des cartes pendant la sortie (toutes ensemble : elles se soulèvent dans le sachet retroussé) */
export const retrousseCardY = (t: number) => PACK_STACK.cy + RETROUSSE.levee * EASE.glide(Math.min(1, Math.max(0, t / RETROUSSE.leve)));

/** hauteur de la pile côté s en (x, y) quand toutes les cartes sont centrées en `cyc` (NaN hors de la pile) — check.mts */
export function stackHeight(cyc: number, x: number, y: number, s: number): number {
  let best = NaN;
  for (let k = 0; k < CARDS; k++) {
    const qx = Math.abs(x) - PACK_STACK.hw + CARD_R, qy = Math.abs(y - cyc) - PACK_STACK.hh + CARD_R;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CARD_R;
    if (d >= 0) continue;
    const top = d < -CARD_E ? CARD_E : Math.sqrt(Math.max(0, CARD_E * CARD_E - (d + CARD_E) * (d + CARD_E)));
    const z = cardZ(k) + s * top;
    if (Number.isNaN(best) || (s > 0 ? z > best : z < best)) best = z;
  }
  return best;
}
export const FILM_GAP = FILM_R;

// enregistrement
export const N_DRIVE = 97;
const STEP_PER_IMG = 3;
// 288 pas de 1/240 s au rythme nominal (1,2 s ; le doigt la pilote en jeu), plus le ralenti de la fin (EASE_END)
const FRAME_DT = 1 / 240;
const EXIT_DUR = 0.9;
export const EXIT_FPS = ENV('EXITFPS', 24);
export const N_EXIT = Math.round(EXIT_DUR * EXIT_FPS) + 1;
const Q = ENV('Q', 7e-5); // 7 µm, ±2,29 unités : le bord des lèvres descend de 0,68 à ≈ −1,5
const SUB = ENV('SUB', 20); // 4 800 Hz : à 2 400 Hz le pli comprime le film de 3 à 5 %
/**
 * gravité du revers pendant la sortie, en part de g : 0 par défaut. Mesuré le 27/11 : à g entier, un XPBD à une
 * itération n'a pas la raideur de flexion du film (bake.mts le note déjà pour le corps) — le pli s'effondre et le revers
 * tombe à plat en 80 ms. Avec 4 + 4 passes et le pli qui voyage : g entier → le revers tire la face à travers le pli,
 * qui se déroule jusqu'au bas du sachet (étirement 34 %, dièdre 3,1 rad) ; 0,3 g → 11 %, 3,1 rad.
 */
const G_EXIT = ENV('GEXIT', 0);
const VMAX = 40;

// matière (mêmes valeurs que la déchirure, sauf mention)
const A_BEND = ENV('ABEND', 3e-3);
const SIDEK = ENV('SIDEK', 6); // soudures et crans : double épaisseur, A_BEND / SIDEK
const A_STRETCH = ENV('ASTR', 1e-9); // 100 fois plus raide que la déchirure (tenable avec ITER / POSTD ci-dessous)
const A_WELD = ENV('AWELD', 1e-7); // soudures (lien à l'écart de repos des deux faces, ≈ 0,1 mm)
const A_GRIP = ENV('AGRIP', 1e-6);
const A_GRIP_Z = ENV('AGRIPZ', A_GRIP);
const YIELD = ENV('YIELD', 0.05), CREEP = 0.3;
/** arêtes au-dessus de yE (le revers) : élastiques au passage de la charnière, sinon le revers lâché s'enroule */
const YIELD_L = ENV('YIELDL', 0.6), CREEP_L = ENV('CREEPL', 0.3);
/** à la fin de la phase pilotée, part de la forme du revers qui devient permanente (le pli final reste marqué) */
const SET = ENV('SET', 0);
const DRAG_N = 9, DRAG_T = 0.6;
const CONTACT_V = ENV('CV', 1.2);
const DAMP = ENV('DAMPL', 0.9995); // charnière et revers
const DAMP_BODY = ENV('DAMPB', 0.99); // face sur les cartes (plus fort que la déchirure : ni pouce ni doigts ici)
const TENS = ENV('TENS', 0.002); // le revers idéal est 0,2 % plus long que le repos : les pinces le tendent sans à-coup
/**
 * passes de distances par sous-pas, avant et après la flexion. Mesuré le 27/11 (variante 0, régime p 0,5 … 1) : 1 + 0
 * → étirement 3,3 % ; 2 + 1 → 1,8 % ; 3 + 2 (et ASTR 1e-8) → 0,6 à 0,9 % ; 4 + 4 → 0,55 à 0,75 % (+20 % de temps)
 */
const ITER = ENV('ITER', 4), POSTD = ENV('POSTD', 4);
const GRIP_REL = ENV('GRIPREL', 0.15), FRICX = ENV('FRICX', 0.05);
/**
 * APPUI DE LA FACE (27/11, reprise) : sous la charnière, chaque sommet de la face revient vers sa forme posée d'une part
 * SUP_K de l'écart par sous-pas (pleine force sous yF − SUP_B·r, nulle au-dessus de yF − SUP_A·r). C'est la face posée
 * sur les cartes et tenue par la paume : sans pouce ni doigts, la membrane (elle flotte à 0,7 mm des cartes au repos)
 * vibrait à chaque cran qui cède (ondes de ±0,05 mm, frémissement brut p90 16 mrad, max 73).
 */
// Mesuré le 27/11 (variante 0, face visible y ∈ [−0,30 ; 0], p ≤ 0,5, pas p = 1/48 ; tear-0 : p99 6,15, max 8,4 mrad) :
// sans appui p99 9,8, max 23 ; SUP_K 0,01 → p99 3,2, max 16,9 (sous le revers ; hors du revers : max 14, tear-0 99) ;
// SUP_K 0,03 fige la face (p90 0,1) ; SUPA / SUPB 2 / 4 (appui plus loin de la charnière) : un peu plus de frémissement,
// rien de gagné en étirement.
const SUP_K = ENV('SUPK', 0.01), SUP_A = ENV('SUPA', 1), SUP_B = ENV('SUPB', 3);
const LRA = ENV('LRA', 1) > 0; // attaches longues vers la main (anti-étirement)

// horaires
const P_LOCK = 0.045, P_TOP = 0.12, Y_TOP = Y0 - 0.015;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface RVariant {
  seed: number;
  /** rayon du pli */
  r: number;
  /** bruit des ruptures (progression) */
  noise: number;
}
const VARIANT_LIST: RVariant[] = [
  { seed: 61, r: 0.08, noise: 0.004 },
  { seed: 83, r: 0.088, noise: 0.004 },
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
  /** étirement max (toutes les arêtes, hors soudures) */
  st: number;
  /** étirement max aux épaules (colonnes 2 à 8 et 56 à 62) */
  stSh: number;
  /** |dièdre| max (toutes les arêtes), aux épaules, et hors de la zone du pli final (sortie) */
  dh: number;
  dhSh: number;
  /** écart max des pinces (m × 100) */
  grip: number;
  /** sommets plafonnés à VMAX depuis l'image enregistrée précédente */
  caps: number;
  vmax: number;
  /** ruptures pendant cette image */
  brk: number;
}

function simulate(V: RVariant, trial: boolean, debug: boolean) {
  const rnd = lcg(V.seed);
  const R = ENV('R', V.r);
  const YE = ENV('YE', -0.4);
  const firstSide: -1 | 1 = rnd() < 0.5 ? -1 : 1;
  const lrLag = 0.015 + 0.015 * rnd();
  const yFold = (p: number) => (p < P_TOP ? Y0 - 0.015 * sstep(P_LOCK, P_TOP, p) : Y_TOP + ((YE - Y_TOP) * (p - P_TOP)) / (1 - P_TOP));
  /** p où la charnière atteint y (partie linéaire) */
  const pAtY = (y: number) => P_TOP + ((y - Y_TOP) / (YE - Y_TOP)) * (1 - P_TOP);
  const phiSched = (p: number) => Math.max(0.35 * sstep(0, P_LOCK, p), Math.PI * sstep(0.1, 0.3, p));

  const ys = Array.from({ length: NR }, (_, j) => -H / 2 + j * DY);
  const sheets: TearBakeSheet[] = [
    { part: 'body', side: 1, ny: NR, ys, base: 0 },
    { part: 'body', side: -1, ny: NR, ys, base: NR * NC },
  ];
  const n = 2 * NR * NC;
  const id = (s: number, i: number, j: number) => s * NR * NC + j * NC + i;
  const sideOf = (s: number) => (s === 0 ? 1 : -1) as 1 | -1;

  const pos = new Float64Array(n * 3), prev = new Float64Array(n * 3), vel = new Float64Array(n * 3), rest = new Float64Array(n * 3);
  const inv = new Float64Array(n).fill(1);
  const grav = new Uint8Array(n);
  const dampK = new Float64Array(n).fill(DAMP_BODY);
  /** appui de la face : poids par sommet (0 dans le pli et le revers) et forme posée (après les 0,2 s de repos) */
  const supW = new Float64Array(n), pos0 = new Float64Array(n * 3);
  for (let s = 0; s < 2; s++)
    for (let j = 0; j < NR; j++)
      for (let i = 0; i <= NX; i++) {
        const k = id(s, i, j), u = i / NX, y = ys[j], v = y / H + 0.5, side = sideOf(s);
        const x = (u - 0.5) * W;
        // imperceptible irrégularité du film (même formule que la déchirure)
        const hz = Math.sin(i * 12.9898 + Math.round(y * 1e5) * 0.0078233 + side * 3.7 + V.seed) * 43758.5453;
        const z = packRestZ(u, v, side, 0, true) + side * (hz - Math.floor(hz) - 0.5) * 0.0004 * (Math.abs(x) < SEAM_X ? 1 : 0);
        rest[k * 3] = x, rest[k * 3 + 1] = y, rest[k * 3 + 2] = z;
      }
  pos.set(rest);
  prev.set(rest);
  const fusedAt = (x: number, y: number) => Math.abs(x) >= SEAM_X - 1e-6 || Math.abs(y) >= SEAM_Y - 1e-6;
  const len = (a: number, b: number) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);

  // ── distances (arêtes des triangles) et flexion
  const dI: number[] = [], dJ: number[] = [], dL: number[] = [], dSh: number[] = [];
  const bW1: number[] = [], bW2: number[] = [], bE1: number[] = [], bE2: number[] = [], bA: number[] = [], bLip: number[] = [], bShd: number[] = [];
  const colOf = (k: number) => (k % (NR * NC)) % NC;
  const rowOf = (k: number) => Math.floor((k % (NR * NC)) / NC);
  const shoulder = (i: number) => (i >= 2 && i <= 8) || (i >= NX - 8 && i <= NX - 2);
  for (let s = 0; s < 2; s++) {
    const tris: Array<[number, number, number]> = [];
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const a = id(s, i, j), b = a + 1, c = a + NC, d = c + 1;
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
      dI.push(E[0]), dJ.push(E[1]), dL.push(len(E[0], E[1])), dSh.push(shoulder(colOf(E[0])) && shoulder(colOf(E[1])) ? 1 : 0);
      if (E.length < 4) continue;
      const seam = (k: number) => fusedAt(rest[k * 3], rest[k * 3 + 1]);
      bE1.push(E[0]), bE2.push(E[1]), bW1.push(E[2]), bW2.push(E[3]);
      bA.push(seam(E[0]) && seam(E[1]) ? A_BEND / SIDEK : A_BEND);
      bLip.push((rest[E[0] * 3 + 1] + rest[E[1] * 3 + 1]) / 2 > YE ? 1 : 0);
      bShd.push(shoulder(colOf(E[0])) && shoulder(colOf(E[1])) ? 1 : 0);
    }
  }
  const EN = dI.length; // arêtes du film (les soudures viennent après)
  const BN = bE1.length;
  const be1 = Int32Array.from(bE1), be2 = Int32Array.from(bE2), bw1 = Int32Array.from(bW1), bw2 = Int32Array.from(bW2), ba = Float64Array.from(bA);
  /** angle de repos de la flexion (bTh) ; bThF : sa part « libre » (plasticité), hors du pli idéal (voir driveFold) */
  const bTh = new Float64Array(BN), bThF = new Float64Array(BN);
  const restAngles = () => {
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      bTh[c] = Number.isNaN(th) ? 0 : th;
    }
    bThF.set(bTh);
  };
  restAngles();

  // ── soudures avant ↔ dos, avec leur horaire de rupture
  /** paquets de rupture : un événement chacun */
  interface Packet { k: TearBakeEvent['k']; p: number; x: -1 | 0 | 1; y: number; links: number[]; sep: number; done: boolean }
  const packets: Packet[] = [];
  const packetOf = new Map<string, Packet>();
  const pk = (key: string, mk: () => Omit<Packet, 'links' | 'sep' | 'done'>) => {
    let P = packetOf.get(key);
    if (!P) packets.push((P = { ...mk(), links: [], sep: 0, done: false })), packetOf.set(key, P);
    return P;
  };
  // soudure du haut : du centre vers les bords, paquets de 2 colonnes, le premier (centre) = le verrou
  const MID = NX / 2, M_MAX = Math.floor(MID / 2);
  const topP = new Map<string, number>();
  for (const sx of [-1, 1] as const) {
    let last = P_LOCK;
    for (let m = 1; m <= M_MAX; m++) {
      const p = Math.max(last + 0.0005, P_LOCK + (P_TOP - 0.006 - P_LOCK) * Math.pow(m / M_MAX, 0.8) + (rnd() - 0.5) * 2 * V.noise);
      topP.set(`${sx}:${m}`, Math.min(P_TOP - 0.002, p));
      last = p;
    }
  }
  const sI: number[] = [], sJ: number[] = [];
  // crans latéraux : 6 rangées, du haut (rangée 74) vers le bas
  const J_SIDE_TOP = Math.floor((SEAM_Y - 1e-6 + H / 2) / DY); // dernière rangée sous le cran du haut (74)
  const NOTCH = 6;
  for (let j = 0; j < NR; j++)
    for (let i = 0; i <= NX; i++) {
      const kf = id(0, i, j), kb = id(1, i, j);
      const x = rest[kf * 3], y = rest[kf * 3 + 1];
      if (!fusedAt(x, y)) continue;
      let P: Packet | null = null;
      if (y > 0 && Math.abs(y) >= SEAM_Y - 1e-6) {
        const d = Math.abs(i - MID), m = Math.floor(d / 2), sx = (m === 0 ? 0 : Math.sign(i - MID)) as -1 | 0 | 1;
        const p = m === 0 ? P_LOCK : topP.get(`${sx}:${m}`)!;
        P = pk(`top:${sx}:${m}`, () => ({ k: m === 0 ? 'lock' : 'top', p, x: sx, y: (SEAM_Y + Y0) / 2 }));
      } else if (y < 0 && Math.abs(y) >= SEAM_Y - 1e-6) P = null; // cran du bas : ne cède jamais
      else {
        if (trial) continue; // essai : pas de soudures latérales
        const sx = (x < 0 ? -1 : 1) as -1 | 1;
        const c = Math.floor((J_SIDE_TOP - j) / NOTCH);
        const yTop = ys[J_SIDE_TOP - c * NOTCH];
        if (yTop + R / 2 >= YE) {
          const key = `side:${sx}:${c}`;
          P = pk(key, () => {
            const p0 = pAtY(yTop + R / 2);
            const p = (sx === firstSide ? p0 - lrLag : p0) + (rnd() - 0.5) * 2 * V.noise;
            return { k: 'side', p: Math.max(P_TOP, Math.min(0.999, p)), x: sx, y: yTop };
          });
        }
      }
      sI.push(kf), sJ.push(kb);
      if (P) P.links.push(sI.length - 1);
    }
  // tout dans un seul tableau de distances : arêtes du film, puis soudures. (27/11) Une soudure garde l'ÉCART DE REPOS
  // des deux faces (≈ 0,1 mm, comme la Déchirure : bake.mts `dist(kf, kb, 0)`), pas une longueur nulle : plaquées l'une
  // sur l'autre, les deux faces se traversaient d'un sommet à l'autre et scintillaient au rendu (crans, soudures)
  const DN = EN + sI.length;
  const weldL = sI.map((kf, c) => {
    const a = kf * 3, b = sJ[c] * 3;
    return Math.hypot(rest[b] - rest[a], rest[b + 1] - rest[a + 1], rest[b + 2] - rest[a + 2]);
  });
  const di = Int32Array.from([...dI, ...sI]), dj = Int32Array.from([...dJ, ...sJ]), dl = Float64Array.from([...dL, ...weldL]);
  const dAlive = new Uint8Array(DN).fill(1);
  const dsh = Uint8Array.from(dSh);
  const gapMin = new Float64Array(NR * NC);
  for (let j = 0; j < NR; j++) for (let i = 0; i <= NX; i++) gapMin[j * NC + i] = Math.min(0.0009, 0.8 * (rest[id(0, i, j) * 3 + 2] - rest[id(1, i, j) * 3 + 2]));

  // ── la main : cran du bas, épinglé
  let J_PIN = 0;
  for (let s = 0; s < 2; s++) for (let j = 0; j < NR; j++) if (ys[j] <= -H / 2 + CRIMP * 0.85) for (let i = 0; i <= NX; i++) (inv[id(s, i, j)] = 0), (J_PIN = Math.max(J_PIN, j));

  // ── longueur d'arc de repos de chaque colonne (le repos est bombé : la cible de chaque sommet en tient compte)
  const S = new Float64Array(2 * NC * NR); // [s][i][j]
  for (let s = 0; s < 2; s++)
    for (let i = 0; i <= NX; i++) {
      let acc = 0;
      for (let j = 0; j < NR; j++) {
        if (j > 0) acc += len(id(s, i, j), id(s, i, j - 1));
        S[(s * NC + i) * NR + j] = acc;
      }
    }
  const arcAt = (s: number, i: number, y: number) => {
    const t = Math.min(NY - 1e-9, Math.max(0, (y - ys[0]) / DY));
    const j = Math.floor(t), f = t - j, o = (s * NC + i) * NR;
    return S[o + j] + (S[o + j + 1] - S[o + j]) * f;
  };

  // ── les pinces : les 2 rangées du haut de chaque face, une cible par sommet
  const grip: number[] = [];
  for (let s = 0; s < 2; s++) for (const j of [NY - 1, NY]) for (let i = 0; i <= NX; i++) grip.push(id(s, i, j));
  const gripT = new Float64Array(grip.length * 3);
  const colOpen = new Uint8Array(NC); // soudure du haut rompue dans cette colonne
  let gripOn = true;
  /** poids des pinces : 1 pendant la phase pilotée, il retombe à 0 en GRIPREL s au lâcher (un lâcher sec fait claquer le revers) */
  let gripW = 1;
  /** frottement film ↔ cartes : 0,3 (comme la déchirure) ; FRICX pendant la sortie (les cartes glissent hors du revers) */
  let fric = 0.3;
  /**
   * LE PLI IDÉAL de chaque sommet au-dessus de la charnière (colonne ouverte) : arc de rayon r tangent à la face, puis
   * film rabattu d'un angle φ. Il sert de cible aux pinces ET d'angle de repos au film dans le pli (voir driveFold).
   * Tangente de la face prise VERTICALE (TMODE = 0) : avec la pente propre de chaque colonne (TMODE = 1, ancien réglage),
   * les colonnes bombées des épaules et des coins visent des directions différentes et le revers s'ouvre en éventail
   * (étirement en x de plusieurs % au coin du haut).
   */
  const TMODE = ENV('TMODE', 0), TSRC = ENV('TSRC', 0);
  const MIRROR = ENV('MIRROR', 1) > 0;
  const idealP = new Float64Array(n * 3), idealA = new Float64Array(n), idealPhi = new Float64Array(2 * NC);
  const buildIdeal = (yF: number, phiS: number) => {
    idealP.set(rest);
    for (let s = 0; s < 2; s++) {
      const side = sideOf(s);
      for (let i = 0; i <= NX; i++) {
        const aEnd = S[(s * NC + i) * NR + NY] - arcAt(s, i, yF);
        // φ borné : l'arc ne dépasse jamais le film libéré (longueur libre ≥ 0)
        const phi = Math.min(phiS, Math.max(0, aEnd) / R);
        idealPhi[s * NC + i] = colOpen[i] ? phi : 0;
        const u = i / NX, v = yF / H + 0.5;
        const zf = packRestZ(u, v, side, 0, true);
        // pente de la face en y : TSRC 0 = repos de la colonne (marche du cran comprise), 1 = bombé seul de la colonne,
        // 2 = bombé seul de la colonne du milieu (la même pour toutes : pas d'éventail)
        const uS = TSRC === 2 ? 0.5 : u;
        const m = !TMODE ? 0 : TSRC === 0
          ? (TMODE * (packRestZ(u, v + DY / H, side, 0, true) - packRestZ(u, v - DY / H, side, 0, true))) / (2 * DY)
          : (TMODE * side * PACK.bulge * (packProfile(uS, v + DY / H) - packProfile(uS, v - DY / H))) / (2 * DY);
        const cl = 1 / Math.hypot(1, m);
        const ty = cl, tz = m * cl; // tangente de la face (vers le haut)
        const ny = -side * tz, nz = side * ty; // normale extérieure
        const c = Math.cos(phi), sn = Math.sin(phi);
        // le revers est le REPOS de la colonne, retourné en miroir (y inversé le long du revers, écart en z gardé) : un
        // miroir conserve toutes les longueurs, en x comme en y — une rotation doublerait le bombé des bords à plat
        // (crans, coins) et étirerait le revers en x
        const So = (s * NC + i) * NR, sM = arcAt(s, i, yF) + R * phi;
        let yM = rest[id(s, i, NY) * 3 + 1], zM = rest[id(s, i, NY) * 3 + 2];
        for (let j = 1; j < NR; j++)
          if (S[So + j] >= sM) {
            const f = (sM - S[So + j - 1]) / Math.max(1e-12, S[So + j] - S[So + j - 1]);
            const ka = id(s, i, j - 1) * 3, kb = id(s, i, j) * 3;
            yM = rest[ka + 1] + (rest[kb + 1] - rest[ka + 1]) * f, zM = rest[ka + 2] + (rest[kb + 2] - rest[ka + 2]) * f;
            break;
          }
        const dy = ty * c + ny * sn, dz = tz * c + nz * sn; // direction du revers
        for (let j = 0; j < NR; j++) {
          const k = id(s, i, j), o = k * 3;
          const a = S[(s * NC + i) * NR + j] - arcAt(s, i, yF);
          idealA[k] = a;
          if (a <= 0 || !colOpen[i]) continue;
          let py: number, pz: number;
          if (a <= R * phi) {
            const th = a / R;
            py = yF + R * (ny * (1 - Math.cos(th)) + ty * Math.sin(th));
            pz = zf + R * (nz * (1 - Math.cos(th)) + tz * Math.sin(th));
          } else if (MIRROR) {
            const wy = rest[o + 1] - yM, wz = rest[o + 2] - zM;
            const L2 = wy * (1 + TENS);
            py = yF + R * (ny * (1 - c) + ty * sn) + L2 * dy;
            pz = zf + R * (nz * (1 - c) + tz * sn) + L2 * dz + wz;
          } else {
            const L = a - R * phi;
            const L2 = L * (1 + TENS);
            py = yF + R * (ny * (1 - c) + ty * sn) + L2 * dy;
            pz = zf + R * (nz * (1 - c) + tz * sn) + L2 * dz;
          }
          idealP[o + 1] = py, idealP[o + 2] = pz;
        }
      }
    }
  };
  const setGripTargets = (yF: number, phiS: number) => {
    buildIdeal(yF, phiS);
    for (let g = 0; g < grip.length; g++) {
      const o = grip[g] * 3;
      gripT[g * 3] = idealP[o], gripT[g * 3 + 1] = idealP[o + 1], gripT[g * 3 + 2] = idealP[o + 2];
    }
  };

  // ── cartes
  const cy = new Float64Array(CARDS).fill(PACK_STACK.cy), cyPrev = new Float64Array(CARDS).fill(PACK_STACK.cy);
  const hx = PACK_STACK.hw, hy = PACK_STACK.hh;
  let stackVy = 0;
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

  // ── normales (traînée de l'air)
  const nrm = new Float64Array(n * 3);
  const normals = () => {
    for (let s = 0; s < 2; s++)
      for (let j = 0; j < NR; j++)
        for (let i = 0; i <= NX; i++) {
          const k = id(s, i, j);
          const a = id(s, Math.min(NX, i + 1), j), b = id(s, Math.max(0, i - 1), j), c = id(s, i, Math.min(NY, j + 1)), d = id(s, i, Math.max(0, j - 1));
          const ux = pos[a * 3] - pos[b * 3], uy = pos[a * 3 + 1] - pos[b * 3 + 1], uz = pos[a * 3 + 2] - pos[b * 3 + 2];
          const vx = pos[c * 3] - pos[d * 3], vy = pos[c * 3 + 1] - pos[d * 3 + 1], vz = pos[c * 3 + 2] - pos[d * 3 + 2];
          const nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny2, nz) || 1;
          nrm[k * 3] = nx / l, nrm[k * 3 + 1] = ny2 / l, nrm[k * 3 + 2] = nz / l;
        }
  };

  const g12 = new Float64Array(12);
  let yFcur = Y0;
  let caps = 0, contacts = 0;
  const distances = (h2: number) => {
    for (let c = 0; c < DN; c++) {
      if (!dAlive[c]) continue;
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
  const step = (h: number) => {
    const h2 = h * h;
    for (let k = 0; k < n; k++) {
      if (inv[k] === 0) continue;
      const o = k * 3;
      const vn = vel[o] * nrm[o] + vel[o + 1] * nrm[o + 1] + vel[o + 2] * nrm[o + 2];
      vel[o] -= (DRAG_N * vn * nrm[o] + DRAG_T * vel[o]) * h;
      vel[o + 1] -= (DRAG_N * vn * nrm[o + 1] + DRAG_T * vel[o + 1]) * h + (grav[k] ? G * G_EXIT * h : 0);
      vel[o + 2] -= (DRAG_N * vn * nrm[o + 2] + DRAG_T * vel[o + 2]) * h;
      const sp = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
      if (sp > VMAX) {
        caps++;
        for (let a = 0; a < 3; a++) vel[o + a] *= VMAX / sp;
      }
    }
    for (let o = 0; o < n * 3; o++) (prev[o] = pos[o]), (pos[o] += vel[o] * h);
    // l'APPUI de la face (voir SUP_K) : sous la charnière, la face revient doucement vers sa forme posée
    if (SUP_K > 0)
      for (let k = 0; k < n; k++) {
        const w = supW[k];
        if (w <= 0 || inv[k] === 0) continue;
        const o = k * 3, c = SUP_K * w;
        pos[o] += (pos0[o] - pos[o]) * c, pos[o + 1] += (pos0[o + 1] - pos[o + 1]) * c, pos[o + 2] += (pos0[o + 2] - pos[o + 2]) * c;
      }
    // les pinces (attache souple : elles ne peuvent pas étirer le film)
    if (gripOn) {
      // (z plus souple : la main tire le bord vers le bas, la profondeur du revers vient du pli lui-même)
      const kk = gripW / (1 + A_GRIP / h2), kz = gripW / (1 + A_GRIP_Z / h2);
      for (let g = 0; g < grip.length; g++) {
        const o = grip[g] * 3;
        pos[o] += (gripT[g * 3] - pos[o]) * kk, pos[o + 1] += (gripT[g * 3 + 1] - pos[o + 1]) * kk, pos[o + 2] += (gripT[g * 3 + 2] - pos[o + 2]) * kz;
      }
    }
    // distances (ITER passes ; POSTD passes de plus après la flexion)
    for (let it = 0; it < ITER; it++) distances(h2);
    // ATTACHES LONGUES (Kim 2012) : un sommet ne s'éloigne jamais de la main (rangée épinglée de sa colonne) de plus que la
    // longueur d'arc de repos qui les sépare — le film est inextensible, et un XPBD à une itération laisse une longue
    // chaîne tirée s'étirer (la face glissait vers la charnière et le pli gonflait)
    if (LRA)
      for (let s = 0; s < 2; s++)
        for (let i = 0; i <= NX; i++) {
          const an = id(s, i, J_PIN) * 3, So = (s * NC + i) * NR;
          for (let j = J_PIN + 1; j < NR; j++) {
            const k = id(s, i, j), o = k * 3;
            if (inv[k] === 0) continue;
            const ex = pos[o] - pos[an], ey = pos[o + 1] - pos[an + 1], ez = pos[o + 2] - pos[an + 2];
            const L = Math.sqrt(ex * ex + ey * ey + ez * ez), M = S[So + j] - S[So + J_PIN];
            if (L <= M) continue;
            const c = (L - M) / L;
            pos[o] -= ex * c, pos[o + 1] -= ey * c, pos[o + 2] -= ez * c;
          }
        }
    // flexion
    for (let c = 0; c < BN; c++) {
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
    for (let it = 0; it < POSTD; it++) distances(h2);
    // film ↔ cartes, avec frottement
    for (let s = 0; s < 2; s++) {
      const side = sideOf(s);
      for (let k = s * NR * NC, e = (s + 1) * NR * NC; k < e; k++) {
        if (inv[k] === 0) continue;
        const o = k * 3;
        const hz = stackH(pos[o], pos[o + 1], side);
        if (Number.isNaN(hz)) continue;
        const lim = hz + side * FILM_R;
        if (side > 0 ? pos[o + 2] < lim : pos[o + 2] > lim) {
          contacts++;
          pos[o + 2] = lim;
          const vz = (pos[o + 2] - prev[o + 2]) / h;
          if (Math.abs(vz) > CONTACT_V) prev[o + 2] = pos[o + 2] - Math.sign(vz) * CONTACT_V * h;
          const dy = pos[o + 1] - prev[o + 1];
          pos[o + 1] += (stackVy / SUB - dy) * fric;
          pos[o] -= (pos[o] - prev[o]) * fric;
        }
      }
    }
    // REVERS ↔ SA FACE : un sommet passé le haut du pli reste dehors de la face (position COURANTE de la face, même
    // colonne, rangée de repos voisine de son y), et jamais dans la pile
    const yFlap = yFcur + (R * Math.PI) / 2;
    for (let s = 0; s < 2; s++) {
      const side = sideOf(s);
      for (let j = NY; j >= 0 && ys[j] > yFlap; j--)
        for (let i = 0; i <= NX; i++) {
          const k = id(s, i, j);
          if (inv[k] === 0) continue;
          const o = k * 3;
          const yc = pos[o + 1];
          if (yc >= yFcur - DY) continue;
          const t = (yc - ys[0]) / DY;
          const jj = Math.floor(t);
          if (jj < 0 || jj + 1 > NY || ys[jj + 1] >= yFcur) continue;
          const f = t - jj;
          let zf = pos[id(s, i, jj) * 3 + 2] * (1 - f) + pos[id(s, i, jj + 1) * 3 + 2] * f;
          const hz = stackH(pos[o], yc, side);
          if (!Number.isNaN(hz)) zf = side > 0 ? Math.max(zf, hz + FILM_R) : Math.min(zf, hz - FILM_R);
          const lim = zf + side * 2 * FILM_R;
          if (side > 0 ? pos[o + 2] < lim : pos[o + 2] > lim) {
            pos[o + 2] = lim;
            const vz = (pos[o + 2] - prev[o + 2]) / h;
            if (Math.abs(vz) > CONTACT_V) prev[o + 2] = pos[o + 2] - Math.sign(vz) * CONTACT_V * h;
          }
        }
    }
    // avant ↔ dos : l'avant reste devant — soudures intactes comprises (27/11 : leur lien garde une distance, pas un
    // ordre ; sans cette borne les deux faces pouvaient s'inverser dans une soudure)
    for (let j = 0; j < NR; j++)
      for (let i = 0; i <= NX; i++) {
        const f = id(0, i, j), b = id(1, i, j);
        const gap = pos[f * 3 + 2] - pos[b * 3 + 2], MIN = gapMin[j * NC + i];
        if (gap >= MIN) continue;
        const wf = inv[f], wb = inv[b];
        if (wf + wb === 0) continue;
        const c = (MIN - gap) / (wf + wb);
        pos[f * 3 + 2] += wf * c, pos[b * 3 + 2] -= wb * c;
      }
    for (let k = 0; k < n; k++) {
      const o = k * 3, dk = dampK[k];
      vel[o] = ((pos[o] - prev[o]) / h) * dk, vel[o + 1] = ((pos[o + 1] - prev[o + 1]) / h) * dk, vel[o + 2] = ((pos[o + 2] - prev[o + 2]) / h) * dk;
    }
  };

  /** plasticité : au-delà du seuil, l'angle de repos suit (le revers a son propre seuil, élevé) */
  const plastic = () => {
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      if (Number.isNaN(th)) continue;
      if (driveW[c] >= 1) continue;
      let ex = th - bThF[c];
      if (ex > Math.PI) ex -= 2 * Math.PI;
      else if (ex < -Math.PI) ex += 2 * Math.PI;
      const Y = bLip[c] ? YIELD_L : YIELD, K = bLip[c] ? CREEP_L : CREEP;
      if (Math.abs(ex) > Y) bThF[c] += (ex - Math.sign(ex) * Y) * K;
      if (driveW[c] <= 0) bTh[c] = bThF[c];
    }
  };
  /**
   * LE PLI QUI VOYAGE (plasticité « aller-retour ») : l'alu marque le pli là où il passe et le rend en sortant. Les arêtes
   * dans l'arc (longueur d'arc 0 … φr au-delà de la charnière) prennent l'angle du pli idéal, celles du revers retrouvent
   * leur angle de repos posé (bTh0), la face n'est pas touchée. Sans cela, un film élastique tenu par son seul bord fait
   * une boucle d'élastique (le « cœur ») qui grossit avec la longueur du revers.
   */
  const DRIVE = ENV('DRIVE', 1) > 0;
  /**
   * part de l'angle du pli idéal dans l'angle de repos de chaque arête : 0 (face, plastique), 1 dès a > −DY/2 ; avec
   * DRAMP > 0, une rampe sur DRAMP rangées en dessous (sinon chaque rangée qui entre dans le pli bascule d'un coup :
   * un cran par rangée, « crantage » mesuré au pas de 1/240 s à l'épaule)
   */
  const driveW = new Float64Array(BN);
  // (mesuré : DRAMP 1 → étirement entre deux images à l'épaule 2,61 → 2,35 % ; 2 → 2,36 %)
  const DRAMP = ENV('DRAMP', 1);
  const driveFold = () => {
    if (!DRIVE) return;
    for (let c = 0; c < BN; c++) {
      const e1 = be1[c], e2 = be2[c];
      const i1 = colOf(e1), i2 = colOf(e2);
      if (!colOpen[i1] || !colOpen[i2]) continue;
      const a = (idealA[e1] + idealA[e2]) / 2;
      const w = DRAMP > 0 ? sstep(-(0.5 + DRAMP) * DY, -0.5 * DY, a) : a > -DY / 2 ? 1 : 0;
      if (w > driveW[c]) driveW[c] = w; // (jamais en arrière : la charnière ne remonte pas)
      if (driveW[c] <= 0) continue;
      const s = e1 < NR * NC ? 0 : 1;
      const phi = Math.min(idealPhi[s * NC + i1], idealPhi[s * NC + i2]);
      // (revers en miroir : ses angles changent de signe, on prend ceux du pli idéal partout)
      if (MIRROR || a < R * phi + DY) {
        const th = dihedral(idealP, bw1[c], bw2[c], e1, e2);
        if (Number.isNaN(th)) continue;
        let d = th - bThF[c];
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        bTh[c] = bThF[c] + d * driveW[c];
      } else bTh[c] = bTh0[c];
    }
  };
  const setDamp = (yF: number) => {
    for (let k = 0; k < n; k++) {
      const y = rest[k * 3 + 1];
      dampK[k] = y < yF - 2 * R ? DAMP_BODY : DAMP;
      supW[k] = sstep(yF - SUP_A * R, yF - SUP_B * R, y);
    }
  };

  let where = '';
  const tag = (k: number) => `${k < NR * NC ? 'av' : 'dos'}(${colOf(k)},${rowOf(k)})`;
  /** angles dièdres du repos posé (référence des mesures : le repos a déjà de petits plis aux crans) */
  const bTh0 = new Float64Array(BN);
  const measure = (inExit: boolean): FrameDiag => {
    let st = 0, stSh = 0, dh = 0, dhSh = 0, grip2 = 0, vmax = 0, stAt = 0, dhAt = 0;
    for (let c = 0; c < EN; c++) {
      const a = di[c] * 3, b = dj[c] * 3;
      const s2 = Math.abs(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / dl[c] - 1);
      if (s2 > st) (st = s2), (stAt = di[c]);
      if (dsh[c] && s2 > stSh) stSh = s2;
    }
    const bShdA = bShd;
    for (let c = 0; c < BN; c++) {
      const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
      if (Number.isNaN(th)) continue;
      const y = (rest[be1[c] * 3 + 1] + rest[be2[c] * 3 + 1]) / 2;
      // sortie : le pli final (yE … yE + πr, plus une marge) est exclu
      if (inExit && y > YE - R && y < YE + Math.PI * R + R) continue;
      const a = Math.abs(th); // |dièdre|, comme check.mts
      if (a > dh) (dh = a), (dhAt = be1[c]);
      if (bShdA[c] && a > dhSh) dhSh = a;
    }
    if (gripOn)
      for (let g = 0; g < grip.length; g++) {
        if (!colOpen[colOf(grip[g])]) continue;
        const o = grip[g] * 3;
        grip2 = Math.max(grip2, Math.hypot(pos[o] - gripT[g * 3], pos[o + 1] - gripT[g * 3 + 1], pos[o + 2] - gripT[g * 3 + 2]));
      }
    for (let k = 0; k < n; k++) vmax = Math.max(vmax, Math.hypot(vel[k * 3], vel[k * 3 + 1], vel[k * 3 + 2]));
    const d = { st, stSh, dh, dhSh, grip: grip2, caps, vmax, brk: 0 };
    caps = 0;
    if (debug) where = ` [étirement@${tag(stAt)} dièdre@${tag(dhAt)}]`;
    return d;
  };

  const frames: Float32Array[] = [];
  const diags: FrameDiag[] = [];
  const yFrec: number[] = [];
  const runFrame = () => {
    normals();
    const h = FRAME_DT / SUB;
    for (let s = 0; s < SUB; s++) step(h);
    plastic();
  };

  // repos : le film se pose (0,2 s), puis ce repos devient la référence de flexion
  setGripTargets(Y0, 0);
  for (let t = 0; t < 0.2; t += FRAME_DT) runFrame();
  restAngles();
  bTh0.set(bTh);
  vel.fill(0);
  pos0.set(pos);

  // ── PHASE PILOTÉE
  const events: TearBakeEvent[] = [];
  let brkCount = 0;
  const PSTOP = ENV('PSTOP', 2); // réglage : arrêter la phase pilotée à p (et sauter la sortie)
  // horaire : STEP_PER_IMG pas de 1/240 s par image, et la main RALENTIT sur la fin (vitesse ∝ (1 − p) / EASE_END,
  // plancher 0,15) : un arrêt sec à p = 1 lançait le revers (≈ 1,8 u/s) qui rebondissait au lâcher (étirement 5 % entre
  // deux images de la sortie)
  const EASE_END = ENV('EASEEND', 0.12);
  const sched: Array<[number, boolean]> = [[0, true]];
  for (let img = 1; img < N_DRIVE; img++) {
    const pm = (img - 0.5) / (N_DRIVE - 1);
    const nS = Math.max(STEP_PER_IMG, Math.round(STEP_PER_IMG / Math.max(0.15, Math.min(1, (1 - pm) / EASE_END))));
    for (let s = 1; s <= nS; s++) sched.push([(img - 1 + s / nS) / (N_DRIVE - 1), s === nS]);
  }
  for (const [p, rec] of sched) {
    if (p > PSTOP) break;
    const yF = yFold(p);
    yFcur = yF;
    setDamp(yF);
    for (const P of packets) {
      if (P.done || p < P.p) continue;
      P.done = true;
      let sep = 0;
      for (const l of P.links) {
        const a = sI[l] * 3, b = sJ[l] * 3;
        sep += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
        dAlive[EN + l] = 0;
        brkCount++;
        if (P.k === 'lock' || P.k === 'top') colOpen[colOf(sI[l])] = 1;
      }
      P.sep = sep / Math.max(1, P.links.length);
    }
    setGripTargets(yF, phiSched(p));
    driveFold();
    runFrame();
    if (debug && process.env.TRACEV && p >= ENV('TRACEA', 0) && p <= ENV('TRACEB', 1)) {
      // réglage : trajectoire (z, mm) de sommets donnés à chaque pas de 1/240 s — TRACEV="s,i,j;s,i,j"
      const zs = process.env.TRACEV.split(';').map((t) => { const [s2, i2, j2] = t.split(',').map(Number); const k = id(s2, i2, j2); return ((pos[k * 3 + 2] - rest[k * 3 + 2]) * 100).toFixed(3); });
      console.log(`trace p=${p.toFixed(4)} yF=${yF.toFixed(4)}${rec ? '*' : ' '} ${zs.join(' ')}`);
    }
    if (debug && rec && Math.abs(p - ENV('DUMPP', -1)) < 0.5 / (N_DRIVE - 1)) {
      // réglage : les 12 arêtes les plus étirées, et les pinces de la colonne du milieu
      const L: Array<[number, string]> = [];
      for (let c = 0; c < EN; c++) {
        const a = di[c] * 3, b = dj[c] * 3;
        const s2 = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / dl[c] - 1;
        L.push([s2, `${tag(di[c])}-${tag(dj[c])} y=${pos[a + 1].toFixed(3)} z=${pos[a + 2].toFixed(4)}`]);
      }
      L.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
      for (const [s2, w] of L.slice(0, 12)) console.log(`   ${(s2 * 100).toFixed(2)} %  ${w}`);
      // le pli idéal lui-même : est-il isométrique ?
      const LI: Array<[number, string]> = [];
      for (let c = 0; c < EN; c++) {
        const a = di[c] * 3, b = dj[c] * 3;
        LI.push([Math.hypot(idealP[a] - idealP[b], idealP[a + 1] - idealP[b + 1], idealP[a + 2] - idealP[b + 2]) / dl[c] - 1, `${tag(di[c])}-${tag(dj[c])}`]);
      }
      LI.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
      console.log('   idéal : ' + LI.slice(0, 6).map(([s2, w]) => `${(s2 * 100).toFixed(2)} % ${w}`).join(' · '));
      for (const ic of [4, MID]) {
        const cs: string[] = [];
        for (let j = 1; j < NR; j++) {
          const a = id(0, ic, j - 1) * 3, b = id(0, ic, j) * 3, L0 = len(id(0, ic, j - 1), id(0, ic, j));
          const sa = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / L0 - 1;
          const si = Math.hypot(idealP[a] - idealP[b], idealP[a + 1] - idealP[b + 1], idealP[a + 2] - idealP[b + 2]) / L0 - 1;
          if (Math.abs(sa) > 0.008 || Math.abs(si) > 0.008) cs.push(`${j}:${(sa * 100).toFixed(1)}/${(si * 100).toFixed(1)}(a${idealA[id(0, ic, j)].toFixed(3)})`);
        }
        console.log(`   col ${ic} réel/idéal : ${cs.join(' ')}`);
      }
      // par colonne (face avant) : compression verticale min, z max (largeur du pli), y du haut du pli, y du bord
      const row: string[] = [];
      for (let i = 0; i <= NX; i += 2) {
        let cmin = 0, zmax = -1, ytop = -9;
        for (let j = 1; j < NR; j++) {
          const a = id(0, i, j - 1) * 3, b = id(0, i, j) * 3;
          const s2 = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / len(id(0, i, j - 1), id(0, i, j)) - 1;
          cmin = Math.min(cmin, s2), zmax = Math.max(zmax, pos[b + 2]), ytop = Math.max(ytop, pos[b + 1]);
        }
        row.push(`${i}:${(cmin * 100).toFixed(1)}%/z${(zmax * 100).toFixed(1)}/y${ytop.toFixed(3)}/b${pos[id(0, i, NY) * 3 + 1].toFixed(3)}`);
      }
      console.log('   ' + row.join(' '));
      for (let g = 0; g < grip.length; g++)
        if (colOf(grip[g]) === MID || colOf(grip[g]) === 1) console.log(`   pince ${tag(grip[g])} cible ${[...gripT.slice(g * 3, g * 3 + 3)].map((x) => x.toFixed(4))} pos ${[...pos.slice(grip[g] * 3, grip[g] * 3 + 3)].map((x) => x.toFixed(4))}`);
    }
    if (rec) {
      frames.push(Float32Array.from(pos));
      yFrec.push(+yF.toFixed(6));
      const d = measure(false);
      d.brk = brkCount;
      brkCount = 0;
      diags.push(d);
      if (debug) console.log(`p=${p.toFixed(3)} yF=${yF.toFixed(3)}  étirement ${(d.st * 100).toFixed(2)} % (épaules ${(d.stSh * 100).toFixed(2)} %)  dièdre ${d.dh.toFixed(3)} (épaules ${d.dhSh.toFixed(3)})  pinces ${(d.grip * 100).toFixed(2)} mm  vmax ${d.vmax.toFixed(2)}  plafonnés ${d.caps}  contacts ${contacts}${where}`);
      contacts = 0;
    }
  }
  const sepMax = { lock: 0, top: 0, side: 0, land: 0 };
  for (const P of packets) if (P.done) sepMax[P.k] = Math.max(sepMax[P.k], P.sep);
  for (const P of packets)
    if (P.done) events.push({ k: P.k, p: +P.p.toFixed(4), x: P.x, y: +P.y.toFixed(4), f: +(0.4 + (0.6 * P.sep) / Math.max(1e-9, P.k === 'lock' ? sepMax.top || P.sep : sepMax[P.k])).toFixed(3) });
  events.sort((a, b) => a.p! - b.p! || a.x - b.x);
  // le revers à p = 1 (il pend sous le sachet)
  let flapMinY = Infinity, flapMaxY = -Infinity;
  for (let k = 0; k < n; k++)
    if (rest[k * 3 + 1] > YE + R) (flapMinY = Math.min(flapMinY, pos[k * 3 + 1])), (flapMaxY = Math.max(flapMaxY, pos[k * 3 + 1]));

  // ── SORTIE : les pinces lâchent (en GRIPREL s), le pli garde sa forme (angles de repos du pli idéal, figés), les
  // cartes se soulèvent et glissent dans le revers
  let landT = -1, landF = 0;
  while (frames.length < N_DRIVE) frames.push(Float32Array.from(pos)), yFrec.push(yFrec[yFrec.length - 1]), diags.push(measure(false));
  if (!trial && PSTOP > 1) {
    fric = FRICX;
    for (let c = 0; c < BN; c++)
      if (bLip[c]) {
        const th = dihedral(pos, bw1[c], bw2[c], be1[c], be2[c]);
        if (!Number.isNaN(th)) bTh[c] += (th - bTh[c]) * SET;
      }
    for (let k = 0; k < n; k++) if (rest[k * 3 + 1] > YE) grav[k] = 1;
    yFcur = YE;
    setDamp(YE);
    const totalExit = Math.round(EXIT_DUR / FRAME_DT);
    let nextExit = 0, peak = 0;
    for (let fi = 0; fi <= totalExit; fi++) {
      const t = fi * FRAME_DT;
      for (let k = 0; k < CARDS; k++) (cyPrev[k] = cy[k]), (cy[k] = retrousseCardY(t));
      gripW = 1 - sstep(0, GRIP_REL, t);
      gripOn = gripW > 0;
      runFrame();
      // FIN DU LÂCHER (événement `land`) : à t = GRIP_REL exactement (durée fixe), les pinces ont fini de lâcher ; son
      // intensité f vient du pic de vitesse moyenne du revers pendant le lâcher. Ce n'est PAS une chute (aucune gravité,
      // voir G_EXIT). (Comme la déchirure, l'image de sortie k est prise après le pas qui part de t = k / EXIT_FPS :
      // elle a 1/240 s d'avance sur son étiquette.)
      let vs = 0, nv = 0;
      for (let k = 0; k < n; k++) if (rest[k * 3 + 1] > YE + Math.PI * R) (vs += Math.hypot(vel[k * 3], vel[k * 3 + 1], vel[k * 3 + 2])), nv++;
      vs /= Math.max(1, nv);
      if (t <= GRIP_REL && vs > peak) peak = vs;
      if (landT < 0 && t >= GRIP_REL - 1e-9) (landT = GRIP_REL), (landF = peak);
      while (nextExit < N_EXIT && t >= nextExit / EXIT_FPS - 1e-9) {
        frames.push(Float32Array.from(pos));
        const d = measure(true);
        diags.push(d);
        if (debug) console.log(`sortie t=${t.toFixed(3)}  étirement ${(d.st * 100).toFixed(2)} %  dièdre hors pli ${d.dh.toFixed(3)}  vmax ${d.vmax.toFixed(2)}  revers ${vs.toFixed(3)} u/s`);
        nextExit++;
      }
    }
    while (frames.length < N_DRIVE + N_EXIT) frames.push(Float32Array.from(pos)), diags.push(measure(true));
    if (landT < 0) landT = EXIT_DUR / 2;
    events.push({ k: 'land', t: +landT.toFixed(3), x: 0, y: +YE.toFixed(4), f: +Math.min(1, landF / 0.5).toFixed(3) });
  }

  // courbure résiduelle du revers en fin d'enregistrement : angle cumulé (plan y, z) le long de la colonne 32, sur la
  // partie droite du revers (de yE + πr + r jusqu'à 2 rangées du bord)
  const curl = [0, 1].map((s) => {
    let tot = 0, prevA = NaN;
    for (let j = 0; j < NY - 2; j++) {
      if (ys[j] < YE + Math.PI * R + R) continue;
      const a = id(s, MID, j), b = id(s, MID, j + 1);
      const ang = Math.atan2(pos[b * 3 + 2] - pos[a * 3 + 2], pos[b * 3 + 1] - pos[a * 3 + 1]);
      if (!Number.isNaN(prevA)) {
        let d = ang - prevA;
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        tot += d;
      }
      prevA = ang;
    }
    return +tot.toFixed(4);
  });
  return { sheets, rest, frames, n, diags, events, yFrec, R, YE, firstSide, lrLag, flapMinY, flapMaxY, curl, pTop: Math.max(...packets.filter((P) => P.k === 'top').map((P) => P.p)) };
}

// ───────────────────────────── encodage (un seul pas pour le corps)
/**
 * Filtre temporel de la FACE (comme smoothBody de la déchirure : binomial 1-4-6-4-1, `SMOOTH` passes) mais seulement
 * sous la charnière (y de repos < yF − SMA·r sur ±2 images, fondu sur r de plus) et hors des marges soudées (fondu sur
 * SMMARGIN colonnes : les crans qui cèdent restent nets) : la face y est posée sur les cartes, le repère de la
 * charnière et le repère fixe se confondent, le pli (qui commence à yF) n'est pas touché. Phase pilotée seulement.
 * Mesuré le 27/11 (variante 0, face visible, p99 du frémissement au pas p = 1/48 ; tear-0 : 6,15 mrad) : 2 passes →
 * 16,7 ; 5 → 8,6 ; 8 → 6,5, mais sans retrait des marges le filtre étire la marge de 2,6 à 3,3 % aux crans, et un retrait
 * sur 5 colonnes étire de 4 % le bord du retrait. Retenu : 5 passes, retrait sur 12 colonnes → 9,8 mrad, aucun étirement
 * ajouté.
 */
const SMOOTH = ENV('SMOOTH', 5), SMA = ENV('SMA', 1);
function smoothFace(r: ReturnType<typeof simulate>) {
  const N = N_DRIVE, n = r.n;
  const DX = W / NX, reach = ENV('SMREACH', 2);
  const wx = new Float64Array(n);
  const MW = ENV('SMMARGIN', 12);
  for (let v = 0; v < n; v++) wx[v] = MW > 0 ? sstep(SEAM_X - DX, SEAM_X - (1 + MW) * DX, Math.abs(r.rest[v * 3])) : 1;
  for (let pass = 0; pass < SMOOTH; pass++) {
    const src = r.frames.slice(0, N).map((f) => f.slice());
    for (let f = 1; f < N - 1; f++) {
      const g = (k: number) => src[Math.min(N - 1, Math.max(0, f + k))];
      let yMin = Infinity;
      for (let k = -reach; k <= reach; k++) yMin = Math.min(yMin, r.yFrec[Math.min(N - 1, Math.max(0, f + k))]);
      const m2 = g(-2), m1 = g(-1), c = g(0), p1 = g(1), p2 = g(2), dst = r.frames[f];
      for (let v = 0; v < n; v++) {
        const w = wx[v] * Math.min(1, Math.max(0, (yMin - SMA * r.R - r.rest[v * 3 + 1]) / r.R));
        if (w <= 0) continue;
        for (let a = 0; a < 3; a++) {
          const o = v * 3 + a;
          dst[o] = c[o] + ((m2[o] + 4 * m1[o] + 6 * c[o] + 4 * p1[o] + p2[o]) / 16 - c[o]) * w;
        }
      }
    }
  }
}

function encode(V: RVariant, r: ReturnType<typeof simulate>, index: number, nExit: number) {
  if (SMOOTH > 0) smoothFace(r);
  const { sheets, rest, frames, n } = r;
  const header: TearBakeHeader = {
    format: TEAR_BAKE_FORMAT,
    seed: V.seed,
    index,
    q: Q,
    qStrip: Q,
    nx: NC,
    sheets: sheets.map((s) => ({ part: s.part, side: s.side, ny: s.ny, ys: s.ys.map((y) => +y.toFixed(6)), base: s.base })),
    verts: n,
    nTear: N_DRIVE,
    nExit,
    exitFps: EXIT_FPS,
    stripHide: 0,
    tearV: TEAR_V,
    delta: 0,
    scenario: 'retrousse',
    events: r.events,
    fold: { y0: Y0, yE: r.YE, pTop: +r.pTop.toFixed(4), r: r.R, yF: r.yFrec },
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
      q[f * n * 3 + (o % 3) * n + ((o / 3) | 0)] = cur - last[o];
      last[o] = cur;
    }
  const pad = (4 - ((8 + hj.length) % 4)) % 4;
  const raw = Buffer.concat([Buffer.from('TEAR'), Buffer.from(new Uint32Array([hj.length]).buffer), hj, Buffer.alloc(pad, 32), Buffer.from(restF.buffer), Buffer.from(q.buffer)]);
  return { gz: gzipSync(raw, { level: 9 }), raw: raw.length, clamped };
}

export interface RetrousseOpts {
  out: string;
  preview: boolean;
  debug: boolean;
  only?: string;
  variants?: number;
  /** cuisson d'essai : charnière seule (pas de soudures latérales, pas de sortie) */
  trial: boolean;
}

export function runRetrousse(o: RetrousseOpts) {
  mkdirSync(o.out, { recursive: true });
  // mesures et aperçus : .cache/bake-retrousse (ou $STATSDIR, pour lancer plusieurs réglages en parallèle)
  const SD = process.env.STATSDIR ?? '.cache/bake-retrousse';
  mkdirSync(SD, { recursive: true });
  const NV = o.variants ?? VARIANT_LIST.length;
  for (let v = 0; v < NV; v++) {
    if (o.only !== undefined && +o.only !== v) continue;
    const V = VARIANT_LIST[v % VARIANT_LIST.length];
    const t0 = performance.now();
    const r = simulate(V, o.trial, o.debug);
    const t1 = performance.now();
    const nExit = r.frames.length - N_DRIVE;
    const e = encode(V, r, v, nExit);
    const name = `retrousse-${v}`;
    writeFileSync(`${o.out}/${name}.tear`, e.gz);
    const worst = (k: keyof FrameDiag, a = 0, b = r.diags.length) => Math.max(...r.diags.slice(a, b).map((d) => d[k]));
    const stats = {
      variant: v,
      seed: V.seed,
      trial: o.trial,
      r: r.R,
      yE: r.YE,
      firstSide: r.firstSide,
      lrLag: r.lrLag,
      seconds: +((t1 - t0) / 1000).toFixed(1),
      bytes: e.gz.length,
      clamped: e.clamped,
      caps: r.diags.reduce((a, d) => a + d.caps, 0),
      gripMaxMm: +(worst('grip', 0, N_DRIVE) * 100).toFixed(3),
      stretchMaxPct: +(worst('st') * 100).toFixed(3),
      dihedralMax: +worst('dh').toFixed(4),
      flapY: [+r.flapMinY.toFixed(4), +r.flapMaxY.toFixed(4)],
      curl: r.curl,
      diags: r.diags,
    };
    writeFileSync(`${SD}/stats-${v}.json`, JSON.stringify(stats));
    console.log(`retroussé ${v} (graine ${V.seed}, r ${r.R}) : ${r.n} sommets × ${r.frames.length} images, simulée en ${stats.seconds} s — ${(e.raw / 1e6).toFixed(2)} Mo bruts → ${(e.gz.length / 1e6).toFixed(2)} Mo gzip, écrêtées ${e.clamped}, plafonnés ${stats.caps}`);
    console.log(`  étirement max ${stats.stretchMaxPct} %  dièdre max ${stats.dihedralMax} rad  pinces ${stats.gripMaxMm} mm  revers y ${stats.flapY.join(' … ')}  courbure résiduelle ${r.curl.join(' / ')} rad  ${r.events.length} événements`);
    if (o.preview) {
      const nT = N_DRIVE;
      const pick = [0, 6, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, ...[0.08, 0.25, 0.5, 0.9].map((t) => nT + Math.round(t * EXIT_FPS))].filter((f) => f < r.frames.length);
      const cardsAt = (f: number) => (f < nT ? PACK_STACK.cy : retrousseCardY((f - nT) / EXIT_FPS));
      writeFileSync(
        `${SD}/preview-${v}.json`,
        JSON.stringify({
          scenario: 'retrousse',
          nx: NC,
          nTear: nT,
          exitFps: EXIT_FPS,
          r: r.R,
          yE: r.YE,
          yF: r.yFrec,
          events: r.events,
          diags: r.diags,
          sheets: r.sheets.map((s) => ({ part: s.part, side: s.side, ny: s.ny, base: s.base })),
          frames: pick.map((f) => ({ f, cy: cardsAt(f), p: Array.from(r.frames[f], (x) => +x.toFixed(5)) })),
        }),
      );
    }
  }
}
