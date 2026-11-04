import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.document = {
  createElementNS: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
  createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} })
};

const dirs = [
  'Cross Duel Models/dark magician/04041_01J.fbx',
  'Cross Duel Models/dark magician girl/04766_01J.fbx',
  'Cross Duel Models/exodia/04027_01J.fbx',
  'Cross Duel Models/red eyes/04088_01J.fbx'
];

for (const rel of dirs) {
  const p = path.join('C:/Users/Tom/Desktop/cardgamepriv/imports', rel);
  if (!fs.existsSync(p)) {
    console.log("Not found:", p);
    continue;
  }
  const buffer = fs.readFileSync(p);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loader = new FBXLoader();
  const obj = loader.parse(ab, path.dirname(p) + '/');
  
  let meshCount = 0;
  let vertCount = 0;
  obj.traverse(c => {
    if (c.isMesh) {
      meshCount++;
      vertCount += c.geometry.attributes.position.count;
    }
  });
  console.log(`[${path.basename(path.dirname(p))}] Meshes: ${meshCount}, Vertices: ${vertCount}, Animations: ${obj.animations ? obj.animations.length : 0}`);
}
