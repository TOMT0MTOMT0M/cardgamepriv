import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';
import { decode, type TearBakeHeader } from './tearBakeFormat';
import { bakeFrame } from './bakeInterp';
import { PACK } from './packCrease';
import { siteUrl } from './siteRoot';

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
 *  - (27/11) RETROUSSÉ (`scenario: 'retrousse'`, `loadBakes('retrousse')`) : même lecteur, sans bande (aucune nappe
 *    `strip` : géométrie vide, rien réécrit), positions données par `bakeFrame` (core/bakeInterp.ts, repère de la
 *    charnière), normales comme ici. Les deux familles ne sont jamais chargées ensemble (`dropBakes`).
 *
 * Mémoire : positions gardées en int16 (écart au repos × q : 5 µm pour le corps, 20 µm pour la bande), ~6 Mo par variante.
 */
export interface TearBake {
  header: TearBakeHeader;
  rest: Float32Array;
  /** images : (position − repos) / q, absolues, [image][sommet × 3] */
  frames: Int16Array;
}

/** à monter à chaque nouvelle cuisson (npm run bake:tear) : le service worker garde les fichiers par version */
export const BAKE_REV = 2;
/** (27/11) idem pour le Retroussé (npm run bake:retrousse) : `public/bake/retrousse-N.tear` */
export const BAKE_REV_RETROUSSE = 1;
/** (27/11) idem pour la Fenêtre (npm run bake:fenetre) : `public/bake/fenetre-N.tear` */
export const BAKE_REV_FENETRE = 1;

/**
 * (27/11, Retroussé) pas de la tête de lecture pendant la phase pilotée : 1/ROLL_STEP d'image enregistrée (≈ 1/1 500
 * de la course : la charnière avance de 1,26 mm par image, donc 0,08 mm par pas, environ un tiers de pixel CSS au
 * téléphone) — la fin du rattrapage de la tête de lecture ne recalcule plus des écarts invisibles, et un doigt lent ne
 * voit pas de marches
 */
const ROLL_STEP = 16;

/**
 * (27/11, Retroussé) FAMILLES de cuissons : une par geste. On ne charge que celle de l'ouverture choisie (la Déchirure
 * pour tout le reste : glace, étoile, éventail compris). Mêmes URL qu'avant pour la Déchirure.
 */
export type BakeFamily = 'tear' | 'retrousse' | 'fenetre';
const FAMILIES: Record<BakeFamily, { n: number; rev: number }> = {
  tear: { n: 3, rev: BAKE_REV },
  retrousse: { n: 2, rev: BAKE_REV_RETROUSSE },
  fenetre: { n: 2, rev: BAKE_REV_FENETRE },
};
interface FamilyState {
  loading: Promise<TearBake | null>[] | null;
  /** variantes arrivées (dans l'ordre d'arrivée) */
  loaded: TearBake[];
  /** génération : une variante qui arrive après un `dropBakes` est jetée */
  gen: number;
}
const state: Record<BakeFamily, FamilyState> = {
  tear: { loading: null, loaded: [], gen: 0 },
  retrousse: { loading: null, loaded: [], gen: 0 },
  fenetre: { loading: null, loaded: [], gen: 0 },
};

async function fetchBake(fam: BakeFamily, i: number): Promise<TearBake | null> {
  try {
    const res = await fetch(siteUrl(`bake/${fam}-${i}.tear?v=${FAMILIES[fam].rev}`));
    if (!res.ok || !res.body) return null;
    let buf = new Uint8Array(await res.arrayBuffer());
    // gzip (1f 8b) — sauf si le serveur l'a déjà décompressé (Content-Encoding)
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') return null;
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    const b = decode(buf);
    // un fichier d'une autre famille (ou d'un autre format) n'est pas joué par ce geste
    return b && (b.header.scenario ?? 'tear') === fam ? b : null;
  } catch {
    return null;
  }
}

// (27/11) décodage déplacé tel quel dans tearBakeFormat.ts (pur, testable sous Node) ; même nom exporté ici
export { decode };

/**
 * (audit perf 28/11, n°11) Seule la PREMIÈRE variante part avec la boutique (1,2 Mo au lieu de 3,6 — 64 % des octets
 * d'avant la boutique, 5 à 12 s en 4G). Les suivantes attendent que la scène dise « vitrine affichée et au repos »
 * (`allowMoreBakes`, appelé par l'ouverture une fois ses visuels prêts), puis qu'aucune ouverture ne soit en cours, puis
 * un moment calme : le tirage au hasard se fait parmi les variantes arrivées (`loadedBakes`), les autres s'y ajoutent.
 * Garde-fou : sans signal de la scène, elles partent 30 s après la première.
 */
