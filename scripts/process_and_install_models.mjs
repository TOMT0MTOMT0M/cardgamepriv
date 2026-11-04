import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Node.js polyfill
globalThis.document = {
  createElementNS: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
  createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} })
};

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

const TARGET_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models';

const modelsToProcess = [
  {
    src: 'C:/Users/Tom/Desktop/cardgamepriv/imports/extracted/Obelisk_The_Tormentor.glb',
    target: 'obelisk-the-tormentor.glb',
    name: 'obelisk-the-tormentor',
    scaleHeight: 2.5
  },
  {
    src: 'C:/Users/Tom/Desktop/cardgamepriv/imports/extracted/Slifer_The_Sky_Dragon_Duel_Links_Model.glb',
    target: 'slifer-the-sky-dragon.glb',
    name: 'slifer-the-sky-dragon',
    scaleHeight: 2.5
  },
  {
    src: 'C:/Users/Tom/Desktop/cardgamepriv/imports/extracted/Seto_Kaiba.glb',
    target: 'seto-kaiba.glb',
    name: 'seto-kaiba',
    scaleHeight: 1.85
  },
  {
    src: 'C:/Users/Tom/Desktop/cardgamepriv/imports/extracted/Yugi_Muto.glb',
    target: 'yami-yugi.glb',
    name: 'yami-yugi',
    scaleHeight: 1.7
  }
];

async function processModel({ src, target, name, scaleHeight }) {
  console.log(`\n========================================`);
  console.log(`Processing: ${path.basename(src)} -> ${target}`);
  console.log(`========================================`);

  const buffer = fs.readFileSync(src);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const scene = gltf.scene;
  let animations = gltf.animations || [];

  // Enable shadow casting & receiving on all meshes
  let meshCount = 0;
  let vertCount = 0;
  scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      meshCount++;
      if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
        vertCount += child.geometry.attributes.position.count;
      }
    }
  });

  console.log(`Model parsed: ${meshCount} meshes, ${vertCount} vertices.`);

  // Normalize scale
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  console.log(`Original bounding size: ${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`);

  const scale = scaleHeight / maxDim;
  scene.scale.set(scale, scale, scale);

  // Center on floor (y = 0)
  const scaledBox = new THREE.Box3().setFromObject(scene);
  scene.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
  scene.position.y -= scaledBox.min.y;
  scene.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;

  const root = new THREE.Group();
  root.name = `${name}Root`;
  root.add(scene);

  // Build clean summon & idle animation clips
  const summonScale = new THREE.VectorKeyframeTrack(
    `${name}Root.scale`,
    [0, 0.7, 1.4, 2.0],
    [0.01, 0.01, 0.01, 0.85, 0.85, 0.85, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
  );
  const summonRot = new THREE.QuaternionKeyframeTrack(
    `${name}Root.quaternion`,
    [0, 0.7, 1.4, 2.0],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.1, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const summonClip = new THREE.AnimationClip('summon', 2.0, [summonScale, summonRot]);

  const idlePos = new THREE.VectorKeyframeTrack(
    `${name}Root.position`,
    [0, 1.2, 2.4],
    [0, 0, 0, 0, 0.12, 0, 0, 0, 0]
  );
  const idleRot = new THREE.QuaternionKeyframeTrack(
    `${name}Root.quaternion`,
    [0, 1.2, 2.4],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.05, 0.02)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.05, -0.02)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.05, 0.02)).toArray()
    ]
  );
  const idleClip = new THREE.AnimationClip('idle', 2.4, [idlePos, idleRot]);

  const clipsToExport = [summonClip, idleClip];

  // Export to GLB
  const exporter = new GLTFExporter();
  const gltfBin = await exporter.parseAsync(root, {
    binary: true,
    animations: clipsToExport
  });

  const outPath = path.join(TARGET_DIR, target);
  fs.writeFileSync(outPath, Buffer.from(gltfBin));
  console.log(`SUCCESS: Wrote ${outPath} (${fs.statSync(outPath).size} bytes) with clips: [${clipsToExport.map(c => c.name).join(', ')}]`);
}

async function main() {
  for (const m of modelsToProcess) {
    await processModel(m);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
});
