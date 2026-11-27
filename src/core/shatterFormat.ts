/**
 * (27/11, V3) Format des ÉCLATS cuits (`public/bake/glace-N.shat`, écrits par scripts/bake-tear/glace.mts, lus par
 * core/shatterBake.ts) : la Déchirure glacée — un bloc de glace et le sachet gelé, fracturés d'avance (mêmes lignes de
 * casse), chaque éclat est un solide dont on enregistre la position et l'orientation image par image. Pur : aucun DOM,
 * aucun three.js.
 *
 * Fichier (gzip) : « SHAT » · u32 longueur de l'en-tête · en-tête JSON · bourrage à 4 octets · puis, à la suite :
 *  - positions de repos de chaque sommet, RELATIVES au centre de son éclat (float32 × 3 × verts) ;
 *  - normales de repos (float32 × 3 × verts) ; uv (float32 × 2 × verts : face du sachet, coordonnées du visuel) ;
 *  - niveau de fissure de chaque sommet (float32 × verts : 0 = surface extérieure de la glace ou film, 1 / 2 / 3 =
 *    face de cassure révélée au 1er / 2e / 3e toucher) ;
 *  - indices des triangles (uint32 × 3 × tris), triangles de la glace d'abord ;
 *  - images : pour chaque image, chaque éclat : position (x, y, z) puis quaternion (x, y, z, w) — float32 × 7.
 * Image 0 = repos (le 3e toucher), puis `fps` images par seconde. Sommets triés par éclat (`ranges`).
 */
export const SHATTER_FORMAT = 1;

export interface ShatterHeader {
  format: number;
  seed: number;
  index: number;
  /** point d'impact (unités du sachet) : le jeu joue la variante la plus proche du 1er toucher */
  impact: [number, number, number];
  fps: number;
  nFrames: number;
  nShards: number;
  verts: number;
  tris: number;
  /** sommets [0, iceV) et triangles [0, iceT) : la glace ; le reste : le film (face avant puis dos) */
  iceV: number;
  iceT: number;
  /** triangles du film : face avant [iceT, filmBackT), dos [filmBackT, tris) */
  filmBackT: number;
  /** par éclat : premier sommet, nombre de sommets, nature (0 glace, 1 film avant, 2 film dos) */
  ranges: number[];
  /** taille du bloc de glace (demi-largeur, demi-hauteur, demi-épaisseur) */
  block: [number, number, number];
}

export interface ShatterBake {
  header: ShatterHeader;
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  lvl: Float32Array;
  idx: Uint32Array;
  /** [image][éclat] × 7 : px, py, pz, qx, qy, qz, qw */
  frames: Float32Array;
}

/** Décode un fichier décompressé (null si ce n'est pas un enregistrement de ce format). */
export function decodeShatter(buf: Uint8Array): ShatterBake | null {
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'SHAT') return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))) as ShatterHeader;
  if (header.format !== SHATTER_FORMAT) return null;
  let o = 8 + hl;
  o += (4 - (o % 4)) % 4;
  const take = <T>(n: number, C: { new (b: ArrayBuffer): T }) => {
    const b = buf.slice(o, o + n);
    o += n;
    return new C(b.buffer);
  };
  const v = header.verts;
  const pos = take(v * 12, Float32Array);
  const nrm = take(v * 12, Float32Array);
  const uv = take(v * 8, Float32Array);
  const lvl = take(v * 4, Float32Array);
  const idx = take(header.tris * 12, Uint32Array);
  const frames = take(header.nFrames * header.nShards * 28, Float32Array);
  return { header, pos, nrm, uv, lvl, idx, frames };
}

/** Encode (cuisson, Node) : le tampon NON compressé. */
export function encodeShatter(b: ShatterBake): Uint8Array {
  const hj = new TextEncoder().encode(JSON.stringify(b.header));
  const pad = (4 - ((8 + hj.length) % 4)) % 4;
  const parts = [b.pos, b.nrm, b.uv, b.lvl, b.idx, b.frames].map((a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const total = 8 + hj.length + pad + parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  out.set([83, 72, 65, 84], 0); // « SHAT »
  new DataView(out.buffer).setUint32(4, hj.length, true);
  out.set(hj, 8);
  out.fill(32, 8 + hj.length, 8 + hj.length + pad);
  let o = 8 + hj.length + pad;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
}
