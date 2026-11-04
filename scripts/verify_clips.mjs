import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

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

const MODELS_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models';
const files = [
  'blue-eyes-white-dragon.glb',
  'dark-magician.glb',
  'dark-magician-girl.glb',
  'exodia-the-forbidden-one.glb',
  'obelisk-the-tormentor.glb',
  'red-eyes-black-dragon.glb',
  'seto-kaiba.glb',
  'slifer-the-sky-dragon.glb',
  'yami-yugi.glb'
];

async function verify() {
  console.log('=== VERIFYING ANIMATION CLIPS ON ALL 9 TARGET MODELS ===\n');
  const loader = new GLTFLoader();
  
  for (const f of files) {
    const p = path.join(MODELS_DIR, f);
    const buffer = fs.readFileSync(p);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    const gltf = await new Promise((res, rej) => loader.parse(arrayBuffer, '', res, rej));
    const clipNames = (gltf.animations || []).map(a => a.name);
    const hasSummon = clipNames.includes('summon');
    const hasIdle = clipNames.includes('idle');
    console.log(`${f}: [${clipNames.join(', ')}] -> Summon: ${hasSummon}, Idle: ${hasIdle}`);
  }
}

verify().catch(console.error);
