import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';
import type { TearBakeHeader } from './tearBakeFormat';
import { PACK } from './packCrease';
import { siteUrl } from './siteRoot';
import { decodeTearBake, fetchAndDecode } from './tearBakeDecode';

/**
 * REJEU de la déchirure simulée hors-ligne (10/11, scripts/bake-tear/bake.mts) : le sachet est un film alu / PET
 * simulé (plis plastiques, ligne de déchirure qui cède, cartes rigides qui écartent les lèvres) ; on rejoue ici ses
 * déformations enregistrées.
 *
 *  - `loadTearBakes()` : télécharge les variantes (une seule d'abord, les autres derrière), décompresse (gzip, natif) ;
 *  - `TearBakePlayer` : deux géométries (corps, bande arrachée) dont les positions et normales sont réécrites à chaque
 *    changement d'image — interpolation linéaire entre deux images enregistrées, normales par différences centrées sur
 *    la grille (pas de computeVertexNormals : ~0,3 ms pour 11 000 sommets).
 *  - phase DÉCHIRURE : `setTear(p)` (p = progression du doigt, 0..1) ; phase SORTIE : `setExit(t)` (secondes, même horloge
 *    que la sortie des cartes).
 *
 * Mémoire : positions gardées en int16 (écart au repos × q : 5 µm pour le corps, 20 µm pour la bande), ~6 Mo par variante.
 */
export interface TearBake {
  header: TearBakeHeader;
  rest: Float32Array;
  /** images : (position − repos) / q, absolues, [image][sommet × 3] */
  frames: Int16Array;
}

const N_VARIANTS = 3;
/** à monter à chaque nouvelle cuisson (npm run bake:tear) : le service worker garde les fichiers par version */
export const BAKE_REV = 2;
let loading: Promise<TearBake | null>[] | null = null;

/**
 * (audit 12/11, S06 / A1-02) TÉLÉCHARGEMENT ET DÉCODAGE DANS UN WORKER. Le décodage (≈ 3 millions d'additions par
 * variante) tournait sur le fil principal pendant le chargement : c'était la tâche la plus longue du démarrage sur
 * téléphone (579 et 725 ms relevés par le rapport « Chargement », Android, 11 et 12/11). Les tableaux reviennent
 * transférés, sans copie. Pas de worker, ou worker en échec : même travail sur le fil principal, comme avant.
 */
