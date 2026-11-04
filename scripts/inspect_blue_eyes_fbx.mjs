import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

// Polyfill document for Three.js ImageLoader in Node
globalThis.document = {
  createElementNS: (ns, tag) => {
    return {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      style: {},
      setAttribute: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  },
  createElement: (tag) => {
    return {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      style: {},
      setAttribute: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }
};

const fbxPath = 'C:/Users/Tom/Desktop/cardgamepriv/imports/Raw Files/Blue Eyes White Dragon.fbx';
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
try {
  // Pass empty string for texture path so FBXLoader doesn't attempt network loads
  const obj = loader.parse(arrayBuffer, '');
  console.log('FBX Parsed successfully!');
  console.log('Object name:', obj.name);

  let meshes = [];
  obj.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
      console.log(`Mesh: "${child.name}", vertices: ${child.geometry.attributes.position?.count}, material: ${child.material?.name || child.material?.type}`);
    }
  });
  console.log(`Total meshes: ${meshes.length}`);
} catch (e) {
  console.error('FBX parse error:', e);
}
