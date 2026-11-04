import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

globalThis.document = {
  createElementNS: (ns, tag) => ({
    tagName: tag.toUpperCase(),
    nodeType: 1,
    style: {},
    setAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  }),
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    nodeType: 1,
    style: {},
    setAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  })
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

const fbxPath = 'C:/Users/Tom/Desktop/cardgamepriv/imports/Raw Files/Blue Eyes Ultimate Dragon.fbx';
const targetGlb = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models/blue-eyes-ultimate-dragon.glb';

console.log('Loading faithful FBX:', fbxPath);
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const obj = loader.parse(arrayBuffer, '');

console.log('FBX parsed! Processing meshes & materials...');

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0xdde9f8,
  roughness: 0.35,
  metalness: 0.3,
});
const headMat = new THREE.MeshStandardMaterial({
  color: 0xdde9f8,
  roughness: 0.35,
  metalness: 0.3,
});
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0x00f0ff,
  emissive: 0x00b4d8,
  emissiveIntensity: 1.0,
  roughness: 0.1
});

obj.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.name.includes('eye')) {
      child.material = eyeMat;
    } else if (child.name.includes('head')) {
      child.material = headMat;
    } else {
      child.material = bodyMat;
    }
  }
});

const box = new THREE.Box3().setFromObject(obj);
const size = new THREE.Vector3();
box.getSize(size);

const maxDim = Math.max(size.x, size.y, size.z);
const scale = 2.4 / maxDim;
obj.scale.set(scale, scale, scale);

const scaledBox = new THREE.Box3().setFromObject(obj);
obj.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
obj.position.y -= scaledBox.min.y;
obj.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;

const root = new THREE.Group();
root.name = 'BlueEyesUltimateRoot';
root.add(obj);

const summonScale = new THREE.VectorKeyframeTrack(
  'BlueEyesUltimateRoot.scale',
  [0, 0.7, 1.4, 2.0],
  [0.01, 0.01, 0.01, 0.85, 0.85, 0.85, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
);
const summonRot = new THREE.QuaternionKeyframeTrack(
  'BlueEyesUltimateRoot.quaternion',
  [0, 0.7, 1.4, 2.0],
  [
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.4, 0)).toArray(),
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.2, 0)).toArray(),
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0)).toArray(),
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
  ]
);
const summonClip = new THREE.AnimationClip('summon', 2.0, [summonScale, summonRot]);

const idlePos = new THREE.VectorKeyframeTrack(
  'BlueEyesUltimateRoot.position',
  [0, 1.2, 2.4],
  [0, 0, 0, 0, 0.16, 0, 0, 0, 0]
);
const idleRot = new THREE.QuaternionKeyframeTrack(
  'BlueEyesUltimateRoot.quaternion',
  [0, 1.2, 2.4],
  [
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.08, 0.04)).toArray(),
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.08, -0.04)).toArray(),
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.08, 0.04)).toArray()
  ]
);
const idleClip = new THREE.AnimationClip('idle', 2.4, [idlePos, idleRot]);

const exporter = new GLTFExporter();
console.log('Exporting to GLB binary...');
const gltf = await exporter.parseAsync(root, {
  binary: true,
  animations: [summonClip, idleClip]
});

fs.writeFileSync(targetGlb, Buffer.from(gltf));
console.log(`SUCCESS! Created faithful ${targetGlb} (${fs.statSync(targetGlb).size} bytes)`);
