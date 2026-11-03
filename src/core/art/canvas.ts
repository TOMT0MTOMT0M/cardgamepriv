import { rng } from '../ease';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = ctx2d(c, { willReadFrequently: false });
  return { c, g };
}

// ───────────────────────────────────────────── mémoire des canvas (iOS)
/**
 * Safari iOS plafonne la mémoire TOTALE des canvas : au-delà, `getContext('2d')` renvoie null (avant : TypeError →
 * ouverture bloquée). Les caches (illustrations, silhouettes) s'inscrivent ici pour être vidés en cas de manque.
 */
const pressureHandlers = new Set<() => void>();
export function onCanvasPressure(fn: () => void): void {
  pressureHandlers.add(fn);
}

/** Libère la mémoire d'un canvas tout de suite (iOS ne la rend qu'avec une taille nulle, pas au ramasse-miettes). */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

/**
 * Contexte 2D garanti : si le navigateur le refuse (mémoire des canvas épuisée), on vide les caches et on réessaie ;
 * en dernier recours, la toile est réduite à 1×1 (visuel de secours uni) puis, si même cela échoue, un contexte
 * factice qui ignore tout. Jamais d'exception : la carte s'affiche, au pire sans détail.
 */
export function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): Ctx {
  let g = c.getContext('2d', opts);
  if (g) return g;
  console.warn(`[art] mémoire des canvas saturée (${c.width}×${c.height}) : caches vidés`);
  pressureHandlers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  g = c.getContext('2d', opts);
  if (g) return g;
  // un canvas dont le contexte a échoué ne peut plus en donner : on repart d'une toile neuve, minuscule
  const tiny = document.createElement('canvas');
  tiny.width = tiny.height = 1;
  g = tiny.getContext('2d', opts);
  if (g) {
    c.width = c.height = 1;
    // les dessins vont sur la toile 1×1 ; `c` (vide) reste la cible des textures → couleur unie de secours
    return g;
  }
  return deadCtx();
}

/** Contexte factice : toutes les méthodes existent et ne font rien (renvoient lui-même ou 0). */
function deadCtx(): Ctx {
  const fn: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : fn),
    apply: () => fn,
    set: () => true,
  });
  return fn as Ctx;
}

let grainCanvas: HTMLCanvasElement | null = null;
/** Motif de grain monochrome (tuile 256²), généré une fois. */
export function grainTile(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const { c, g } = makeCanvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    // bruit légèrement "bleu" : on mélange deux tirages
    const v = (r() * 0.65 + r() * 0.35) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

/** Grain d'impression (overlay) + quelques poussières. */
export function applyGrain(g: Ctx, w: number, h: number, amount = 0.12, seed = 1, dust = 40) {
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = amount;
  const p = g.createPattern(grainTile(), 'repeat');
  if (p) {
    g.fillStyle = p;
    g.fillRect(0, 0, w, h);
  }
  g.restore();
  // poussières / fibres
  const r = rng(seed * 31 + 7);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < dust; i++) {
    const x = r() * w, y = r() * h;
    const light = r() > 0.5;
    g.fillStyle = light ? 'rgba(255,250,240,0.35)' : 'rgba(20,15,10,0.28)';
    if (r() > 0.75) {
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 14, x + (r() - 0.5) * 22, y + (r() - 0.5) * 22);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(x, y, 0.5 + r() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Trame de points (halftone) pour ombrer une forme déjà tracée (clip actif). */
export function halftone(g: Ctx, x: number, y: number, w: number, h: number, color: string, angle = 0.4, step = 7, falloff: (u: number, v: number) => number = () => 0.5) {
  g.save();
  g.fillStyle = color;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = x + w / 2, cy = y + h / 2;
  const R = Math.hypot(w, h) / 2 + step;
  for (let i = -R; i < R; i += step)
    for (let j = -R; j < R; j += step) {
      const px = cx + i * ca - j * sa;
      const py = cy + i * sa + j * ca;
      if (px < x - step || px > x + w + step || py < y - step || py > y + h + step) continue;
      const k = falloff((px - x) / w, (py - y) / h);
      if (k <= 0.02) continue;
      g.beginPath();
      g.arc(px, py, (step * 0.5) * Math.sqrt(Math.min(1, k)), 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Bruit de valeur 1D lissé, déterministe. */
export function noise1(seed: number) {
  const r = rng(seed);
  const pts = Array.from({ length: 64 }, () => r());
  return (x: number) => {
    const i = Math.floor(x), f = x - i;
    const a = pts[((i % 64) + 64) % 64], b = pts[(((i + 1) % 64) + 64) % 64];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

export function fbm1(seed: number, oct = 4) {
  const ns = Array.from({ length: oct }, (_, i) => noise1(seed + i * 101));
  return (x: number) => {
    let v = 0, a = 0.5, f = 1;
    for (const n of ns) {
      v += n(x * f) * a;
      a *= 0.5;
      f *= 2.03;
    }
    return v;
  };
}

/** Mélange de couleurs hex (sRGB naïf, suffisant pour la peinture). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function alpha(a: string, k: number): string {
  const p = parseHex(a);
  return `rgba(${p[0]},${p[1]},${p[2]},${k})`;
}

export function parseHex(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/[\d.]+/g)!;
    return [+m[0], +m[1], +m[2]];
  }
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function radial(g: Ctx, x: number, y: number, r0: number, r1: number, stops: Array<[number, string]>) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}

export function linear(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
