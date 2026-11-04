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

async function test() {
  console.log("Testing downloadModel for Obelisk...");
  const uid = '5d80dcef568e4aed98ee158a3c29a6f0';
  const url = `https://sketchfab.com/3d-models/${uid}`;
  
  const result = await downloadModel(url, (msg) => {
    console.log("[PROGRESS]", msg);
  });
  
  console.log("Result received:", result.zipName, result.zip.length, "bytes");
  const outZip = path.join('C:/Users/Tom/Desktop/cardgamepriv/imports', result.zipName);
  fs.writeFileSync(outZip, Buffer.from(result.zip));
  console.log(`Saved ZIP successfully: ${outZip} (${fs.statSync(outZip).size} bytes)`);
}

test().catch(err => {
  console.error("Test failed:", err);
});
