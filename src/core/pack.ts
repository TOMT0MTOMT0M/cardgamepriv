import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, NoColorSpace, SRGBColorSpace, type Texture } from 'three/webgpu';
import { bumpMap, float, mix, normalMap, positionLocal, texture, uv, vec2, vec3, smoothstep, sin } from 'three/tsl';
import { makeCanvas, applyGrain, alpha, roundRect, linear, radial, type Ctx } from './art/canvas';
import { FONT_MONO, FONT_TITLE } from './art/frame';
import { ensureFonts } from './art';
import { encodeNormal } from './tsl';

/** Booster : un peu plus grand qu'une carte, coussin bombé, soudures crantées haut/bas. */
export const PACK = { w: 0.78, h: 1.18, bulge: 0.045, crimp: 0.075 };

export interface PackStyle {
  name: string;
  ground: string;
  ground2: string;
  ink: string;
  foil: string;
  accent: string;
  /** nom imprimé (défaut « Card Lab ») — le jeu y met le nom du booster (« POKEMON », « BÉBOU PACK ») */
  title?: string;
  /** ligne sous le titre (défaut « SÉRIE I · <name> ») */
  series?: string;
  /** mention du bas (défaut « 5 CARTES · DONT 1 RARE OU MIEUX ») */
  tagline?: string;
  /** petites lignes imprimées au dos (défaut : les mentions du labo) */
  backLines?: string[];
}

export const PACK_STYLES: Record<string, PackStyle> = {
  ember: { name: 'Braise', ground: '#1a1513', ground2: '#3a1f17', ink: '#f1e4cf', foil: '#c98a4b', accent: '#e8643a' },
  tide: { name: 'Marée', ground: '#0f1c1c', ground2: '#16342f', ink: '#e8e3d3', foil: '#c7b27a', accent: '#5fa58f' },
  bone: { name: 'Os', ground: '#e7e0d0', ground2: '#cfc5ae', ink: '#1d1a17', foil: '#8a7a5c', accent: '#b4442f' },
};

