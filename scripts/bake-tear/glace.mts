/**
 * SIMULATEUR HORS-LIGNE de la « Déchirure glacée » refaite (27/11, V3, case 20 de l'Avent ; demande de Tom : « un
 * booster pris dans un bloc de glace, le joueur appuie 3 fois et ça casse, le sachet se brise en même temps que la
 * glace, réaliste, la matière est devenue fragile »).
 *
 *   npm run bake:glace                       → public/bake/glace-0.shat … glace-2.shat (un point d'impact chacune)
 *   réglages (variables d'environnement) : BZ, V0, VZ, GK, CRACKV, KN, KT, W0, SEEDS
 *
 * Le scénario :
 *  - un bloc de glace (le sachet au milieu) et le sachet gelé, fracturés d'avance par les MÊMES graines : cellules de
 *    Voronoï 3D pour la glace (polyèdres convexes : le bloc coupé par les plans médiateurs), 2D pour le film (les
 *    cellules du sachet sont la projection des mêmes graines) — les lignes de casse de la glace traversent le sachet ;
 *  - graines en anneaux autour du point d'impact (serrées au centre : petits éclats où l'on frappe, gros au loin) ;
 *  - chaque face de cassure reçoit un NIVEAU (1, 2, 3) selon sa distance à l'impact : le jeu révèle les fêlures à
 *    chaque toucher, le 3e fait tout éclater ;
 *  - éclats = solides : lâchés au passage du front de fissure (CRACKV), vitesse radiale depuis l'impact, vers le
 *    joueur devant le sachet, vers l'arrière derrière, rotation au hasard ; la glace est lourde (peu d'air), le film
 *    gelé est léger : freiné selon sa normale, il volette. Gravité réduite (GK × g : à l'échelle du sachet, g entier
 *    vide l'écran en 0,2 s). La pile de cartes ne bouge pas (elle apparaît, givrée, dans le jeu).
 * Format : src/core/shatterFormat.ts ; rejeu : src/core/shatterBake.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PACK, lcg, packRestZ } from '../../src/core/packCrease';
import { SHATTER_FORMAT, encodeShatter, type ShatterHeader } from '../../src/core/shatterFormat';

const ENV = (k: string, d: number) => (process.env[k] !== undefined ? +process.env[k]! : d);
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1));

// ───────────────────────────── dimensions (unités du sachet : 1 = 100 mm)
const W = PACK.w, H = PACK.h;
/** demi-tailles du bloc : 5 mm de glace autour du sachet, BZ d'épaisseur de chaque côté */
const BX = W / 2 + 0.05, BY = H / 2 + 0.05, BZ = ENV('BZ', 0.07);
const FPS = 30, DUR = 1.4;
const N_FRAMES = Math.round(DUR * FPS) + 1;
const FRAME_DT = 1 / 240;
const G = 98.1 * ENV('GK', 0.12);
const V0 = ENV('V0', 1.3), VZ = ENV('VZ', 0.9), W0 = ENV('W0', 9);
const CRACK_V = ENV('CRACKV', 5);
/** film gelé : freinage selon la normale (volette) et tangent */
const KN = ENV('KN', 7), KT = ENV('KT', 0.6);
/** distance à l'impact des fêlures révélées au 1er et au 2e toucher */
const R1 = 0.2, R2 = 0.5;

interface GVariant { seed: number; impact: [number, number] }
const VARIANTS: GVariant[] = [
  { seed: 5, impact: [-0.16, 0.26] },
  { seed: 13, impact: [0.14, -0.12] },
  { seed: 29, impact: [0.02, 0.45] },
];

