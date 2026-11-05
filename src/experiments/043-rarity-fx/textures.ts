import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MirroredRepeatWrapping,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
  type Wrapping,
} from 'three/webgpu';

/**
 * Textures partagées du labo 043, calculées UNE fois sur le CPU au démarrage (quelques ms) et réutilisées par les
 * 35 effets. Principe tiré du rapport « shaders de cartes TCG » : sur téléphone, une lecture de texture précalculée
 * coûte bien moins qu'un bruit fractal évalué à chaque pixel (`mx_fractal_noise` : ~100–300 instructions par octave
 * empilée), et elle se comporte pareil en WebGPU et en WebGL2.
 *
 *  - `film`     : table de film mince PHYSIQUE (Airy, intégrée sur le spectre visible avec les fonctions CIE 1931) :
 *                 u = épaisseur optique 0–1 000 nm, v = cos θ. La couleur « huile / nacre » vraie, pour 1 lecture.
 *  - `spectrum` : couleur d'une longueur d'onde 380–720 nm (réseau de diffraction : arc-en-ciel « vrai »).
 *  - `noise`    : 4 bruits périodiques (R, G fBm ; B turbulence ; A blanc) 256².
 *  - `cells`    : Voronoï périodique (R identifiant de cellule, G distance au bord, B distance au centre).
 *  - `pattern`  : motif « cosmos » (anneaux, disques, étoiles), périodique.
 *  - `stars`    : champ d'étoiles périodique 512² (R éclat, G teinte, B scintillement).
 *  - `caustics` : caustiques d'eau périodiques.
 *  - `lines`    : gravure (R guillochis concentrique, G hachures diagonales).
 *  - `gold`     : matcap or (sphère éclairée), pour l'or liquide.
 *  - `room`     : atlas 2×2 d'une pièce (mur du fond, mur latéral, sol, plafond) pour l'« interior mapping » de la
 *                 carte secrète « Pièce secrète » — une seule texture 2D, pas de cubemap (repli WebGL2 bas de gamme).
 */
export interface FxTextures {
  film: DataTexture;
  spectrum: DataTexture;
  noise: DataTexture;
  cells: DataTexture;
  pattern: DataTexture;
  stars: DataTexture;
  caustics: DataTexture;
  lines: DataTexture;
  gold: DataTexture;
  room: Texture;
  list: Texture[];
}

