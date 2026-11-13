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

/**
 * VALEURS du bruit fractal de la brûlure du sachet (4 octaves de Perlin, voir `bakedBurnNoise` dans
 * game/scenes/opening.ts) : W × H flottants, à convertir en demi-flottants côté fil principal.
 */
export function burnNoiseValues(W: number, H: number, packW: number, packH: number): Float64Array {
  const perm = new Uint8Array(512);
  {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let a = 0x9e3779b9;
    for (let i = 255; i > 0; i--) {
      a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      const j = a % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => {
    const g = h & 7;
    const u = g < 4 ? x : y, v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
  };
  const perlin = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) + (grad(ba, xf - 1, yf) - grad(aa, xf, yf)) * u;
    const x2 = grad(ab, xf, yf - 1) + (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1)) * u;
    return (x1 + (x2 - x1) * v) * 0.5; // ≈ [-1, 1], comme le Perlin de MaterialX
  };
  const data = new Float64Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      // même domaine que l'original : pp × 4, pp = position locale du booster
      const x = ((i + 0.5) / W - 0.5) * packW * 4, y = ((j + 0.5) / H - 0.5) * packH * 4;
      let v = 0, amp = 1, f = 1;
      for (let o = 0; o < 4; o++) {
        v += perlin(x * f + o * 17.31, y * f + o * 9.73) * amp;
        f *= 2;
        amp *= 0.5;
      }
      data[j * W + i] = v;
    }
  return data;
}
