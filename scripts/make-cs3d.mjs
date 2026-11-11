/**
 * Skins CS 6★ en 3D (11/11) — 2e étape, après `python scripts/make-cs3d.py` (textures recomposées) :
 *  - maillages : public/models/cs/<modèle>.glb (maillage legacy de CS2, sans squelette ni texture, centré, plus grande
 *    dimension = 1, quantifié + meshopt) ;
 *  - textures : public/art/cs3d/<carte>-c.webp (couleur) et -m.webp (G rugosité, B métal), + -n.webp (normale) pour les
 *    gants → R2 avec le reste de art/ ;
 *  - src/core/sets/cs3d.ts (GÉNÉRÉ) : carte → modèle.
 * Dépendances hors du projet (outil hors ligne) : `npm i @gltf-transform/core @gltf-transform/extensions
 * @gltf-transform/functions meshoptimizer sharp` dans .claude-tmp/cs3d/ (ou CS3D_DEPS=<dossier node_modules>).
 *   node scripts/make-cs3d.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DEPS = process.env.CS3D_DEPS || path.join(ROOT, '.claude-tmp', 'cs3d', 'node_modules');
const req = createRequire(path.join(DEPS, 'x.js'));
const imp = (n) => import(pathToFileURL(req.resolve(n)).href);
const { NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp('@gltf-transform/extensions');
const { prune, dedup, weld, quantize, reorder, compactPrimitive } = await imp('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;

const EXP = process.env.CS3D_EXP || path.join(ROOT, 'imports', 'cs2', 'export');
const BAKE = process.env.CS3D_BAKE || path.join(ROOT, '.claude-tmp', 'cs3d', 'bake');
const OUT_M = path.join(ROOT, 'public', 'models', 'cs');
const OUT_T = path.join(ROOT, 'public', 'art', 'cs3d');
fs.mkdirSync(OUT_M, { recursive: true });
fs.mkdirSync(OUT_T, { recursive: true });

const SRC = {
  butterfly: 'weapons_models_knife_knife_butterfly/weapons/models/knife/knife_butterfly/weapon_knife_butterfly.glb',
  karambit: 'weapons_models_knife_knife_karambit/weapons/models/knife/knife_karambit/weapon_knife_karambit.glb',
  m9: 'weapons_models_knife_knife_m9/weapons/models/knife/knife_m9/weapon_knife_m9.glb',
  talon: 'weapons_models_knife_knife_talon/weapons/models/knife/knife_talon/weapon_knife_talon.glb',
  awp: 'weapons_models_awp/weapons/models/awp/weapon_snip_awp.glb',
  m4a4: 'weapons_models_m4a4/weapons/models/m4a4/weapon_rif_m4a4.glb',
  specialist: 'agents_models_shared_arms_glove_s/agents/models/shared/arms/glove_specialist/glove_specialist.glb',
  sporty: 'agents_models_shared_arms_glove_s/agents/models/shared/arms/glove_sporty/glove_sporty.glb',
};
/**
 * GANTS (11/11) : la PAIRE du maillage « viewmodel » (le plus fin), sans le bras. Dans le fichier, les deux gants pendent
 * doigts vers le bas (−y), au bout de bras écartés, et partagent un seul tableau de sommets : chacun est d'abord séparé
 * (compactPrimitive), ramené sur son propre centre puis tourné d'un quart de tour (y) — le dos du gant droit face à
 * l'œil, le gauche derrière, paume vers l'œil, décalé comme sur les aperçus Steam. UV du gant droit : u ∈ [−1, 0]
 * (texture en miroir) → +1.
 */