// ───────────────────────────────────────────── outils
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const toSrgb = (x: number) => {
  const c = clamp01(x);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
/** générateur pseudo-aléatoire déterministe (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function make(data: Uint8Array, w: number, h: number, o: { srgb?: boolean; wrap?: Wrapping; mips?: boolean } = {}) {
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.colorSpace = o.srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = o.wrap ?? RepeatWrapping;
  t.generateMipmaps = o.mips !== false;
  t.minFilter = o.mips === false ? LinearFilter : LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ───────────────────────────────────────────── spectre (CIE 1931, ajustement analytique Wyman–Sloan–Shirley 2013)
const g = (l: number, mu: number, s1: number, s2: number) => {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
const cie = (l: number): [number, number, number] => [
  1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
  0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
  1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
];
const xyz2rgb = (X: number, Y: number, Z: number): [number, number, number] => [
  3.2406 * X - 1.5372 * Y - 0.4986 * Z,
  -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
  0.0557 * X - 0.204 * Y + 1.057 * Z,
];
const LAMBDAS = Array.from({ length: 41 }, (_, i) => 380 + i * 10);
const CMF = LAMBDAS.map(cie);
const YSUM = CMF.reduce((a, c) => a + c[1], 0);

/**
 * Film mince (air / film n = 1,45 / air), réflectance d'Airy en polarisation moyenne, intégrée sur 380–780 nm.
 * La couleur est normalisée en luminance (on garde la TEINTE de l'interférence, l'intensité est réglée par effet)
 * puis légèrement saturée : à épaisseur nulle → blanc neutre, 200–600 nm → les ordres vifs, au-delà → pastel.
 */
function filmLut(): DataTexture {
  const W = 256, H = 32, n1 = 1, n2 = 1.45, n3 = 1;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const cos1 = 0.35 + (0.65 * y) / (H - 1);
    const sin1 = Math.sqrt(1 - cos1 * cos1);
    const sin2 = (n1 / n2) * sin1;
    const cos2 = Math.sqrt(1 - sin2 * sin2);
    // coefficients de Fresnel (s et p), interfaces 1-2 et 2-3 (symétriques ici)
    const rs12 = (n1 * cos1 - n2 * cos2) / (n1 * cos1 + n2 * cos2);
    const rp12 = (n2 * cos1 - n1 * cos2) / (n2 * cos1 + n1 * cos2);
    const rs23 = (n2 * cos2 - n3 * cos1) / (n2 * cos2 + n3 * cos1);
    const rp23 = (n3 * cos2 - n2 * cos1) / (n3 * cos2 + n2 * cos1);
    for (let x = 0; x < W; x++) {
      const d = (1000 * x) / (W - 1);
      let X = 0, Y = 0, Z = 0;
      for (let i = 0; i < LAMBDAS.length; i++) {
        const delta = (4 * Math.PI * n2 * d * cos2) / LAMBDAS[i];
        const c = Math.cos(delta);
        const airy = (a: number, b: number) => (a * a + b * b + 2 * a * b * c) / (1 + a * a * b * b + 2 * a * b * c);
        const R = 0.5 * (airy(rs12, rs23) + airy(rp12, rp23));
        X += R * CMF[i][0];
        Y += R * CMF[i][1];
        Z += R * CMF[i][2];
      }
      let [r, gg, b] = xyz2rgb(X / YSUM, Y / YSUM, Z / YSUM);
      // teinte seule : luminance ramenée à 0,72, saturation ×1,35
      const lum = Math.max(1e-4, 0.2126 * r + 0.7152 * gg + 0.0722 * b);
      r = (r / lum) * 0.72;
      gg = (gg / lum) * 0.72;
      b = (b / lum) * 0.72;
      const m = (r + gg + b) / 3;
      r = m + (r - m) * 1.35;
      gg = m + (gg - m) * 1.35;
      b = m + (b - m) * 1.35;
      const k = (y * W + x) * 4;
      data[k] = toSrgb(r) * 255;
      data[k + 1] = toSrgb(gg) * 255;
      data[k + 2] = toSrgb(b) * 255;
      data[k + 3] = 255;
    }
  }
  return make(data, W, H, { srgb: true, wrap: MirroredRepeatWrapping });
}

/** Couleur d'une longueur d'onde (u : 380 → 720 nm), normalisée au canal maximal. */
function spectrumLut(): DataTexture {
  const W = 256;
  const data = new Uint8Array(W * 4);
  for (let x = 0; x < W; x++) {
    const l = 380 + (340 * x) / (W - 1);
    const [X, Y, Z] = cie(l);
    let [r, gg, b] = xyz2rgb(X, Y, Z);
    r = Math.max(0, r);
    gg = Math.max(0, gg);
    b = Math.max(0, b);
    const m = Math.max(r, gg, b, 1e-4);
    // bords du visible atténués (violet et rouge profonds)
    const edge = Math.min(1, (l - 380) / 40, (720 - l) / 40);
    const k = x * 4;
    data[k] = toSrgb((r / m) * edge) * 255;
    data[k + 1] = toSrgb((gg / m) * edge) * 255;
    data[k + 2] = toSrgb((b / m) * edge) * 255;
    data[k + 3] = 255;
  }
  return make(data, W, 1, { srgb: true, wrap: ClampToEdgeWrapping, mips: false });
}