// ───────────────────────────── polyèdres convexes
interface Face { pts: V3[]; tag: number } // tag −1 : surface du bloc ; sinon : face de cassure
function boxFaces(): Face[] {
  const P = (x: number, y: number, z: number): V3 => [x * BX, y * BY, z * BZ];
  // chaque face dans le sens trigonométrique vue de l'extérieur
  return [
    { pts: [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], tag: -1 },
    { pts: [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], tag: -1 },
    { pts: [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], tag: -1 },
    { pts: [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], tag: -1 },
    { pts: [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], tag: -1 },
    { pts: [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], tag: -1 },
  ];
}
/** garde le demi-espace n·p ≤ d ; la face de coupe (normale +n vers l'extérieur) reçoit `tag` */
function clip(faces: Face[], n: V3, d: number, tag: number): Face[] {
  const out: Face[] = [];
  const cap: V3[] = [];
  for (const f of faces) {
    const res: V3[] = [];
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length];
      const da = dot(n, a) - d, db = dot(n, b) - d;
      if (da <= 0) res.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        const p = add(a, mul(sub(b, a), t));
        res.push(p);
        cap.push(p);
      } else if (da === 0) cap.push(a);
    }
    if (res.length >= 3) out.push({ pts: res, tag: f.tag });
  }
  // face de coupe : points distincts, triés autour de leur centre (sens trigonométrique vu depuis +n)
  const uniq: V3[] = [];
  for (const p of cap) if (!uniq.some((q) => Math.hypot(...sub(p, q)) < 1e-7)) uniq.push(p);
  if (uniq.length >= 3) {
    const c = mul(uniq.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / uniq.length);
    const u = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
    const w = cross(n, u);
    uniq.sort((p, q) => Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) - Math.atan2(dot(sub(q, c), w), dot(sub(q, c), u)));
    out.push({ pts: uniq, tag });
  }
  return out;
}
/** polygone convexe 2D coupé par n·p ≤ d */
function clip2(poly: Array<[number, number]>, n: [number, number], d: number): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = n[0] * a[0] + n[1] * a[1] - d, db = n[0] * b[0] + n[1] * b[1] - d;
    if (da <= 0) res.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return res;
}

interface Shard { kind: 0 | 1 | 2; c: V3; pos: number[]; nrm: number[]; uv: number[]; lvl: number[]; tri: number[]; m: number; n0: V3 }

