import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Node.js FileReader polyfill
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

const IMPORTS_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/imports';
const TARGET_MODELS_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models';

fs.mkdirSync(IMPORTS_DIR, { recursive: true });
fs.mkdirSync(TARGET_MODELS_DIR, { recursive: true });

// Mapping table for fuzzy matching
const CARD_MAP = {
  'blue-eyes': 'blue-eyes-white-dragon',
  'blueeyes': 'blue-eyes-white-dragon',
  'dark-magician-girl': 'dark-magician-girl',
  'bmg': 'dark-magician-girl',
  'dark-magician': 'dark-magician',
  'darkmagician': 'dark-magician',
  'exodia': 'exodia-the-forbidden-one',
  'obelisk': 'obelisk-the-tormentor',
  'red-eyes': 'red-eyes-black-dragon',
  'redeyes': 'red-eyes-black-dragon',
  'slifer': 'slifer-the-sky-dragon',
  'osiris': 'slifer-the-sky-dragon'
};

function resolveTargetName(filename) {
  const lower = path.basename(filename, path.extname(filename)).toLowerCase();
  for (const [key, val] of Object.entries(CARD_MAP)) {
    if (lower.includes(key)) return val;
  }
  return lower;
}

async function convertFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const targetCardId = resolveTargetName(filePath);
  const outPath = path.join(TARGET_MODELS_DIR, `${targetCardId}.glb`);

  console.log(`\n========================================`);
  console.log(`Processing: ${path.basename(filePath)} -> ${targetCardId}.glb`);
  console.log(`========================================`);

  let loadedObject = null;
  let animations = [];

  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  if (ext === '.fbx') {
    const loader = new FBXLoader();
    loadedObject = loader.parse(arrayBuffer, path.dirname(filePath) + '/');
    if (loadedObject.animations && loadedObject.animations.length > 0) {
      animations = loadedObject.animations;
    }
  } else if (ext === '.obj') {
    const loader = new OBJLoader();
    loadedObject = loader.parse(buffer.toString('utf-8'));
  } else if (ext === '.glb' || ext === '.gltf') {
    const loader = new GLTFLoader();
    const gltf = await new Promise((res, rej) => loader.parse(arrayBuffer, '', res, rej));
    loadedObject = gltf.scene;
    animations = gltf.animations || [];
  } else {
    console.log(`Unsupported format: ${ext}`);
    return;
  }

  if (!loadedObject) {
    console.error('Failed to parse 3D object.');
    return;
  }

  // Normalize scale and center
  const box = new THREE.Box3().setFromObject(loadedObject);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  // Desired model height in TCG arena: ~2.0 units
  if (maxDim > 0.001) {
    const scaleFactor = 2.0 / maxDim;
    loadedObject.scale.multiplyScalar(scaleFactor);
  }

  // Re-center on floor (y = 0)
  const centerBox = new THREE.Box3().setFromObject(loadedObject);
  loadedObject.position.x -= (centerBox.min.x + centerBox.max.x) / 2;
  loadedObject.position.y -= centerBox.min.y;
  loadedObject.position.z -= (centerBox.min.z + centerBox.max.z) / 2;

  // Ensure summon & idle animation clips exist
  let summonClip = animations.find(a => a.name.toLowerCase().includes('summon') || a.name.toLowerCase().includes('spawn'));
  let idleClip = animations.find(a => a.name.toLowerCase().includes('idle') || a.name.toLowerCase().includes('wait'));

  // If clips don't have exact names or don't exist, bind or generate clean clips
  if (!summonClip) {
    if (animations.length > 0) {
      summonClip = animations[0].clone();
      summonClip.name = 'summon';
    } else {
      const scaleTrack = new THREE.VectorKeyframeTrack(
        '.scale',
        [0, 0.8, 1.4, 2.0],
        [
          0.01 * loadedObject.scale.x, 0.01 * loadedObject.scale.y, 0.01 * loadedObject.scale.z,
          0.8 * loadedObject.scale.x, 0.8 * loadedObject.scale.y, 0.8 * loadedObject.scale.z,
          1.15 * loadedObject.scale.x, 1.15 * loadedObject.scale.y, 1.15 * loadedObject.scale.z,
          loadedObject.scale.x, loadedObject.scale.y, loadedObject.scale.z
        ]
      );
      summonClip = new THREE.AnimationClip('summon', 2.0, [scaleTrack]);
    }
  } else {
    summonClip.name = 'summon';
  }

  if (!idleClip) {
    if (animations.length > 1) {
      idleClip = animations[1].clone();
      idleClip.name = 'idle';
    } else {
      const idleTrack = new THREE.VectorKeyframeTrack(
        '.position',
        [0, 1.2, 2.4],
        [
          loadedObject.position.x, loadedObject.position.y, loadedObject.position.z,
          loadedObject.position.x, loadedObject.position.y + 0.15, loadedObject.position.z,
          loadedObject.position.x, loadedObject.position.y, loadedObject.position.z
        ]
      );
      idleClip = new THREE.AnimationClip('idle', 2.4, [idleTrack]);
    }
  } else {
    idleClip.name = 'idle';
  }

  const clipsToExport = [summonClip, idleClip];

  // Export to GLB
  const exporter = new GLTFExporter();
  const root = new THREE.Group();
  root.add(loadedObject);

  const gltfBin = await exporter.parseAsync(root, {
    binary: true,
    animations: clipsToExport
  });

  fs.writeFileSync(outPath, Buffer.from(gltfBin));
  console.log(`SUCCESS: Created ${outPath} (${fs.statSync(outPath).size} bytes) with clips: [${clipsToExport.map(c => c.name).join(', ')}]`);
}

async function main() {
  const files = fs.readdirSync(IMPORTS_DIR);
  const modelFiles = files.filter(f => ['.fbx', '.obj', '.glb', '.gltf'].includes(path.extname(f).toLowerCase()));

  if (modelFiles.length === 0) {
    console.log(`No models found in ${IMPORTS_DIR}`);
    console.log(`Place your downloaded faithful .fbx or .glb files here and re-run this script!`);
    return;
  }

  for (const f of modelFiles) {
    await convertFile(path.join(IMPORTS_DIR, f));
  }
}

main().catch(err => {
  console.error('Import error:', err);
});