const GLOVE_PAIR = { right: [0, 0, 0], left: [0.055, 0.035, -0.06] };

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const cards = JSON.parse(fs.readFileSync(path.join(BAKE, 'cartes.json'), 'utf8'));
const used = new Set(cards.map((c) => c.model));
const info = {};
for (const key of used) {
  // GLB de Source 2 Viewer : textures en fichiers à côté (non utilisées ici) → on les retire avant lecture
  const glb = fs.readFileSync(path.join(EXP, SRC[key]));
  const jl = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8'));
  const bin = glb.subarray(20 + jl + 8, 20 + jl + 8 + glb.readUInt32LE(20 + jl));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete m[k];
    if (m.pbrMetallicRoughness) for (const k of ['baseColorTexture', 'metallicRoughnessTexture']) delete m.pbrMetallicRoughness[k];
    delete m.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => !/texture/i.test(e));
  const doc = await io.readJSON({ json, resources: { '@glb.bin': new Uint8Array(bin) } });
  const root = doc.getRoot();
  // seul le maillage legacy (les peintures sont calées sur ses UV) ; pas de squelette, pas de texture
  const glove = key === 'specialist' || key === 'sporty';
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh && !mesh.getName().endsWith(glove ? 'viewmodel' : 'body_legacy')) node.dispose();
    node.setSkin(null);
  }
  if (glove)
    for (const m of root.listMeshes())
      for (const p of m.listPrimitives()) {
        const side = /_right$/.test(p.getMaterial()?.getName() ?? '') ? 'right' : /_left$/.test(p.getMaterial()?.getName() ?? '') ? 'left' : null;
        if (!side) {
          m.removePrimitive(p);
          continue;
        }
        // quelques triangles du gant gauche (Specialist) pointent vers des sommets du gant droit : écartés (> 0,2 du
        // centre du gant, qui mesure 0,24 de haut)
        {
          const ia = p.getIndices(), P0 = p.getAttribute('POSITION'), e = [];
          const idx = Array.from(ia.getArray());
          const med = [0, 1, 2].map((j) => idx.map((i) => P0.getElement(i, e)[j]).sort((a, b) => a - b)[idx.length >> 1]);
          const near = (i) => Math.hypot(...P0.getElement(i, e).map((v, j) => v - med[j])) < 0.2;
          const keep = [];
          for (let t = 0; t < idx.length; t += 3) if (near(idx[t]) && near(idx[t + 1]) && near(idx[t + 2])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
          if (keep.length < idx.length) console.log(key, side, 'triangles écartés :', (idx.length - keep.length) / 3);
          ia.setArray(new Uint32Array(keep));
        }
        compactPrimitive(p);
        const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), uv = p.getAttribute('TEXCOORD_0');
        const c = [0, 0, 0], el = [];
        for (let i = 0; i < pos.getCount(); i++) pos.getElement(i, el).forEach((v, j) => (c[j] += v / pos.getCount()));
        const o = GLOVE_PAIR[side];
        // quart de tour autour de y : (x, y, z) → (z, y, −x)
        for (let i = 0; i < pos.getCount(); i++) {
          const [x, y, z] = pos.getElement(i, el).map((v, j) => v - c[j]);
          pos.setElement(i, [z + o[0], y + o[1], -x + o[2]]);
        }
        for (let i = 0; i < nor.getCount(); i++) {
          const [x, y, z] = nor.getElement(i, el);
          nor.setElement(i, [z, y, -x]);
        }
        if (side === 'right') for (let i = 0; i < uv.getCount(); i++) uv.setElement(i, uv.getElement(i, el).map((v, j) => (j === 0 ? v + 1 : v)));
      }
  for (const s of root.listSkins()) s.dispose();
  for (const a of root.listAnimations()) a.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const sem of ['JOINTS_0', 'WEIGHTS_0', 'TANGENT', 'COLOR_0', 'TEXCOORD_1']) p.setAttribute(sem, null);
  for (const mat of root.listMaterials()) {
    mat.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
    mat.setExtras({});
  }
  await doc.transform(prune({ keepAttributes: true })); // (sinon prune retire les UV : plus aucune texture ne s'en sert)
  // centré, plus grande dimension = 1 (les sommets eux-mêmes : la scène n'a plus qu'un nœud)
  // bornes des SOMMETS (repère du maillage) : les nœuds de l'export ont leur propre transformation, remise à zéro ici
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const el = [];
      for (let i = 0; i < pos.getCount(); i++) pos.getElement(i, el).forEach((v, j) => ((b.min[j] = Math.min(b.min[j], v)), (b.max[j] = Math.max(b.max[j], v))));
    }
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  const s = 1 / Math.max(...b.max.map((v, i) => v - b.min[i]));
  for (const n of root.listNodes()) n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  // (une seule fois par tableau de sommets : l'AWP partage le sien entre deux primitives, corps et lunette)
  const seen = new Set();
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      if (seen.has(pos)) continue;
      seen.add(pos);
      const el = [];
      for (let i = 0; i < pos.getCount(); i++) pos.setElement(i, pos.getElement(i, el).map((v, j) => (v - c[j]) * s));
    }
  // UV non quantifiées : la quantification ajoute un KHR_texture_transform au matériau, que csPortal remplace
  await doc.transform(dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(POSITION|NORMAL)$/ }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const file = path.join(OUT_M, `${key}.glb`);
  await io.write(file, doc);
  const tris = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((x, p) => x + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  info[key] = { size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => +(v * s).toFixed(3)), tris, ko: Math.round(fs.statSync(file).size / 1024) };
  console.log(key, info[key]);
}