function bake(V: GVariant, index: number) {
  const rnd = lcg(V.seed);
  const I: V3 = [V.impact[0], V.impact[1], BZ];
  // ── graines : anneaux autour de l'impact (rayon × 1,55 d'un anneau à l'autre), un peu partout en z
  const seeds: V3[] = [];
  const NR = ENV('SEEDS', 8);
  for (let k = 0; k < NR; k++) {
    const r = 0.045 * Math.pow(1.55, k), n = 5 + 2 * k, a0 = rnd() * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      const a = a0 + ((j + 0.5 * (rnd() - 0.5)) / n) * Math.PI * 2;
      const rr = r * (0.8 + 0.4 * rnd());
      const p: V3 = [I[0] + Math.cos(a) * rr, I[1] + Math.sin(a) * rr, (rnd() * 2 - 1) * BZ * 0.85];
      if (Math.abs(p[0]) < BX * 0.98 && Math.abs(p[1]) < BY * 0.98) seeds.push(p);
    }
  }
  const lvlOf = (d: number) => (d < R1 ? 1 : d < R2 ? 2 : 3);
  const shards: Shard[] = [];
  // ── glace : une cellule par graine
  for (let i = 0; i < seeds.length; i++) {
    let faces = boxFaces();
    for (let j = 0; j < seeds.length && faces.length; j++) {
      if (j === i) continue;
      const n = norm(sub(seeds[j], seeds[i]));
      const mid = mul(add(seeds[i], seeds[j]), 0.5);
      faces = clip(faces, n, dot(n, mid), j);
    }
    if (faces.length < 4) continue;
    const all = faces.flatMap((f) => f.pts);
    const c = mul(all.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / all.length);
    const S: Shard = { kind: 0, c, pos: [], nrm: [], uv: [], lvl: [], tri: [], m: 0, n0: [0, 0, 1] };
    let vol = 0;
    for (const f of faces) {
      // normale de la face (Newell)
      let nn: V3 = [0, 0, 0];
      for (let k = 0; k < f.pts.length; k++) {
        const a = f.pts[k], b = f.pts[(k + 1) % f.pts.length];
        nn = add(nn, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
      }
      nn = norm(nn);
      const fc = mul(f.pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / f.pts.length);
      const lv = f.tag < 0 ? 0 : lvlOf(Math.hypot(fc[0] - I[0], fc[1] - I[1], (fc[2] - I[2]) * 0.5));
      const base = S.pos.length / 3;
      for (const p of f.pts) S.pos.push(...sub(p, c)), S.nrm.push(...nn), S.uv.push(p[0] / W + 0.5, p[1] / H + 0.5), S.lvl.push(lv);
      for (let k = 1; k < f.pts.length - 1; k++) {
        S.tri.push(base, base + k, base + k + 1);
        vol += dot(sub(f.pts[0], c), cross(sub(f.pts[k], c), sub(f.pts[k + 1], c))) / 6;
      }
    }
    S.m = Math.abs(vol);
    shards.push(S);
  }
  // ── film gelé : cellules 2D des mêmes graines (une par graine, doublons écartés), face avant et dos
  const s2: Array<[number, number]> = [];
  for (const s of seeds) if (Math.abs(s[0]) < W / 2 && Math.abs(s[1]) < H / 2 && !s2.some((q) => Math.hypot(q[0] - s[0], q[1] - s[1]) < 0.025)) s2.push([s[0], s[1]]);
  const STEP = 0.035;
  for (const side of [1, -1] as const)
    for (let i = 0; i < s2.length; i++) {
      let poly: Array<[number, number]> = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
      for (let j = 0; j < s2.length && poly.length >= 3; j++) {
        if (j === i) continue;
        const dx = s2[j][0] - s2[i][0], dy = s2[j][1] - s2[i][1], l = Math.hypot(dx, dy);
        const n: [number, number] = [dx / l, dy / l];
        poly = clip2(poly, n, n[0] * (s2[i][0] + s2[j][0]) / 2 + n[1] * (s2[i][1] + s2[j][1]) / 2);
      }
      if (poly.length < 3) continue;
      // bord subdivisé (le film suit le bombé du sachet), éventail depuis le centre
      const ring: Array<[number, number]> = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const nseg = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
        for (let q = 0; q < nseg; q++) ring.push([a[0] + ((b[0] - a[0]) * q) / nseg, a[1] + ((b[1] - a[1]) * q) / nseg]);
      }
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const zAt = (x: number, y: number) => packRestZ(x / W + 0.5, y / H + 0.5, side, 0, true);
      const c: V3 = [cx, cy, zAt(cx, cy)];
      const S: Shard = { kind: side > 0 ? 1 : 2, c, pos: [], nrm: [], uv: [], lvl: [], tri: [], m: 0, n0: [0, 0, side] };
      const vert = (x: number, y: number) => {
        const e = 0.002, z = zAt(x, y);
        const gx = (zAt(x + e, y) - zAt(x - e, y)) / (2 * e), gy = (zAt(x, y + e) - zAt(x, y - e)) / (2 * e);
        const nn = norm([-gx * side, -gy * side, side]);
        S.pos.push(x - c[0], y - c[1], z - c[2]), S.nrm.push(...(side > 0 ? nn : ([nn[0], nn[1], nn[2]] as V3))), S.uv.push(side > 0 ? x / W + 0.5 : 0.5 - x / W, y / H + 0.5), S.lvl.push(0);
      };
      vert(cx, cy);
      for (const p of ring) vert(p[0], p[1]);
      const nr = ring.length;
      for (let k = 0; k < nr; k++) {
        const a = 1 + k, b = 1 + ((k + 1) % nr);
        // face avant : sens trigonométrique vu de +z ; dos : vu de −z
        if (side > 0) S.tri.push(0, a, b);
        else S.tri.push(0, b, a);
      }
      let area = 0;
      for (let k = 0; k < poly.length; k++) area += poly[k][0] * poly[(k + 1) % poly.length][1] - poly[(k + 1) % poly.length][0] * poly[k][1];
      S.m = Math.abs(area) / 2;
      shards.push(S);
    }

  // ── dynamique : chaque éclat lâché au passage du front de fissure
  const NS = shards.length;
  const st = shards.map((S) => {
    const d = Math.hypot(S.c[0] - I[0], S.c[1] - I[1]);
    const dir = norm([S.c[0] - I[0] + (rnd() - 0.5) * 0.1, S.c[1] - I[1] + (rnd() - 0.5) * 0.1, 0]);
    const ice = S.kind === 0;
    const sp = V0 * (ice ? 1 : 0.8) * (0.6 + 0.4 * rnd()) / (1 + 1.5 * d);
    const front = S.kind === 1 || (ice && S.c[2] > 0.0);
    const vz = (front ? 1 : -1) * VZ * (ice ? 0.6 + 0.6 * rnd() : 0.4 + 0.5 * rnd()) / (1 + d);
    const size = ice ? Math.cbrt(S.m) : Math.sqrt(S.m);
    const w: V3 = mul(norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), (W0 * (0.5 + rnd())) / (1 + size * 8));
    return { c: [...S.c] as V3, v: add(mul(dir, sp), [0, 0, vz]) as V3, w, q: [0, 0, 0, 1] as number[], t0: d / CRACK_V, ice, n0: S.n0 };
  });
  const frames = new Float32Array(N_FRAMES * NS * 7);
  const rec = (f: number) => {
    for (let s = 0; s < NS; s++) {
      const o = (f * NS + s) * 7, b = st[s];
      frames[o] = b.c[0], frames[o + 1] = b.c[1], frames[o + 2] = b.c[2];
      frames[o + 3] = b.q[0], frames[o + 4] = b.q[1], frames[o + 5] = b.q[2], frames[o + 6] = b.q[3];
    }
  };
  const rotate = (q: number[], v: V3): V3 => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  };
  let next = 0;
  const steps = Math.round(DUR / FRAME_DT);
  for (let k = 0; k <= steps; k++) {
    const t = k * FRAME_DT;
    while (next < N_FRAMES && t >= next / FPS - 1e-9) rec(next++);
    for (const b of st) {
      if (t < b.t0) continue;
      const h = FRAME_DT;
      b.v[1] -= G * h;
      if (!b.ice) {
        // film gelé : l'air le freine selon sa normale (il volette) et un peu le long
        const n = rotate(b.q, b.n0);
        const vn = dot(b.v, n);
        b.v = sub(b.v, add(mul(n, KN * vn * h), mul(b.v, KT * h)));
        b.w = mul(b.w, 1 - 1.5 * h);
      } else b.v = mul(b.v, 1 - 0.15 * h);
      b.c = add(b.c, mul(b.v, h));
      // quaternion : q += ½ (ω, 0) ⊗ q · h
      const [wx, wy, wz] = b.w, [x, y, z, w] = b.q;
      const dq = [wx * w + wy * z - wz * y, wy * w + wz * x - wx * z, wz * w + wx * y - wy * x, -wx * x - wy * y - wz * z];
      for (let a = 0; a < 4; a++) b.q[a] += 0.5 * dq[a] * h;
      const l = Math.hypot(...b.q);
      for (let a = 0; a < 4; a++) b.q[a] /= l;
    }
  }
  while (next < N_FRAMES) rec(next++);

  // ── tampons : glace d'abord, puis film avant, puis dos (sommets triés par éclat)
  const order = [...shards.keys()].sort((a, b) => shards[a].kind - shards[b].kind);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], lvl: number[] = [], idx: number[] = [], ranges: number[] = [];
  let iceV = 0, iceT = 0, filmBackT = 0;
  const framesOrdered = new Float32Array(N_FRAMES * NS * 7);
  order.forEach((s, k) => {
    const S = shards[s];
    if (S.kind === 1 && !iceV) (iceV = pos.length / 3), (iceT = idx.length / 3);
    if (S.kind === 2 && !filmBackT) filmBackT = idx.length / 3;
    const v0 = pos.length / 3;
    ranges.push(v0, S.pos.length / 3, S.kind);
    pos.push(...S.pos), nrm.push(...S.nrm), uv.push(...S.uv), lvl.push(...S.lvl);
    for (const i of S.tri) idx.push(v0 + i);
    for (let f = 0; f < N_FRAMES; f++) for (let a = 0; a < 7; a++) framesOrdered[(f * NS + k) * 7 + a] = frames[(f * NS + s) * 7 + a];
  });
  const header: ShatterHeader = {
    format: SHATTER_FORMAT,
    seed: V.seed,
    index,
    impact: I,
    fps: FPS,
    nFrames: N_FRAMES,
    nShards: NS,
    verts: pos.length / 3,
    tris: idx.length / 3,
    iceV,
    iceT,
    filmBackT,
    ranges,
    block: [BX, BY, BZ],
  };
  const raw = encodeShatter({ header, pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), lvl: Float32Array.from(lvl), idx: Uint32Array.from(idx), frames: framesOrdered });
  return { raw, header, nIce: shards.filter((s) => s.kind === 0).length, nFilm: shards.filter((s) => s.kind > 0).length };
}

export function runGlace(o: { out: string; only?: string }) {
  mkdirSync(o.out, { recursive: true });
  VARIANTS.forEach((V, v) => {
    if (o.only !== undefined && +o.only !== v) return;
    const t0 = performance.now();
    const r = bake(V, v);
    const gz = gzipSync(r.raw, { level: 9 });
    writeFileSync(`${o.out}/glace-${v}.shat`, gz);
    console.log(`glace ${v} (graine ${V.seed}, impact ${V.impact.join(', ')}) : ${r.nIce} éclats de glace, ${r.nFilm} de film, ${r.header.verts} sommets, ${r.header.tris} triangles, ${r.header.nFrames} images — ${(r.raw.length / 1e3).toFixed(0)} Ko → ${(gz.length / 1e3).toFixed(0)} Ko gzip, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  });
}