// ───────────────────────────────────────────── bruits périodiques
function valueNoise(size: number, period: number, seed: number) {
  const r = rng(seed);
  const lat = new Float32Array(period * period).map(() => r());
  const at = (x: number, y: number) => lat[((y % period) + period) % period * period + (((x % period) + period) % period)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (px: number, py: number) => {
    const x = (px / size) * period, y = (py / size) * period;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = s(x - xi), fy = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbm(size: number, base: number, oct: number, seed: number) {
  const layers = Array.from({ length: oct }, (_, i) => valueNoise(size, base << i, seed + i * 101));
  return (x: number, y: number) => {
    let v = 0, a = 0.5, n = 0;
    for (const l of layers) {
      v += l(x, y) * a;
      n += a;
      a *= 0.5;
    }
    return v / n;
  };
}
function noiseTex(): DataTexture {
  const S = 256;
  const f1 = fbm(S, 4, 5, 11), f2 = fbm(S, 8, 4, 23), f3 = fbm(S, 4, 5, 37);
  const r = rng(53);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      // contraste étiré (le fBm se concentre autour de 0,5)
      data[k] = clamp01((f1(x, y) - 0.5) * 1.9 + 0.5) * 255;
      data[k + 1] = clamp01((f2(x, y) - 0.5) * 1.9 + 0.5) * 255;
      data[k + 2] = clamp01(1 - Math.abs(f3(x, y) - 0.5) * 2.4) * 255;
      data[k + 3] = r() * 255;
    }
  return make(data, S, S);
}

/** Voronoï périodique : grille 8×8 de germes décalés (chaque cellule = un éclat de « glace craquelée »). */
function cellsTex(): DataTexture {
  const S = 256, G = 8, r = rng(71);
  const pts: Array<[number, number, number]> = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + r() * 0.7) / G, (j + 0.15 + r() * 0.7) / G, r()]);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let d1 = 9, d2 = 9, id = 0;
      const ci = Math.floor(u * G), cj = Math.floor(v * G);
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const ii = (((ci + di) % G) + G) % G, jj = (((cj + dj) % G) + G) % G;
          const p = pts[jj * G + ii];
          const px = p[0] + Math.floor((ci + di) / G), py = p[1] + Math.floor((cj + dj) / G);
          const d = Math.hypot(u - px, v - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = p[2];
          } else if (d < d2) d2 = d;
        }
      const k = (y * S + x) * 4;
      data[k] = id * 255;
      data[k + 1] = clamp01((d2 - d1) * G * 1.6) * 255;
      data[k + 2] = clamp01(d1 * G) * 255;
      data[k + 3] = 255;
    }
  // l'identifiant ne doit pas être moyenné entre deux éclats : pas de mipmaps
  return make(data, S, S, { mips: false });
}

/** Motif « cosmos » : anneaux, disques et petites étoiles semés en périodique. */
function patternTex(): DataTexture {
  const S = 256, r = rng(91);
  const cov = new Float32Array(S * S), idf = new Float32Array(S * S), star = new Float32Array(S * S);
  const stamp = (cx: number, cy: number, rad: number, ring: boolean, id: number) => {
    const R = Math.ceil(rad + 2);
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y);
        const a = ring ? clamp01(1.4 - Math.abs(d - rad) * 0.9) : clamp01(rad - d + 0.7);
        if (a <= 0) continue;
        const k = (((cy + y) % S) + S) % S * S + ((((cx + x) % S) + S) % S);
        if (a > cov[k]) {
          cov[k] = a;
          idf[k] = id;
        }
      }
  };
  for (let i = 0; i < 70; i++) stamp(Math.floor(r() * S), Math.floor(r() * S), 4 + r() * 22, r() < 0.55, r());
  for (let i = 0; i < 160; i++) {
    const cx = Math.floor(r() * S), cy = Math.floor(r() * S), s = 2 + r() * 5;
    for (let y = -8; y <= 8; y++)
      for (let x = -8; x <= 8; x++) {
        // étoile à 4 branches : |x|^p + |y|^p < s^p avec p < 1
        const p = 0.6;
        const v = clamp01(1 - (Math.pow(Math.abs(x) / s, p) + Math.pow(Math.abs(y) / s, p)));
        const k = (((cy + y) % S) + S) % S * S + ((((cx + x) % S) + S) % S);
        star[k] = Math.max(star[k], v);
      }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = cov[i] * 255;
    data[i * 4 + 1] = idf[i] * 255;
    data[i * 4 + 2] = star[i] * 255;
    data[i * 4 + 3] = 255;
  }
  return make(data, S, S);
}