let moreOpen: () => void = () => undefined;
const moreGate = new Promise<void>((r) => (moreOpen = r));
let moreRest: () => boolean = () => true;
export function allowMoreBakes(atRest: () => boolean = () => true): void {
  moreRest = atRest;
  moreOpen();
}
async function moreWait(): Promise<void> {
  await Promise.race([moreGate, new Promise((r) => setTimeout(r, 30000))]);
  while (!moreRest()) await new Promise((r) => setTimeout(r, 1000));
  await new Promise<void>((r) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback(cb: () => void, o?: { timeout: number }): number }).requestIdleCallback(() => r(), { timeout: 3000 }) : setTimeout(r, 300)));
}

/** Lance (une fois) le chargement d'une famille : la première variante tout de suite, les suivantes au repos, l'une après l'autre. */
export function loadBakes(fam: BakeFamily): Promise<TearBake | null> {
  const st = state[fam];
  if (st.loading) return st.loading[0];
  const gen = st.gen;
  const keep = (b: TearBake | null) => (b && st.gen === gen ? (st.loaded.push(b), b) : null);
  const first = fetchBake(fam, 0).then(keep);
  st.loading = [first];
  let chain: Promise<unknown> = first;
  for (let i = 1; i < FAMILIES[fam].n; i++) {
    const p = chain.then(moreWait).then(() => (st.gen === gen ? fetchBake(fam, i) : null)).then(keep);
    st.loading.push(p);
    chain = p;
  }
  return first;
}

/** Variantes déjà chargées d'une famille (vide tant que la première n'est pas arrivée). */
export function loadedBakesOf(fam: BakeFamily): readonly TearBake[] {
  return state[fam].loaded;
}

/**
 * Oublie une famille (le joueur a changé d'ouverture) : état de chargement remis à zéro, variantes relâchées (les
 * chargements en cours sont jetés à l'arrivée). Le lecteur qui la jouait est libéré par l'appelant (`dispose`), hors
 * ouverture.
 */
export function dropBakes(fam: BakeFamily) {
  const st = state[fam];
  st.loading = null;
  st.loaded = [];
  st.gen++;
}

/** Lance (une fois) le chargement des variantes de la Déchirure : la première tout de suite, les suivantes l'une après l'autre. */
export function loadTearBakes(): Promise<TearBake | null> {
  return loadBakes('tear');
}

