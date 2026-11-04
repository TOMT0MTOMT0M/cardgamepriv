import fs from 'fs';
import path from 'path';

const MODELS_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models';
const SFX_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/sfx';

const files = fs.readdirSync(MODELS_DIR);
console.log('--- MODELS CHECK ---');
for (const f of files) {
  const p = path.join(MODELS_DIR, f);
  const buf = fs.readFileSync(p);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const isGLB = magic === 0x46546C67; // 'glTF'
  console.log(`${f}: ${buf.length} bytes | GLB valid: ${isGLB} (v${version})`);
}

console.log('\n--- SFX CHECK ---');
const sfxFiles = fs.readdirSync(SFX_DIR);
for (const f of sfxFiles) {
  const p = path.join(SFX_DIR, f);
  const sz = fs.statSync(p).size;
  console.log(`${f}: ${sz} bytes`);
}
