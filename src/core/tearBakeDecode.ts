import { TEAR_BAKE_FORMAT, type TearBakeHeader } from './tearBakeFormat';

/**
 * Téléchargement et décodage d'une déchirure cuite (fichier .tear) — module SANS three.js, partagé par le fil
 * principal (src/core/tearBake.ts) et son worker (tearBake.worker.ts).
 */
export interface TearBakeData {
  header: TearBakeHeader;
  rest: Float32Array;
  /** images : (position − repos) / q, absolues, [image][sommet × 3] */
  frames: Int16Array;
}

export async function fetchAndDecode(url: string): Promise<TearBakeData | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return null;
    let buf = new Uint8Array(await res.arrayBuffer());
    // gzip (1f 8b) — sauf si le serveur l'a déjà décompressé (Content-Encoding)
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') return null;
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    return decodeTearBake(buf);
  } catch {
    return null;
  }
}

export function decodeTearBake(buf: Uint8Array): TearBakeData | null {
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'TEAR') return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))) as TearBakeHeader;
  if (header.format !== TEAR_BAKE_FORMAT) return null;
  let o = 8 + hl;
  o += (4 - (o % 4)) % 4;
  const n = header.verts;
  // copie alignée (le tampon décompressé peut ne pas l'être)
  const rest = new Float32Array(buf.slice(o, o + n * 12).buffer);
  o += n * 12;
  const F = header.nTear + header.nExit;
  const deltas = new Int16Array(buf.slice(o, o + F * n * 6).buffer);
  // écarts → valeurs absolues, et plans x / y / z → entrelacés
  const frames = new Int16Array(F * n * 3);
  const acc = new Int32Array(n * 3);
  for (let f = 0; f < F; f++) {
    const src = f * n * 3;
    for (let a = 0; a < 3; a++)
      for (let v = 0; v < n; v++) {
        const k = v * 3 + a;
        acc[k] += deltas[src + a * n + v];
        frames[src + k] = acc[k];
      }
  }
  return { header, rest, frames };
}
