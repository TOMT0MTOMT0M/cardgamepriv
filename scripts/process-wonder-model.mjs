// Normalise un modèle de merveille : nettoie, recadre (bornes robustes), oriente (+z = face vers la vitre),
// pose la base à y=0, met à l'échelle (largeur horizontale max = 1, ou hauteur = 1), simplifie, textures WebP, meshopt.
// Dépendances (outil hors jeu, non installées par défaut) :
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp gl-matrix@3
// usage : node scripts/process-wonder-model.mjs in.glb out.glb '{"rotY":0,"tris":150000,"tex":1024,"fit":"width","drop":["Boat"],"crop":0.002,"ground":0.01}'
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, flatten, join, resample, meshopt, getBounds, transformMesh, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mat4 } from 'gl-matrix';
const { fromYRotation, multiply, fromTranslation, fromScaling } = mat4;

const [, , inp, out, optJson] = process.argv;
const o = JSON.parse(optJson || '{}');
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();

// 0. animations / skins inutiles
for (const a of root.listAnimations()) a.dispose();
// 1. nœuds à retirer (par nom, sous-chaîne insensible à la casse)
if (o.drop?.length) {
  for (const n of root.listNodes()) {
    const nm = (n.getName() || '') + '|' + (n.getMesh()?.getName() || '');
    if (o.drop.some((d) => nm.toLowerCase().includes(d.toLowerCase()))) n.dispose();
  }
}
if (o.dropMat?.length) {
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) if (o.dropMat.includes(p.getMaterial()?.getName())) p.dispose();
}
await doc.transform(prune(), flatten(), dedup());

// 2. fusion des primitives compatibles, puis bake des transformations de nœuds dans les maillages
const scene = root.getDefaultScene() || root.listScenes()[0];
await doc.transform(join({ keepNamed: false }));
// après join, appliquer les matrices monde puis remettre les nœuds à l'identité
const seenMesh = new Set();
for (const n of root.listNodes()) {
  const m = n.getMesh();
  if (!m) continue;
  if (seenMesh.has(m)) {
    // mesh partagé : on clone pour pouvoir baker
    const c = m.clone();
    n.setMesh(c);
  }
  seenMesh.add(n.getMesh());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
for (const n of root.listNodes()) if (!n.getMesh()) n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// 3. bornes robustes (percentiles) → recadrage des sommets aberrants
const xs = [], ys = [], zs = [];
for (const m of root.listMeshes())
  for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION');
    const v = [0, 0, 0];
    const step = Math.max(1, Math.floor(a.getCount() / 200000));
    for (let i = 0; i < a.getCount(); i += step) {
      a.getElement(i, v);
      xs.push(v[0]); ys.push(v[1]); zs.push(v[2]);
    }
  }
const pc = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const crop = o.crop ?? 0;
const lo = [pc(xs, crop), pc(ys, crop), pc(zs, crop)];
const hi = [pc(xs, 1 - crop), pc(ys, 1 - crop), pc(zs, 1 - crop)];
const pad = [0, 1, 2].map((k) => (hi[k] - lo[k]) * 0.02);
if (crop > 0) {
  // supprime les triangles dont un sommet sort de la boîte robuste élargie
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      const idx = p.getIndices();
      if (!idx) continue;
      const keep = [];
      const v = [0, 0, 0];
      const okv = new Uint8Array(a.getCount());
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        okv[i] = v.every((c, k) => c >= lo[k] - pad[k] && c <= hi[k] + pad[k]) ? 1 : 0;
      }
      const arr = idx.getArray();
      for (let i = 0; i < arr.length; i += 3) if (okv[arr[i]] && okv[arr[i + 1]] && okv[arr[i + 2]]) keep.push(arr[i], arr[i + 1], arr[i + 2]);
      if (keep.length !== arr.length) idx.setArray(new Uint32Array(keep));
    }
}

// 4. orientation + recentrage + échelle
const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
const rot = fromYRotation([], o.rotY ?? 0);
let M = fromTranslation([], [-cx, -lo[1] + (o.ground ?? 0) * (hi[1] - lo[1]) * -1, -cz]);
M = multiply([], rot, M);
for (const m of root.listMeshes()) transformMesh(m, M);
await doc.transform(prune());
let b = getBounds(scene);
const w = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
const h = b.max[1] - b.min[1];
const k = o.fit === 'height' ? 1 / h : 1 / w;
const S = fromScaling([], [k, k, k]);
for (const m of root.listMeshes()) transformMesh(m, S);

// 4b. pose (statue en T) : on fait pivoter les bras autour des épaules (axe z), avec une zone de transition douce.
// Coordonnées normalisées (après mise à l'échelle) : x latéral, y depuis la base.
if (o.pose) {
  const { sx, sy, right, left, blend = 0.05 } = o.pose;
  const bb = getBounds(scene);
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) {
      const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL');
      const q = [0, 0, 0], nv = [0, 0, 0];
      for (let i = 0; i < pa.getCount(); i++) {
        pa.getElement(i, q);
        const x = q[0], y = q[1] - bb.min[1];
        if (y < sy - 0.2) continue;
        const side = x > 0 ? 1 : -1;
        const w = ss(sx, sx + blend, Math.abs(x));
        if (w <= 0) continue;
        const ang = (side > 0 ? right : left) * w * side;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const ox = side * sx, oy = bb.min[1] + sy;
        const px = q[0] - ox, py = q[1] - oy;
        pa.setElement(i, [px * c - py * sn + ox, px * sn + py * c + oy, q[2]]);
        if (na) { na.getElement(i, nv); na.setElement(i, [nv[0] * c - nv[1] * sn, nv[0] * sn + nv[1] * c, nv[2]]); }
      }
    }
}

// 5. simplification au budget de triangles
const triCount = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
await doc.transform(weld());
const before = triCount();
const target = o.tris ?? 150000;
if (before > target) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: o.err ?? 0.01, lockBorder: false }));
// photogrammétrie (une île de triangles par coupure d'UV) : le simplificateur classique ne peut rien fusionner →
// passe « sloppy » de meshoptimizer, primitive par primitive, au prorata
if (triCount() > target * 1.3) {
  const ratio = target / triCount();
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      if (!idx) continue;
      const pos = p.getAttribute('POSITION');
      const ia = Uint32Array.from(idx.getArray());
      const pa = pos.getArray() instanceof Float32Array ? pos.getArray() : Float32Array.from(pos.getArray());
      const want = Math.max(3, Math.floor((ia.length * ratio) / 3) * 3);
      const [res] = MeshoptSimplifier.simplifySloppy(ia, pa, 3, null, want, 1e-1);
      idx.setArray(res);
    }
  await doc.transform(compactPrimitive ? ((d) => { for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p); }) : ((d) => d));
}
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [o.tex ?? 1024, o.tex ?? 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
b = getBounds(scene);
// point le plus haut (torche, sommet…) : utile pour accrocher un effet au bon endroit
let peak = [0, -1e9, 0];
for (const m of root.listMeshes())
  for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); if (v[1] > peak[1]) peak = [...v]; }
  }
await io.write(out, doc);
console.log(JSON.stringify({ out, trisBefore: before, tris: triCount(), size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => +v.toFixed(3)), min: b.min.map((v) => +v.toFixed(3)), peak: peak.map((v) => +v.toFixed(3)) }));