/** Champ d'étoiles périodique (3 tailles), teinte et phase de scintillement par étoile. */
function starsTex(): DataTexture {
  const S = 512, r = rng(131);
  const br = new Float32Array(S * S), hue = new Float32Array(S * S), ph = new Float32Array(S * S);
  for (let i = 0; i < 900; i++) {
    const cx = r() * S, cy = r() * S;
    const big = r();
    const rad = big > 0.985 ? 2.6 : big > 0.9 ? 1.4 : 0.8;
    const lum = big > 0.985 ? 1 : 0.35 + r() * 0.55;
    const h = r(), p = r();
    const R = Math.ceil(rad * 3);
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const px = Math.floor(cx) + x, py = Math.floor(cy) + y;
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        let v = Math.exp(-(d * d) / (rad * rad)) * lum;
        // aigrettes pour les plus brillantes
        if (rad > 2) v += Math.max(0, 1 - Math.abs(px + 0.5 - cx) / 0.9) * Math.exp(-Math.abs(py + 0.5 - cy) / 5) * 0.5 + Math.max(0, 1 - Math.abs(py + 0.5 - cy) / 0.9) * Math.exp(-Math.abs(px + 0.5 - cx) / 5) * 0.5;
        const k = ((py % S) + S) % S * S + (((px % S) + S) % S);
        if (v > br[k]) {
          br[k] = Math.min(1, v);
          hue[k] = h;
          ph[k] = p;
        }
      }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = br[i] * 255;
    data[i * 4 + 1] = hue[i] * 255;
    data[i * 4 + 2] = ph[i] * 255;
    data[i * 4 + 3] = 255;
  }
  return make(data, S, S);
}

/** Caustiques : bords de Voronoï déformés par un bruit, affinés en lignes de lumière. */
function causticsTex(cells: DataTexture): DataTexture {
  const S = 256;
  const warp = fbm(S, 4, 3, 151), warp2 = fbm(S, 4, 3, 163);
  const src = cells.image.data as Uint8Array;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = Math.floor(x + (warp(x, y) - 0.5) * 40 + S * 4) % S;
      const wy = Math.floor(y + (warp2(x, y) - 0.5) * 40 + S * 4) % S;
      const e = src[(wy * S + wx) * 4 + 1] / 255;
      const v = Math.pow(clamp01(1 - e * 1.8), 4);
      const k = (y * S + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = v * 255;
      data[k + 3] = 255;
    }
  return make(data, S, S);
}

/** Gravure : guillochis concentrique (R, à poser sur la fenêtre) et hachures diagonales fines (G, périodique). */
function linesTex(): DataTexture {
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S - 0.5, v = y / S - 0.5;
      const rr = Math.hypot(u, v), th = Math.atan2(v, u);
      const ring = 0.5 + 0.5 * Math.cos(2 * Math.PI * (rr * 46 + 0.35 * Math.sin(th * 7) + 0.12 * Math.sin(th * 19)));
      const hatch = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((x + y) / S) * 64);
      const k = (y * S + x) * 4;
      data[k] = Math.pow(ring, 3) * 255;
      data[k + 1] = Math.pow(hatch, 4) * 255;
      data[k + 2] = 0;
      data[k + 3] = 255;
    }
  return make(data, S, S);
}

/** Matcap or : studio simple (ciel clair en haut, horizon sombre, sol chaud), reflet principal net. */
function goldTex(): DataTexture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = (x + 0.5) / S * 2 - 1, ny = 1 - (y + 0.5) / S * 2;
      const rr = nx * nx + ny * ny;
      const nz = Math.sqrt(Math.max(0, 1 - rr));
      // direction réfléchie (vue de face) → environnement
      const ry = 2 * nz * ny;
      const env = ry > 0.15 ? 1.05 + 0.4 * ry : ry > -0.1 ? 0.12 : 0.55 + 0.3 * -ry;
      const spec = Math.pow(Math.max(0, nx * -0.35 + ny * 0.55 + nz * 0.76), 60) * 2.2;
      const fres = Math.pow(1 - nz, 3) * 0.6;
      const base = [1.0, 0.71, 0.29];
      const k = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) data[k + c] = toSrgb(base[c] * env * 0.8 + spec + fres * base[c]) * 255;
      data[k + 3] = 255;
    }
  return make(data, S, S, { srgb: true, wrap: ClampToEdgeWrapping });
}

/**
 * Atlas de la pièce (1024², 4 tuiles de 512) dessiné au Canvas 2D : (0,0) mur du fond, (1,0) mur latéral,
 * (0,1) sol, (1,1) plafond — en coordonnées UV (v vers le haut), la tuile étant dessinée avec un repère retourné.
 * Une alcôve de musée : plâtre chaud, lambris, parquet, plafond sombre avec sa lampe.
 */
