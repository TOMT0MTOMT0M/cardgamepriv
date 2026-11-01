import { BufferGeometry, Float32BufferAttribute, Mesh, type Material } from 'three/webgpu';

/**
 * Format réel 63 × 88 mm. 1 unité = 100 mm → la carte fait 0.63 × 0.88.
 * Épaisseur légèrement exagérée (0.7 mm) pour que la tranche se lise à l'écran.
 */
export const CARD = {
  w: 0.63,
  h: 0.88,
  r: 0.031,
  t: 0.007,
} as const;

export interface CardGeometryOptions {
  width?: number;
  height?: number;
  radius?: number;
  thickness?: number;
  /** segments dans la partie droite (x, y) — monter pour les déformations */
  segX?: number;
  segY?: number;
  /** segments par quart d'arrondi (sur chaque axe) */
  segCorner?: number;
}

/**
 * Géométrie de carte : face avant (groupe 0), dos (groupe 1), tranche (groupe 2).
 * La face est une grille dont les coins sont "arrondis" par un mapping carré→disque :
 * les sommets intérieurs existent (déformations vertex possibles), les UV restent planaires.
 */
export function createCardGeometry(o: CardGeometryOptions = {}): BufferGeometry {
  const w = o.width ?? CARD.w;
  const h = o.height ?? CARD.h;
  const r = o.radius ?? CARD.r;
  const t = o.thickness ?? CARD.t;
  const sx = o.segX ?? 12;
  const sy = o.segY ?? 16;
  const sc = o.segCorner ?? 6;

  const axis = (len: number, seg: number) => {
    const out: number[] = [];
    const half = len / 2;
    for (let i = 0; i < sc; i++) out.push(-half + (r * i) / sc);
    for (let i = 0; i < seg; i++) out.push(-half + r + ((len - 2 * r) * i) / seg);
    for (let i = 0; i <= sc; i++) out.push(half - r + (r * i) / sc);
    return out;
  };
  const xs = axis(w, sx);
  const ys = axis(h, sy);
  const nx = xs.length; // vertices per row
  const ny = ys.length;

  const map = (x: number, y: number): [number, number] => {
    const cx = w / 2 - r;
    const cy = h / 2 - r;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax > cx + 1e-9 && ay > cy + 1e-9) {
      const u = ax - cx;
      const v = ay - cy;
      const uu = u * Math.sqrt(Math.max(0, 1 - (v * v) / (2 * r * r)));
      const vv = v * Math.sqrt(Math.max(0, 1 - (u * u) / (2 * r * r)));
      return [Math.sign(x) * (cx + uu), Math.sign(y) * (cy + vv)];
    }
    return [x, y];
  };

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const tan: number[] = [];
  const idx: number[] = [];
  const grid: Array<[number, number]> = [];

  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid.push(map(xs[i], ys[j]));

  // face avant
  const front0 = 0;
  for (const [x, y] of grid) {
    pos.push(x, y, t / 2);
    nor.push(0, 0, 1);
    uv.push((x + w / 2) / w, (y + h / 2) / h);
    tan.push(1, 0, 0, 1);
  }
  const frontIdxStart = idx.length;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = front0 + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const frontCount = idx.length - frontIdxStart;

  // dos (UV miroir en x pour lire le dos à l'endroit)
  const back0 = pos.length / 3;
  for (const [x, y] of grid) {
    pos.push(x, y, -t / 2);
    nor.push(0, 0, -1);
    uv.push(1 - (x + w / 2) / w, (y + h / 2) / h);
    tan.push(-1, 0, 0, 1);
  }
  const backIdxStart = idx.length;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = back0 + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
  const backCount = idx.length - backIdxStart;

  // tranche : contour CCW (vu de +Z)
  const ring: number[] = [];
  for (let i = 0; i < nx; i++) ring.push(i);
  for (let j = 1; j < ny; j++) ring.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) ring.push((ny - 1) * nx + i);
  for (let j = ny - 2; j >= 1; j--) ring.push(j * nx);
  const edge0 = pos.length / 3;
  const L = ring.length;
  let acc = 0;
  for (let k = 0; k < L; k++) {
    const p = grid[ring[k]];
    const pn = grid[ring[(k + 1) % L]];
    const pp = grid[ring[(k - 1 + L) % L]];
    let tx = pn[0] - pp[0];
    let ty = pn[1] - pp[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nxv = ty, nyv = -tx;
    if (k > 0) {
      const q = grid[ring[k - 1]];
      acc += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
    for (const z of [t / 2, -t / 2]) {
      pos.push(p[0], p[1], z);
      nor.push(nxv, nyv, 0);
      uv.push(acc / (2 * (w + h)), z > 0 ? 1 : 0);
      tan.push(tx, ty, 0, 1);
    }
  }
  const edgeIdxStart = idx.length;
  for (let k = 0; k < L; k++) {
    const a = edge0 + k * 2, b = a + 1;
    const c = edge0 + ((k + 1) % L) * 2, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const edgeCount = idx.length - edgeIdxStart;

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('tangent', new Float32BufferAttribute(tan, 4));
  g.setIndex(idx);
  g.addGroup(frontIdxStart, frontCount, 0);
  g.addGroup(backIdxStart, backCount, 1);
  g.addGroup(edgeIdxStart, edgeCount, 2);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Maillage de carte : [face, dos, tranche]. */
export function createCardMesh(front: Material, back: Material, edge: Material, o?: CardGeometryOptions): Mesh {
  const m = new Mesh(createCardGeometry(o), [front, back, edge]);
  m.name = 'card';
  return m;
}

/** Contour arrondi (points 2D) — utile pour les découpes, masques et emballages. */
export function roundedRectPath(w: number, h: number, r: number, segPerCorner = 8): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [
    [w / 2 - r, -h / 2 + r, -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= segPerCorner; i++) {
      const a = a0 + (i / segPerCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  return pts;
}