let worker: Worker | null = null;
let workerDead = false;
const waiting = new Map<number, (b: TearBake | null) => void>();
function viaWorker(i: number, url: string): Promise<TearBake | null> | null {
  if (workerDead || typeof Worker === 'undefined') return null;
  try {
    if (!worker) {
      worker = new Worker(new URL('./tearBake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ i: number; bake: TearBake | null }>) => {
        waiting.get(e.data.i)?.(e.data.bake);
        waiting.delete(e.data.i);
      };
      worker.onerror = () => {
        workerDead = true;
        worker?.terminate();
        worker = null;
        // les demandes en cours repartent sur le fil principal
        for (const [k, done] of [...waiting]) (waiting.delete(k), void fetchBakeMain(k).then(done));
      };
      worker.onmessageerror = worker.onerror as () => void; // (réponse illisible : même repli)
    }
    const p = new Promise<TearBake | null>((r) => waiting.set(i, r));
    worker.postMessage({ i, url });
    return p;
  } catch {
    workerDead = true;
    return null;
  }
}
const bakeUrl = (i: number) => new URL(siteUrl(`bake/tear-${i}.tear?v=${BAKE_REV}`), location.href).href;
const fetchBakeMain = (i: number) => fetchAndDecode(bakeUrl(i));
async function fetchBake(i: number): Promise<TearBake | null> {
  const b = await (viaWorker(i, bakeUrl(i)) ?? fetchBakeMain(i));
  // dernière variante arrivée : le worker ne sert plus
  if (i === N_VARIANTS - 1 && !waiting.size) (worker?.terminate(), (worker = null));
  return b;
}

export const decode = decodeTearBake;

/** variantes arrivées (dans l'ordre d'arrivée) */
const loaded: TearBake[] = [];

/** Lance (une fois) le chargement des variantes : la première tout de suite, les suivantes l'une après l'autre. */
export function loadTearBakes(): Promise<TearBake | null> {
  if (loading) return loading[0];
  const keep = (b: TearBake | null) => (b && loaded.push(b), b);
  const first = fetchBake(0).then(keep);
  loading = [first];
  let chain: Promise<unknown> = first;
  // (A1-02) les variantes suivantes ne servent qu'à varier les ouvertures d'après : elles attendent que le navigateur
  // soit inoccupé (au plus 8 s) au lieu de s'enchaîner pendant le chargement
  const calm = () => new Promise<void>((r) => ('requestIdleCallback' in globalThis ? requestIdleCallback(() => r(), { timeout: 8000 }) : setTimeout(r, 2500)));
  for (let i = 1; i < N_VARIANTS; i++) {
    const p = chain.then(calm).then(() => fetchBake(i)).then(keep);
    loading.push(p);
    chain = p;
  }
  return first;
}

/** Variantes déjà chargées (vide tant que la première n'est pas arrivée). */
export function loadedBakes(): readonly TearBake[] {
  return loaded;
}

export class TearBakePlayer {
  readonly body: BufferGeometry;
  readonly strip: BufferGeometry;
  private bake: TearBake;
  private readonly bodyN: number;
  private readonly bodyPos: Float32Array;
  private readonly stripPos: Float32Array;
  private readonly bodyNrm: Float32Array;
  private readonly stripNrm: Float32Array;
  private cur = -1;

  constructor(bake: TearBake) {
    this.bake = bake;
    const h = bake.header;
    const body = h.sheets.filter((s) => s.part === 'body');
    const strip = h.sheets.filter((s) => s.part === 'strip');
    this.bodyN = body.reduce((a, s) => a + s.ny * h.nx, 0);
    this.body = this.build(body, 0);
    this.strip = this.build(strip, this.bodyN);
    this.bodyPos = this.body.getAttribute('position').array as Float32Array;
    this.stripPos = this.strip.getAttribute('position').array as Float32Array;
    this.bodyNrm = this.body.getAttribute('normal').array as Float32Array;
    this.stripNrm = this.strip.getAttribute('normal').array as Float32Array;
    this.setFrame(0);
  }

  get header() {
    return this.bake.header;
  }

  /** Change de variante (même topologie). */
  use(bake: TearBake) {
    if (bake === this.bake) return;
    this.bake = bake;
    this.cur = -1;
    this.setFrame(0);
  }

  private build(sheets: TearBakeHeader['sheets'], offset: number): BufferGeometry {
    const h = this.bake.header;
    const nx = h.nx;
    let n = 0;
    for (const s of sheets) n += s.ny * nx;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const aug = new Float32Array(n);
    const idx: number[] = [];
    const groups: Array<[number, number, number]> = [];
    for (const s of sheets) {
      const base = s.base - offset;
      for (let j = 0; j < s.ny; j++)
        for (let i = 0; i < nx; i++) {
          const k = base + j * nx + i;
          const u = i / (nx - 1);
          const v = s.ys[j] / PACK.h + 0.5;
          uv[k * 2] = s.side > 0 ? u : 1 - u;
          uv[k * 2 + 1] = v;
          aug[k] = u;
        }
      const start = idx.length;
      for (let j = 0; j < s.ny - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          const a = base + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
          if (s.side > 0) idx.push(a, b, d, a, d, c);
          else idx.push(a, d, b, a, c, d);
        }
      groups.push([start, idx.length - start, s.side > 0 ? 0 : 1]);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('aug', new Float32BufferAttribute(aug, 1));
    g.setIndex(new Uint32BufferAttribute(new Uint32Array(idx), 1));
    for (const [s, c, m] of groups) g.addGroup(s, c, m);
    // bornes larges : la bande vole loin, le corps s'ouvre — pas de calcul par image
    g.boundingSphere = null;
    return g;
  }

  /** Phase déchirure : p = 0..1. */
  setTear(p: number) {
    this.setFrame(Math.min(1, Math.max(0, p)) * (this.bake.header.nTear - 1));
  }

  /** Phase sortie : t en secondes depuis la fin de la déchirure. */
  setExit(t: number) {
    const h = this.bake.header;
    this.setFrame(h.nTear + Math.min(h.nExit - 1, Math.max(0, t * h.exitFps)));
  }

  /** la bande arrachée est-elle encore à montrer (temps de sortie) */
  stripVisible(t: number) {
    return t < this.bake.header.stripHide;
  }

  /** image (réelle) : interpolée entre deux images enregistrées */
  setFrame(f: number) {
    const h = this.bake.header;
    const F = h.nTear + h.nExit;
    f = Math.min(F - 1, Math.max(0, f));
    if (Math.abs(f - this.cur) < 1e-4) return;
    this.cur = f;
    const f0 = Math.floor(f), f1 = Math.min(F - 1, f0 + 1), k = f - f0;
    const n = h.verts, rest = this.bake.rest, fr = this.bake.frames;
    const o0 = f0 * n * 3, o1 = f1 * n * 3;
    const bn3 = this.bodyN * 3;
    for (let i = 0; i < bn3; i++) this.bodyPos[i] = rest[i] + (fr[o0 + i] + (fr[o1 + i] - fr[o0 + i]) * k) * h.q;
    for (let i = bn3; i < n * 3; i++) this.stripPos[i - bn3] = rest[i] + (fr[o0 + i] + (fr[o1 + i] - fr[o0 + i]) * k) * h.qStrip;
    this.normals(h.sheets.filter((s) => s.part === 'body'), this.bodyPos, this.bodyNrm, 0);
    this.normals(h.sheets.filter((s) => s.part === 'strip'), this.stripPos, this.stripNrm, this.bodyN);
    for (const g of [this.body, this.strip]) {
      g.getAttribute('position').needsUpdate = true;
      g.getAttribute('normal').needsUpdate = true;
    }
  }

  private normals(sheets: TearBakeHeader['sheets'], P: Float32Array, N: Float32Array, offset: number) {
    const nx = this.bake.header.nx;
    for (const s of sheets) {
      const base = s.base - offset;
      for (let j = 0; j < s.ny; j++) {
        const j0 = Math.max(0, j - 1), j1 = Math.min(s.ny - 1, j + 1);
        for (let i = 0; i < nx; i++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
          const a = (base + j * nx + i1) * 3, b = (base + j * nx + i0) * 3, c = (base + j1 * nx + i) * 3, d = (base + j0 * nx + i) * 3;
          const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2];
          const vx = P[c] - P[d], vy = P[c + 1] - P[d + 1], vz = P[c + 2] - P[d + 2];
          let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
          const l = (Math.hypot(x, y, z) || 1) * s.side;
          x /= l, y /= l, z /= l;
          const o = (base + j * nx + i) * 3;
          N[o] = x, N[o + 1] = y, N[o + 2] = z;
        }
      }
    }
  }

  dispose() {
    this.body.dispose();
    this.strip.dispose();
  }
}