function roomAtlas(): Texture {
  const S = 1024, T = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const r = rng(77);
  const tile = (ix: number, iy: number, draw: (g: CanvasRenderingContext2D) => void) => {
    g.save();
    g.translate(ix * T, (2 - iy) * T);
    g.scale(T, -T);
    g.beginPath();
    g.rect(0, 0, 1, 1);
    g.clip();
    draw(g);
    g.restore();
  };
  const grain = (g: CanvasRenderingContext2D, n: number, a: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${a * r()})`;
      g.fillRect(r(), r(), 0.004 + r() * 0.01, 0.002 + r() * 0.004);
    }
  };
  // mur du fond : plâtre chaud + projecteur (ovale) + plinthe et cimaise
  tile(0, 0, (g) => {
    g.fillStyle = '#3a2e27';
    g.fillRect(0, 0, 1, 1);
    const sp = g.createRadialGradient(0.5, 0.6, 0.02, 0.5, 0.6, 0.62);
    sp.addColorStop(0, 'rgba(255,214,160,0.55)');
    sp.addColorStop(0.45, 'rgba(255,200,140,0.18)');
    sp.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sp;
    g.fillRect(0, 0, 1, 1);
    grain(g, 900, 0.05);
    g.fillStyle = '#1a1411';
    g.fillRect(0, 0, 1, 0.07);
    g.fillStyle = '#4a3a30';
    g.fillRect(0, 0.07, 1, 0.012);
    g.fillRect(0, 0.78, 1, 0.01);
  });
  // mur latéral : lambris vertical (le fond de la pièce est à x = 1)
  tile(1, 0, (g) => {
    g.fillStyle = '#4a382d';
    g.fillRect(0, 0, 1, 1);
    for (let i = 0; i < 7; i++) {
      const x = i / 7;
      const lg = g.createLinearGradient(x, 0, x + 1 / 7, 0);
      lg.addColorStop(0, '#36281f');
      lg.addColorStop(0.08, '#5c4536');
      lg.addColorStop(0.5, '#4e3b2f');
      lg.addColorStop(0.92, '#3d2d24');
      lg.addColorStop(1, '#271b15');
      g.fillStyle = lg;
      g.fillRect(x, 0, 1 / 7, 1);
    }
    g.fillStyle = '#1a1411';
    g.fillRect(0, 0, 1, 0.07);
    g.fillStyle = '#4a3a30';
    g.fillRect(0, 0.07, 1, 0.012);
    g.fillRect(0, 0.78, 1, 0.01);
    grain(g, 600, 0.04);
  });
  // sol : parquet (lames le long de x, joints aléatoires), plus clair sous le projecteur
  tile(0, 1, (g) => {
    g.fillStyle = '#3f2c21';
    g.fillRect(0, 0, 1, 1);
    const rows = 9;
    for (let j = 0; j < rows; j++) {
      let x = -r() * 0.4;
      while (x < 1) {
        const w = 0.25 + r() * 0.3;
        const k = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(84 * k)},${Math.round(58 * k)},${Math.round(42 * k)})`;
        g.fillRect(x + 0.003, j / rows + 0.003, w - 0.006, 1 / rows - 0.006);
        x += w;
      }
    }
    const sp = g.createRadialGradient(0.5, 0.75, 0.02, 0.5, 0.75, 0.6);
    sp.addColorStop(0, 'rgba(255,220,170,0.32)');
    sp.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sp;
    g.fillRect(0, 0, 1, 1);
    grain(g, 700, 0.05);
  });
  // plafond : sombre, halo de la lampe au centre
  tile(1, 1, (g) => {
    g.fillStyle = '#17120f';
    g.fillRect(0, 0, 1, 1);
    const sp = g.createRadialGradient(0.5, 0.5, 0.01, 0.5, 0.5, 0.45);
    sp.addColorStop(0, 'rgba(255,225,180,0.75)');
    sp.addColorStop(0.2, 'rgba(255,205,150,0.25)');
    sp.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sp;
    g.fillRect(0, 0, 1, 1);
    grain(g, 300, 0.04);
  });
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

export function createFxTextures(): FxTextures {
  const film = filmLut();
  const spectrum = spectrumLut();
  const noise = noiseTex();
  const cells = cellsTex();
  const pattern = patternTex();
  const stars = starsTex();
  const caustics = causticsTex(cells);
  const lines = linesTex();
  const gold = goldTex();
  const room = roomAtlas();
  return { film, spectrum, noise, cells, pattern, stars, caustics, lines, gold, room, list: [film, spectrum, noise, cells, pattern, stars, caustics, lines, gold, room] };
}
