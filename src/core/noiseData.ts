/**
 * PIXELS du bruit de gradient répétable (voir `noiseTexture` dans tsl.ts) — module SANS three.js, partagé par le fil
 * principal et son worker (noise.worker.ts). Mêmes graines, mêmes pixels des deux côtés.
 */
/** Période (en unités de bruit) de la texture de bruit répétable. */
export const NOISE_PERIOD = 64;
/** texels par cellule */
export const NOISE_RES = 8;
export const NOISE_SIZE = NOISE_PERIOD * NOISE_RES;

export function noisePixels(): Uint8Array {
  const P = NOISE_PERIOD, RES = NOISE_RES, W = P * RES;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const data = new Uint8Array(W * W * 4);
  for (let ch = 0; ch < 3; ch++) {
    // gradients pseudo-aléatoires par sommet du réseau (périodiques)
    const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
    let a = 0x9e3779b9 ^ (ch * 0x85ebca6b);
    for (let i = 0; i < P * P; i++) {
      a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      const ang = (a / 4294967296) * Math.PI * 2;
      gx[i] = Math.cos(ang);
      gy[i] = Math.sin(ang);
    }
    const dotG = (ix: number, iy: number, x: number, y: number) => {
      const k = ((iy % P) * P + (ix % P)) | 0;
      return gx[k] * x + gy[k] * y;
    };
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / RES, y = (j + 0.5) / RES;
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = fade(xf), v = fade(yf);
        const n00 = dotG(xi, yi, xf, yf), n10 = dotG(xi + 1, yi, xf - 1, yf);
        const n01 = dotG(xi, yi + 1, xf, yf - 1), n11 = dotG(xi + 1, yi + 1, xf - 1, yf - 1);
        const n = (n00 + (n10 - n00) * u + (n01 - n00 + (n00 - n10 - n01 + n11) * u) * v) * 1.4; // ≈ [-1, 1]
        data[(j * W + i) * 4 + ch] = Math.round(Math.min(1, Math.max(0, n * 0.5 + 0.5)) * 255);
      }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}
