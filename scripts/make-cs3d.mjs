/**
 * Skins CS 6★ en 3D (11/11) — 2e étape, après `python scripts/make-cs3d.py` (textures recomposées) :
 *  - maillages : public/models/cs/<modèle>.glb (maillage legacy de CS2, sans squelette ni texture, centré, plus grande
 *    dimension = 1, quantifié + meshopt) ;
 *  - textures : public/art/cs3d/<carte>-c.webp (couleur) et -m.webp (G rugosité, B métal) → R2 avec le reste de art/ ;
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
const { prune, dedup, weld, quantize, reorder } = await imp('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;

const EXP = path.join(ROOT, 'imports', 'cs2', 'export');
const BAKE = path.join(ROOT, '.claude-tmp', 'cs3d', 'bake');
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
};

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
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh && !mesh.getName().endsWith('body_legacy')) node.dispose();
    node.setSkin(null);
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
for (const c of cards) {
  await sharp(path.join(BAKE, `${c.card}-color.png`)).webp({ quality: 88 }).toFile(path.join(OUT_T, `${c.card}-c.webp`));
  await sharp(path.join(BAKE, `${c.card}-orm.png`)).webp({ quality: 90 }).toFile(path.join(OUT_T, `${c.card}-m.webp`));
  ko += (fs.statSync(path.join(OUT_T, `${c.card}-c.webp`)).size + fs.statSync(path.join(OUT_T, `${c.card}-m.webp`)).size) / 1024;
}
console.log(cards.length, 'cartes, textures', Math.round(ko), 'Ko');

const lines = cards.map((c) => `  '${c.card}': '${c.model}', // ${c.name}${c.kit ? ` · ${c.kit}` : ''}${c.seed != null ? ` #${c.seed}` : ''}`);
fs.writeFileSync(
  path.join(ROOT, 'src', 'core', 'sets', 'cs3d.ts'),
  `/**
 * GÉNÉRÉ par scripts/make-cs3d.py + scripts/make-cs3d.mjs — ne pas éditer à la main.
 * Skins CS 6★ en 3D : carte → modèle (public/models/cs/<modèle>.glb) ; textures public/art/cs3d/<carte>-c.webp / -m.webp.
 */
export type Cs3dModel = ${[...used].map((k) => `'${k}'`).join(' | ')};

export const CS3D: Record<string, Cs3dModel> = {
${lines.join('\n')}
};

/** dimensions (plus grande = 1) et triangles de chaque modèle */
export const CS3D_MODELS: Record<Cs3dModel, { size: [number, number, number]; tris: number }> = ${JSON.stringify(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, { size: v.size, tris: v.tris }])))};
`,
);
