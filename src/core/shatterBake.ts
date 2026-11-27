import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';
import { decodeShatter, type ShatterBake } from './shatterFormat';
import { siteUrl } from './siteRoot';

/**
 * (27/11, V3) REJEU de la Déchirure glacée (scripts/bake-tear/glace.mts, format core/shatterFormat.ts) : le bloc de
 * glace et le sachet gelé, fracturés d'avance ; chaque éclat est un solide (position + orientation enregistrées).
 *
 *  - `loadShatters()` : télécharge les variantes (une par point d'impact : la première tout de suite, les autres
 *    derrière), décompresse (gzip, natif) ;
 *  - `ShatterPlayer` : un lecteur PAR variante (topologies différentes) — deux géométries (glace : position, normale,
 *    uv, `lvl` = niveau de fissure ; film : position, normale, uv, groupes face avant / dos) réécrites au processeur à
 *    chaque image (≈ 5 000 sommets : rotation + translation par éclat, interpolées entre deux images enregistrées).
 */
export const BAKE_REV_GLACE = 2;
const N_VARIANTS = 3;

let loading: Promise<ShatterBake | null>[] | null = null;
let loaded: ShatterBake[] = [];
let gen = 0;

async function fetchShatter(i: number): Promise<ShatterBake | null> {
  try {
    const res = await fetch(siteUrl(`bake/glace-${i}.shat?v=${BAKE_REV_GLACE}`));
    if (!res.ok || !res.body) return null;
    let buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') return null;
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    return decodeShatter(buf);
  } catch {
    return null;
  }
}

/** Lance (une fois) le chargement des variantes : la première tout de suite, les suivantes l'une après l'autre. */
export function loadShatters(): Promise<ShatterBake | null> {
  if (loading) return loading[0];
  const g = gen;
  const keep = (b: ShatterBake | null) => (b && gen === g ? (loaded.push(b), b) : null);
  const first = fetchShatter(0).then(keep);
  loading = [first];
  let chain: Promise<unknown> = first;
  for (let i = 1; i < N_VARIANTS; i++) {
    const p = chain.then(() => (gen === g ? fetchShatter(i) : null)).then(keep);
    loading.push(p);
    chain = p;
  }
  return first;
}
export function loadedShatters(): readonly ShatterBake[] {
  return loaded;
}
/** Oublie les variantes (le joueur a changé d'ouverture) ; les lecteurs sont libérés par l'appelant. */
export function dropShatters() {
  loading = null;
  loaded = [];
  gen++;
}

export class ShatterPlayer {
  readonly ice: BufferGeometry;
  readonly film: BufferGeometry;
  readonly bake: ShatterBake;
  private readonly icePos: Float32Array;
  private readonly iceNrm: Float32Array;
  private readonly filmPos: Float32Array;
  private readonly filmNrm: Float32Array;
  private cur = -1;

  constructor(b: ShatterBake) {
    this.bake = b;
    const h = b.header;
    const mk = (v0: number, v1: number, t0: number, t1: number, groups?: Array<[number, number, number]>) => {
      const n = v1 - v0;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('uv', new Float32BufferAttribute(b.uv.slice(v0 * 2, v1 * 2), 2));
      g.setAttribute('lvl', new Float32BufferAttribute(b.lvl.slice(v0, v1), 1));
      const idx = b.idx.slice(t0 * 3, t1 * 3);
      for (let i = 0; i < idx.length; i++) idx[i] -= v0;
      g.setIndex(new Uint32BufferAttribute(idx, 1));
      for (const [s, c, m] of groups ?? []) g.addGroup(s, c, m);
      g.boundingSphere = null;
      return g;
    };
    this.ice = mk(0, h.iceV, 0, h.iceT);
    this.film = mk(h.iceV, h.verts, h.iceT, h.tris, [
      [0, (h.filmBackT - h.iceT) * 3, 0],
      [(h.filmBackT - h.iceT) * 3, (h.tris - h.filmBackT) * 3, 1],
    ]);
    this.icePos = this.ice.getAttribute('position').array as Float32Array;
    this.iceNrm = this.ice.getAttribute('normal').array as Float32Array;
    this.filmPos = this.film.getAttribute('position').array as Float32Array;
    this.filmNrm = this.film.getAttribute('normal').array as Float32Array;
    this.setTime(0);
  }

  get header() {
    return this.bake.header;
  }
  /** durée enregistrée (s) */
  get duration() {
    const h = this.bake.header;
    return (h.nFrames - 1) / h.fps;
  }

  /** t en secondes depuis le 3e toucher (0 = repos) */
  setTime(t: number) {
    const h = this.bake.header;
    const f = Math.min(h.nFrames - 1, Math.max(0, t * h.fps));
    if (Math.abs(f - this.cur) < 1e-4) return;
    this.cur = f;
    const f0 = Math.floor(f), f1 = Math.min(h.nFrames - 1, f0 + 1), k = f - f0;
    const F = this.bake.frames, P = this.bake.pos, Nr = this.bake.nrm, R = h.ranges;
    for (let s = 0; s < h.nShards; s++) {
      const a = (f0 * h.nShards + s) * 7, b = (f1 * h.nShards + s) * 7;
      const cx = F[a] + (F[b] - F[a]) * k, cy = F[a + 1] + (F[b + 1] - F[a + 1]) * k, cz = F[a + 2] + (F[b + 2] - F[a + 2]) * k;
      // quaternion : nlerp (deux images à 1/30 s : l'écart est petit)
      let qx = F[a + 3], qy = F[a + 4], qz = F[a + 5], qw = F[a + 6];
      let bx = F[b + 3], by = F[b + 4], bz = F[b + 5], bw = F[b + 6];
      if (qx * bx + qy * by + qz * bz + qw * bw < 0) (bx = -bx), (by = -by), (bz = -bz), (bw = -bw);
      qx += (bx - qx) * k, qy += (by - qy) * k, qz += (bz - qz) * k, qw += (bw - qw) * k;
      const ql = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
      qx *= ql, qy *= ql, qz *= ql, qw *= ql;
      const v0 = R[s * 3], n = R[s * 3 + 1];
      const ice = v0 < h.iceV;
      const out = ice ? this.icePos : this.filmPos, outN = ice ? this.iceNrm : this.filmNrm;
      const base = ice ? 0 : h.iceV;
      for (let v = v0; v < v0 + n; v++) {
        const i = v * 3, o = (v - base) * 3;
        for (let pass = 0; pass < 2; pass++) {
          const src = pass === 0 ? P : Nr, dst = pass === 0 ? out : outN;
          const x = src[i], y = src[i + 1], z = src[i + 2];
          const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
          const rx = x + qw * tx + (qy * tz - qz * ty), ry = y + qw * ty + (qz * tx - qx * tz), rz = z + qw * tz + (qx * ty - qy * tx);
          if (pass === 0) (dst[o] = rx + cx), (dst[o + 1] = ry + cy), (dst[o + 2] = rz + cz);
          else (dst[o] = rx), (dst[o + 1] = ry), (dst[o + 2] = rz);
        }
      }
    }
    for (const g of [this.ice, this.film]) {
      g.getAttribute('position').needsUpdate = true;
      g.getAttribute('normal').needsUpdate = true;
    }
  }

  dispose() {
    this.ice.dispose();
    this.film.dispose();
  }
}
