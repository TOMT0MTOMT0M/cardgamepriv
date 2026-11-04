import fs from 'fs';
import path from 'path';

// Polyfill chrome
globalThis.chrome = {
  runtime: {
    getURL: (p) => p
  },
  storage: {
    local: {
      get: async () => ({
        sf_prefs: {
          textures: true,
          packMode: "glb",
          maxTextureEdge: 2048
        }
      })
    }
  }
};

// Polyfill fetch for wasm
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.includes('decrypt.wasm')) {
    const wasmBuf = fs.readFileSync('C:/Users/Tom/Desktop/cardgamepriv/imports/sketchfab-ext/lib/wasm/decrypt.wasm');
    return new Response(wasmBuf, { status: 200, headers: { 'Content-Type': 'application/wasm' } });
  }
  return origFetch(url, opts);
};

const { downloadModel } = await import('../imports/sketchfab-ext/lib/pipeline.js');

const modelsToDownload = [
  { name: 'slifer', uid: '938ad22de6ae4794b6b403c51e1bf96c' },
  { name: 'kaiba', uid: '4fbd14305a1e4efaa6cf73453b87df44' },
  { name: 'yugi', uid: 'a8c6e6061df74d7988491100f120e4f6' }
];

async function run() {
  for (const m of modelsToDownload) {
    console.log(`\n========================================`);
    console.log(`Starting download for ${m.name} (${m.uid})...`);
    console.log(`========================================`);
    try {
      const url = `https://sketchfab.com/3d-models/${m.uid}`;
      const result = await downloadModel(url, (msg) => {
        if (!msg.startsWith('Reading key')) console.log(`[${m.name}]`, msg);
      });
      const outZip = path.join('C:/Users/Tom/Desktop/cardgamepriv/imports', `${m.name}.zip`);
      fs.writeFileSync(outZip, Buffer.from(result.zip));
      console.log(`SUCCESS: Saved ${outZip} (${fs.statSync(outZip).size} bytes)`);
    } catch (err) {
      console.error(`FAILED ${m.name}:`, err);
    }
  }
}

run();