/** Géométrie coussin fermée : face avant (groupe 0) + dos (groupe 1), UV planaires. */
export function createPackGeometry(segX = 36, segY = 56): BufferGeometry {
  const { w, h, bulge, crimp } = PACK;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const cv = crimp / h;
  const prof = (u: number, v: number) => {
    const pu = Math.pow(Math.sin(Math.PI * u), 0.42);
    const vv = (v - cv) / (1 - 2 * cv);
    const inBody = vv > 0 && vv < 1 ? Math.pow(Math.sin(Math.PI * vv), 0.3) : 0;
    return pu * inBody;
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= segY; j++) {
      const v = j / segY;
      for (let i = 0; i <= segX; i++) {
        const u = i / segX;
        const x = (u - 0.5) * w;
        const y = (v - 0.5) * h;
        // soudures : micro-ondulation (le relief fin vient de la normal map)
        const crimpZ = v < cv || v > 1 - cv ? 0.0012 * Math.sin(x * 260) : 0;
        const z = side * (bulge * prof(u, v) + 0.0006 + crimpZ);
        pos.push(x, y, z);
        uvs.push(side > 0 ? u : 1 - u, v);
      }
    }
    for (let j = 0; j < segY; j++)
      for (let i = 0; i < segX; i++) {
        const a = base + j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
        if (side > 0) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const half = idx.length / 2;
  g.addGroup(0, half, 0);
  g.addGroup(half, half, 1);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const PW = 640, PH = Math.round((640 * PACK.h) / PACK.w);

/** Police du titre réduite jusqu'à tenir dans `maxW` (« BÉBOU PACK » est plus long que « Card Lab »). */
function fitFont(g: Ctx, text: string, weight: number, size: number, maxW: number, family: string): string {
  let px = size;
  g.font = `${weight} ${px}px ${family}`;
  while (px > 28 && g.measureText(text).width > maxW) {
    px -= 2;
    g.font = `${weight} ${px}px ${family}`;
  }
  return g.font;
}

function crimpBands(g: Ctx, col: string) {
  const ch = (PACK.crimp / PACK.h) * PH;
  for (const y0 of [0, PH - ch]) {
    g.fillStyle = col;
    g.fillRect(0, y0, PW, ch);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.2;
    for (let x = 0; x < PW; x += 6) {
      g.beginPath();
      g.moveTo(x, y0 + 3);
      g.lineTo(x, y0 + ch - 3);
      g.stroke();
    }
  }
  return ch;
}

export interface PackArt {
  front: Texture;
  back: Texture;
  /** hauteur du froissé (gris), répétable */
  crinkle: Texture;
  /** R foil, G relief soudures, B zone de déchirure (ligne pointillée) */
  masks: Texture;
  dispose(): void;
}

/** Visuel procédural du booster (marque inventée « Card Lab »). */
export async function generatePackArt(style: PackStyle = PACK_STYLES.ember): Promise<PackArt> {
  await ensureFonts();
  const F = makeCanvas(PW, PH), B = makeCanvas(PW, PH), M = makeCanvas(PW, PH);
  const g = F.g;
  g.fillStyle = linear(g, 0, 0, PW, PH, [[0, style.ground2], [0.55, style.ground], [1, style.ground]]);
  g.fillRect(0, 0, PW, PH);
  // grand emblème : soleil rayonnant + carte stylisée
  const cx = PW / 2, cy = PH * 0.44;
  g.save();
  g.strokeStyle = alpha(style.foil, 0.55);
  g.lineWidth = 1.2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = 150, r1 = i % 2 ? 260 : 330;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
  }
  g.fillStyle = radial(g, cx, cy, 10, 150, [[0, alpha(style.accent, 0.95)], [1, alpha(style.accent, 0.15)]]);
  g.beginPath();
  g.arc(cx, cy, 140, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = style.foil;
  g.stroke();
  // trois cartes en éventail
  for (let k = -1; k <= 1; k++) {
    g.save();
    g.translate(cx, cy + 40);
    g.rotate(k * 0.28);
    g.fillStyle = k === 0 ? style.ink : alpha(style.ink, 0.75);
    roundRect(g, -52, -150, 104, 146, 8);
    g.fill();
    g.strokeStyle = style.ground;
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = alpha(style.ground, 0.6);
    g.lineWidth = 1.5;
    roundRect(g, -44, -142, 88, 130, 5);
    g.stroke();
    g.restore();
  }
  g.restore();
  // titre
  const title = style.title ?? 'Card Lab';
  const titleFont = fitFont(g, title, 600, 78, PW - 90, FONT_TITLE);
  g.fillStyle = style.ink;
  g.textAlign = 'center';
  g.font = titleFont;
  g.fillText(title, cx, PH * 0.74);
  g.font = `500 20px ${FONT_MONO}`;
  g.fillStyle = alpha(style.ink, 0.75);
  g.fillText(style.series ?? `S É R I E   I  ·  ${style.name.toUpperCase()}`, cx, PH * 0.78);
  g.font = `400 16px ${FONT_MONO}`;
  g.fillText(style.tagline ?? '5 CARTES · DONT 1 RARE OU MIEUX', cx, PH * 0.84);
  // ligne de déchirure
  const ch = (PACK.crimp / PACK.h) * PH;
  const tearY = PH - ch - 40;
  g.setLineDash([10, 8]);
  g.strokeStyle = alpha(style.ink, 0.5);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(24, PH - tearY);
  g.lineTo(PW - 24, PH - tearY);
  g.stroke();
  g.setLineDash([]);
  g.font = `400 13px ${FONT_MONO}`;
  g.textAlign = 'left';
  g.fillText('✂ DÉCHIRER ICI', 28, PH - tearY - 10);
  crimpBands(g, style.foil);
  applyGrain(g, PW, PH, 0.08, 9, 40);

  // dos
  const b = B.g;
  b.fillStyle = style.ground;
  b.fillRect(0, 0, PW, PH);
  b.strokeStyle = alpha(style.foil, 0.25);
  for (let i = 0; i < 40; i++) {
    b.beginPath();
    b.arc(PW / 2, PH / 2, 20 + i * 14, 0, Math.PI * 2);
    b.stroke();
  }
  b.fillStyle = alpha(style.ink, 0.8);
  b.textAlign = 'center';
  b.font = `400 15px ${FONT_MONO}`;
  (style.backLines ?? ['Ne convient pas aux dragons de moins de trois ans.', 'Illustrations entièrement procédurales.', 'Fabriqué dans un laboratoire. Avec soin.']).forEach((l, i) =>
    b.fillText(l, PW / 2, PH * 0.7 + i * 26),
  );
  for (let i = 0; i < 46; i++) b.fillRect(PW / 2 - 120 + i * 5.3, PH * 0.82, i % 3 ? 2 : 3.5, 60);
  crimpBands(b, style.foil);
  applyGrain(b, PW, PH, 0.08, 10, 30);

  // masques
  const m = M.g;
  m.fillStyle = '#000';
  m.fillRect(0, 0, PW, PH);
  m.globalCompositeOperation = 'lighter';
  m.fillStyle = 'rgb(255,0,0)';
  m.fillRect(0, 0, PW, ch);
  m.fillRect(0, PH - ch, PW, ch);
  m.strokeStyle = 'rgb(255,0,0)';
  m.lineWidth = 2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    m.beginPath();
    m.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
    m.lineTo(cx + Math.cos(a) * (i % 2 ? 260 : 330), cy + Math.sin(a) * (i % 2 ? 260 : 330));
    m.stroke();
  }
  m.lineWidth = 6;
  m.beginPath();
  m.arc(cx, cy, 140, 0, Math.PI * 2);
  m.stroke();
  m.font = titleFont;
  m.textAlign = 'center';
  m.fillText(title, cx, PH * 0.74);
  m.fillStyle = 'rgb(0,255,0)';
  for (const y0 of [0, PH - ch]) for (let x = 0; x < PW; x += 6) m.fillRect(x, y0, 3, ch);
  m.fillStyle = 'rgb(0,0,255)';
  m.fillRect(0, PH - tearY - 2, PW, 4);

  // froissé : grands plis + froissé fin, cuit une fois (bien moins cher qu'un bruit par pixel)
  const C = makeCanvas(512, 512);
  {
    const cg = C.g;
    cg.fillStyle = '#808080';
    cg.fillRect(0, 0, 512, 512);
    const rr = (() => {
      let a = 12345;
      return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    cg.filter = 'blur(14px)';
    for (let i = 0; i < 90; i++) {
      cg.fillStyle = rr() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      cg.beginPath();
      cg.ellipse(rr() * 512, rr() * 512, 20 + rr() * 90, 8 + rr() * 30, rr() * Math.PI, 0, Math.PI * 2);
      cg.fill();
    }
    cg.filter = 'blur(1.5px)';
    for (let i = 0; i < 70; i++) {
      // arêtes de plis : traits clairs + ombre adjacente
      const x = rr() * 512, y = rr() * 512, a = rr() * Math.PI, l = 40 + rr() * 160;
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      cg.lineWidth = 1 + rr() * 2.5;
      cg.strokeStyle = 'rgba(255,255,255,0.35)';
      cg.beginPath();
      cg.moveTo(x, y);
      cg.quadraticCurveTo(x + dx * 0.5 + (rr() - 0.5) * 30, y + dy * 0.5 + (rr() - 0.5) * 30, x + dx, y + dy);
      cg.stroke();
      cg.strokeStyle = 'rgba(0,0,0,0.3)';
      cg.beginPath();
      cg.moveTo(x + 3, y + 3);
      cg.quadraticCurveTo(x + 3 + dx * 0.5, y + 3 + dy * 0.5, x + 3 + dx, y + 3 + dy);
      cg.stroke();
    }
    cg.filter = 'none';
    applyGrain(cg, 512, 512, 0.25, 4, 0);
  }

  const tex = (c: HTMLCanvasElement, color: boolean) => {
    const t = new CanvasTexture(c);
    t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const front = tex(F.c, true), back = tex(B.c, true), masks = tex(M.c, false), crinkle = tex(C.c, false);
  crinkle.wrapS = crinkle.wrapT = 1000; // RepeatWrapping
  return { front, back, masks, crinkle, dispose: () => [front, back, masks, crinkle].forEach((t) => t.dispose()) };
}

/** Matériau de booster : plastique métallisé froissé, soudures crantées. */
export function createPackMaterials(art: PackArt, opts: { crinkle?: number } = {}) {
  const make = (map: Texture, side: 0 | 1) => {
    const m = new MeshPhysicalNodeMaterial();
    const uvn = uv();
    const mk = texture(art.masks, uvn);
    const col = texture(map, uvn);
    const foil = side === 0 ? mk.r : smoothstep(0.5, 0.6, mk.g.add(mk.r));
    const ridges = vec3(sin(positionLocal.x.mul(1600)).mul(0.6).mul(mk.g), 0, 1).normalize();
    const crTex = texture(art.crinkle, uvn.mul(vec2(1.6, 2.4)).add(side * 0.37));
    m.colorNode = col.rgb;
    m.metalnessNode = mix(float(0.15), float(0.95), foil);
    m.roughnessNode = mix(float(0.36), float(0.2), foil);
    m.normalNode = bumpMap(crTex.r, float(opts.crinkle ?? 1.4), normalMap(encodeNormal(ridges)));
    m.clearcoatNode = float(0.6);
    m.clearcoatRoughnessNode = float(0.12);
    return m;
  };
  return [make(art.front, 0), make(art.back, 1)];
}

export function createPackMesh(art: PackArt, opts?: { crinkle?: number }) {
  const mesh = new Mesh(createPackGeometry(), createPackMaterials(art, opts));
  mesh.name = 'pack';
  return mesh;
}

/** Ligne "déchirer ici" en UV (v), cohérente avec le visuel. */
export const TEAR_V = 1 - ((PACK.crimp / PACK.h) * PH + 40) / PH;
