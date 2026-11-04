import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
// le modèle téléchargé a perdu une texture : tête, corps, cornes, crocs… tombaient sur un gris uni → couleurs de la carte
const P = [
  [/body03|face/, [0.62, 0.05, 0.07], 0.45, 0.15, null],
  [/horn|body01/, [0.48, 0.03, 0.05], 0.4, 0.2, null],
  [/tooth|claw/, [0.93, 0.89, 0.8], 0.5, 0, null],
  [/jewelry/, [0.05, 0.75, 0.38], 0.2, 0.3, [0.02, 0.5, 0.25]],
  [/eye_obj/, [1.0, 0.72, 0.08], 0.3, 0, [1.0, 0.55, 0.05]],
  [/tongue|tan0/, [0.72, 0.22, 0.32], 0.6, 0, null],
];
const cache = new Map();
for (const mesh of root.listMeshes()) {
  const name = mesh.getName();
  const rule = P.find(([re]) => re.test(name));
  if (!rule) continue;
  const key = String(rule[0]);
  let m = cache.get(key);
  if (!m) {
    m = doc.createMaterial('slifer_' + key.replace(/\W/g, '')).setBaseColorFactor([...rule[1], 1]).setRoughnessFactor(rule[2]).setMetallicFactor(rule[3]);
    if (rule[4]) m.setEmissiveFactor(rule[4]);
    cache.set(key, m);
  }
  for (const p of mesh.listPrimitives()) p.setMaterial(m);
  console.log(name, '→', key);
}
await io.write(process.argv[3], doc);