/** Variantes de la Déchirure déjà chargées (vide tant que la première n'est pas arrivée). */
export function loadedBakes(): readonly TearBake[] {
  return state.tear.loaded;
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
  private sheetsOf: TearBakeHeader | null = null;
  private bodySheets: TearBakeHeader['sheets'] = [];
  private stripSheets: TearBakeHeader['sheets'] = [];

  constructor(bake: TearBake) {
    this.bake = bake;
    const h = bake.header;
    const body = h.sheets.filter((s) => s.part === 'body');
    const strip = h.sheets.filter((s) => s.part === 'strip');
    this.bodyN = body.reduce((a, s) => a + s.ny * (s.nx ?? h.nx), 0);
    this.body = this.build(body, 0);
    this.strip = this.build(strip, this.bodyN);
    this.bodyPos = this.body.getAttribute('position').array as Float32Array;
    this.stripPos = this.strip.getAttribute('position').array as Float32Array;
    this.bodyNrm = this.body.getAttribute('normal').array as Float32Array;
    this.stripNrm = this.strip.getAttribute('normal').array as Float32Array;
    this.hasStrip = strip.length > 0;
    this.setFrame(0);
  }

  /** (27/11) enregistrement avec bande arrachée (Déchirure) ; le Retroussé n'en a pas */
  readonly hasStrip: boolean;
  /** (Retroussé) tampon de tous les sommets pour `bakeFrame` s'il y avait aussi une bande (sinon : positions du corps) */
  private interpOut: Float32Array | null = null;

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
    let n = 0;
    for (const s of sheets) n += s.ny * (s.nx ?? h.nx);
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const aug = new Float32Array(n);
    const idx: number[] = [];
    const groups: Array<[number, number, number]> = [];
    for (const s of sheets) {
      const base = s.base - offset;
      // (27/11, Fenêtre) colonnes propres à la nappe, x de repos de chaque colonne, cellules du trou sans triangles
      const nx = s.nx ?? h.nx, xs = s.xs, hole = s.hole;
      for (let j = 0; j < s.ny; j++)
        for (let i = 0; i < nx; i++) {
          const k = base + j * nx + i;
          const u = xs ? xs[i] / PACK.w + 0.5 : i / (nx - 1);
          const v = s.ys[j] / PACK.h + 0.5;
          uv[k * 2] = s.side > 0 ? u : 1 - u;
          uv[k * 2 + 1] = v;
          aug[k] = u;
        }
      const start = idx.length;
      for (let j = 0; j < s.ny - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          if (hole && i >= hole[0] && i < hole[1] && j >= hole[2] && j < hole[3]) continue;
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
    // (27/11) Retroussé seulement : tête de lecture de la phase pilotée au 1/ROLL_STEP d'image (la Déchirure n'y passe pas)
    if (h.scenario === 'retrousse' && f < h.nTear - 1) f = Math.round(f * ROLL_STEP) / ROLL_STEP;
    if (Math.abs(f - this.cur) < 1e-4) return;
    this.cur = f;
    if (h.scenario === 'retrousse') return this.setFrameRoll(f);
    const f0 = Math.floor(f), f1 = Math.min(F - 1, f0 + 1), k = f - f0;
    const n = h.verts, rest = this.bake.rest, fr = this.bake.frames;
    const o0 = f0 * n * 3, o1 = f1 * n * 3;
    const bn3 = this.bodyN * 3;
    for (let i = 0; i < bn3; i++) this.bodyPos[i] = rest[i] + (fr[o0 + i] + (fr[o1 + i] - fr[o0 + i]) * k) * h.q;
    for (let i = bn3; i < n * 3; i++) this.stripPos[i - bn3] = rest[i] + (fr[o0 + i] + (fr[o1 + i] - fr[o0 + i]) * k) * h.qStrip;
    // (audit 12/11, A10-10) feuilles triées une fois par variante, plus deux filtres par image de lecture
    if (this.sheetsOf !== h) {
      this.sheetsOf = h;
      this.bodySheets = h.sheets.filter((s) => s.part === 'body');
      this.stripSheets = h.sheets.filter((s) => s.part === 'strip');
    }
    this.normals(this.bodySheets, this.bodyPos, this.bodyNrm, 0);
    this.normals(this.stripSheets, this.stripPos, this.stripNrm, this.bodyN);
    for (const g of [this.body, this.strip]) {
      g.getAttribute('position').needsUpdate = true;
      g.getAttribute('normal').needsUpdate = true;
    }
  }

  /**
   * (27/11) Retroussé : positions de `bakeFrame` (interpolées dans le repère de la charnière pendant la phase pilotée,
   * linéaires en sortie), normales par `normalsRoll`. Aucun tableau alloué ici (le tampon commun n'existe que s'il y a
   * une bande, ce que le Retroussé n'a pas).
   */
  private setFrameRoll(f: number) {
    const h = this.bake.header;
    if (this.sheetsOf !== h) {
      this.sheetsOf = h;
      this.bodySheets = h.sheets.filter((s) => s.part === 'body');
      this.stripSheets = h.sheets.filter((s) => s.part === 'strip');
    }
    if (!this.hasStrip) bakeFrame(this.bake, f, this.bodyPos);
    else {
      const out = (this.interpOut ??= new Float32Array(h.verts * 3));
      bakeFrame(this.bake, f, out);
      const bn3 = this.bodyN * 3;
      this.bodyPos.set(out.subarray(0, bn3));
      this.stripPos.set(out.subarray(bn3, h.verts * 3));
    }
    this.normalsRoll(this.bodySheets, this.bodyPos, this.bodyNrm, 0);
    this.body.getAttribute('position').needsUpdate = true;
    this.body.getAttribute('normal').needsUpdate = true;
    if (this.hasStrip) {
      this.normalsRoll(this.stripSheets, this.stripPos, this.stripNrm, this.bodyN);
      this.strip.getAttribute('position').needsUpdate = true;
      this.strip.getAttribute('normal').needsUpdate = true;
    }
  }

  private normals(sheets: TearBakeHeader['sheets'], P: Float32Array, N: Float32Array, offset: number) {
    const hnx = this.bake.header.nx;
    for (const s of sheets) {
      const base = s.base - offset;
      const nx = s.nx ?? hnx;
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

  /**
   * (27/11) Retroussé : mêmes normales que `normals` (différences centrées sur la grille), longueur par `Math.sqrt` au
   * lieu de `Math.hypot` (plusieurs fois plus lent dans V8) et une multiplication par l'inverse. La Déchirure garde
   * `normals` tel quel (mêmes valeurs au bit près).
   */
  private normalsRoll(sheets: TearBakeHeader['sheets'], P: Float32Array, N: Float32Array, offset: number) {
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
          const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
          const inv = s.side / (Math.sqrt(x * x + y * y + z * z) || 1);
          const o = (base + j * nx + i) * 3;
          N[o] = x * inv, N[o + 1] = y * inv, N[o + 2] = z * inv;
        }
      }
    }
  }

  dispose() {
    this.body.dispose();
    this.strip.dispose();
  }
}