let ko = 0;
let n = 0;
for (const c of cards) {
  // (une carte sans texture cuite ici garde ses .webp déjà sur R2 : `python scripts/make-cs3d.py --only <modèle>`)
  if (!fs.existsSync(path.join(BAKE, `${c.card}-color.png`))) continue;
  n++;
  await sharp(path.join(BAKE, `${c.card}-color.png`)).webp({ quality: 88 }).toFile(path.join(OUT_T, `${c.card}-c.webp`));
  await sharp(path.join(BAKE, `${c.card}-orm.png`)).webp({ quality: 90 }).toFile(path.join(OUT_T, `${c.card}-m.webp`));
  ko += (fs.statSync(path.join(OUT_T, `${c.card}-c.webp`)).size + fs.statSync(path.join(OUT_T, `${c.card}-m.webp`)).size) / 1024;
  // gants : la normale du modèle (coutures, rembourrages), 3e texture
  if (fs.existsSync(path.join(BAKE, `${c.card}-normal.png`))) {
    await sharp(path.join(BAKE, `${c.card}-normal.png`)).webp({ quality: 92 }).toFile(path.join(OUT_T, `${c.card}-n.webp`));
    ko += fs.statSync(path.join(OUT_T, `${c.card}-n.webp`)).size / 1024;
  }
}
console.log(n, '/', cards.length, 'cartes converties, textures', Math.round(ko), 'Ko');

const lines = cards.map((c) => `  '${c.card}': '${c.model}', // ${c.name}${c.kit ? ` · ${c.kit}` : ''}${c.seed != null ? ` #${c.seed}` : ''}`);
fs.writeFileSync(
  path.join(ROOT, 'src', 'core', 'sets', 'cs3d.ts'),
  `/**
 * GÉNÉRÉ par scripts/make-cs3d.py + scripts/make-cs3d.mjs — ne pas éditer à la main.
 * Skins CS 6★ en 3D : carte → modèle (public/models/cs/<modèle>.glb) ; textures public/art/cs3d/<carte>-c.webp / -m.webp
 * (+ -n.webp, la normale, pour les gants).
 */
export type Cs3dModel = ${[...used].map((k) => `'${k}'`).join(' | ')};

export const CS3D: Record<string, Cs3dModel> = {
${lines.join('\n')}
};

/** modèles qui ont une 3e texture (normale) : public/art/cs3d/<carte>-n.webp */
export const CS3D_NORMAL: ReadonlySet<Cs3dModel> = new Set([${[...used].filter((k) => k === 'specialist' || k === 'sporty').map((k) => `'${k}'`).join(', ')}]);

/** dimensions (plus grande = 1) et triangles de chaque modèle */
export const CS3D_MODELS: Record<Cs3dModel, { size: [number, number, number]; tris: number }> = ${JSON.stringify(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, { size: v.size, tris: v.tris }])))};
`,
);
