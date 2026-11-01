import { DirectionalLight, Group, MeshPhysicalNodeMaterial, type Mesh } from 'three/webgpu';
import { float, mix, smoothstep, texture, uv } from 'three/tsl';
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js';
import { createGaussianSplatGeometry, writeCovariance } from 'three/addons/utils/GaussianSplatUtils.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor, FRAME_WIN as WIN, BASE_W, BASE_H } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial, windowSDF } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { EASE, rng } from '../../core/ease';

/** sRGB (0..1) → linéaire. Les couleurs de splat sont lues dans l'espace de travail linéaire du lab. */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * "Gonfle" le sujet 2D en sculpture 3D de gaussiennes : distance au contour (chamfer 2 passes) → dôme,
 * une gaussienne aplatie par échantillon, orientée selon la normale du dôme. + aura et paillettes selon le tier.
 */
function inflateSubject(subject: HTMLCanvasElement, fx: HTMLCanvasElement, rar: Rarity, seed: number, quality: 'high' | 'mobile') {
  const GWs = quality === 'mobile' ? 150 : 210;
  const GHs = Math.round((GWs * WIN.h) / WIN.w);
  const sx = (WIN.x / BASE_W) * subject.width, sy = (WIN.y / BASE_H) * subject.height;
  const sw = (WIN.w / BASE_W) * subject.width, sh = (WIN.h / BASE_H) * subject.height;
  const c = document.createElement('canvas');
  c.width = GWs;
  c.height = GHs;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(subject, sx, sy, sw, sh, 0, 0, GWs, GHs);
  const px = g.getImageData(0, 0, GWs, GHs).data;
  g.clearRect(0, 0, GWs, GHs);
  g.drawImage(fx, sx, sy, sw, sh, 0, 0, GWs, GHs);
  const fxd = g.getImageData(0, 0, GWs, GHs).data;
  // distance au contour (chamfer 3-4), en cellules
  const N = GWs * GHs;
  const D = new Float32Array(N);
  const inside = (i: number) => px[i * 4 + 3] > 100;
  for (let i = 0; i < N; i++) D[i] = inside(i) ? 1e6 : 0;
  for (let y = 0; y < GHs; y++)
    for (let x = 0; x < GWs; x++) {
      const i = y * GWs + x;
      if (!D[i]) continue;
      let d = D[i];
      if (x > 0) d = Math.min(d, D[i - 1] + 1);
      if (y > 0) d = Math.min(d, D[i - GWs] + 1);
      if (x > 0 && y > 0) d = Math.min(d, D[i - GWs - 1] + 1.414);
      if (x < GWs - 1 && y > 0) d = Math.min(d, D[i - GWs + 1] + 1.414);
      D[i] = d;
    }
  for (let y = GHs - 1; y >= 0; y--)
    for (let x = GWs - 1; x >= 0; x--) {
      const i = y * GWs + x;
      if (!D[i]) continue;
      let d = D[i];
      if (x < GWs - 1) d = Math.min(d, D[i + 1] + 1);
      if (y < GHs - 1) d = Math.min(d, D[i + GWs] + 1);
      if (x < GWs - 1 && y < GHs - 1) d = Math.min(d, D[i + GWs + 1] + 1.414);
      if (x > 0 && y < GHs - 1) d = Math.min(d, D[i + GWs - 1] + 1.414);
      D[i] = d;
    }
  const cell = (WIN.w / BASE_W) * CARD.w / GWs;
  const inflate = 0.0105 + rar.tier * 0.0016;
  const H = (i: number) => Math.sqrt(D[i]) * inflate;
  const r = rng(seed);
  const pts: number[] = [], cov: number[] = [], col: number[] = [];
  const winCx = ((WIN.x + WIN.w / 2) / BASE_W - 0.5) * CARD.w;
  const winCy = (0.5 - (WIN.y + WIN.h / 2) / BASE_H) * CARD.h;
  const tmpCov = new Float32Array(6);
  const push = (x: number, y: number, z: number, s: [number, number, number], q: [number, number, number, number], rgba: [number, number, number, number]) => {
    pts.push(x, y, z);
    writeCovariance(tmpCov, 0, s[0], s[1], s[2], q[0], q[1], q[2], q[3]);
    cov.push(...tmpCov);
    col.push(...rgba);
  };
  for (let y = 0; y < GHs; y++)
    for (let x = 0; x < GWs; x++) {
      const i = y * GWs + x;
      if (!inside(i)) continue;
      const h = H(i);
      // normale du dôme par différences centrales
      const hx = H(y * GWs + Math.min(GWs - 1, x + 1)) - H(y * GWs + Math.max(0, x - 1));
      const hy = H(Math.max(0, y - 1) * GWs + x) - H(Math.min(GHs - 1, y + 1) * GWs + x);
      const nx = -hx / (2 * cell), ny = -hy / (2 * cell);
      // quaternion qui aligne z sur la normale (petit angle)
      const qx = -ny * 0.5, qy = nx * 0.5;
      const ql = Math.hypot(qx, qy, 1);
      const em = fxd[i * 4] / 255;
      const rr = lin(px[i * 4] / 255) * 255, gg = lin(px[i * 4 + 1] / 255) * 255, bb = lin(px[i * 4 + 2] / 255) * 255;
      const boost = 1 + em * 0.6;
      const wx = winCx + (x / GWs - 0.5) * (WIN.w / BASE_W) * CARD.w + (r() - 0.5) * cell * 0.5;
      const wy = winCy - (y / GHs - 0.5) * (WIN.h / BASE_H) * CARD.h + (r() - 0.5) * cell * 0.5;
      const sxy = cell * 0.62;
      push(wx, wy, h, [sxy, sxy, cell * 0.18], [qx / ql, qy / ql, 0, 1 / ql], [rr * boost, gg * boost, bb * boost, 235]);
      // couche arrière (volume) plus sombre
      if ((x + y) % 2 === 0) push(wx, wy, h * 0.45, [sxy * 1.3, sxy * 1.3, cell * 0.5], [0, 0, 0, 1], [rr * 0.45, gg * 0.45, bb * 0.45, 200]);
    }
  // paillettes en suspension près du sujet (≥ rare) : discrètes, elles accrochent la lumière quand on tourne
  const inPts = pts.length / 3;
  const sparkN = [0, 0, 60, 120, 200, 320][rar.tier];
  for (let k = 0; k < sparkN && inPts > 0; k++) {
    const j = Math.floor(r() * inPts) * 3;
    const s = cell * (0.18 + r() * 0.25);
    const tw = r();
    push(pts[j] + (r() - 0.5) * 0.04, pts[j + 1] + (r() - 0.5) * 0.04, pts[j + 2] + 0.01 + r() * 0.05, [s, s, s], [0, 0, 0, 1], [255, 240 - tw * 30, 210 - tw * 50, 150 + tw * 100]);
  }
  return createGaussianSplatGeometry(new Float32Array(pts), new Float32Array(cov), new Uint8ClampedArray(col));
}

/**
 * 016 — Gaussian splat (sculpture "pop-up").
 * Le sujet de l'illustration est gonflé en sculpture 3D faite de dizaines de milliers de gaussiennes (addon
 * GaussianSplat r186), qui sort de la carte comme un livre pop-up.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  let splat: GaussianSplat;
  let card: Mesh;
  let tl: gsap.core.Timeline | null = null;
  const pop = { k: 0 };
  const params = { relief: 1 };

  function play() {
    tl?.kill();
    pop.k = 0;
    tl = gsap.timeline();
    tl.to(pop, { k: 1, duration: 1.3, ease: EASE.settle, delay: 0.5, onStart: () => (ctx.sfx.whoosh(0.5, 0.2, true), ctx.sfx.chime(rarity(ctx.rarity).tier, 0.12)) });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      stage = createStage(c, { bg: ['#25211d', '#090807'], env: 'studio', fill: 0.66 });
      const key = new DirectionalLight(0xfff2e4, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      const cd = cardForRarity(c.rarity);
      const { art, back } = await cardArtFor(cd, c.rarity, c.bag);

      // face sans le sujet (il sort de la carte)
      const bg = texture(art.bg), fg = texture(art.fg), fr = texture(art.frame);
      const ao = mix(float(0.5), float(1), smoothstep(0.0, 0.035, windowSDF(uv()).negate()));
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = mix(mix(bg.rgb.mul(ao).mul(0.8), fg.rgb, fg.a), fr.rgb, fr.a);
      m.roughnessNode = float(0.55);
      m.clearcoatNode = float(0.3);
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      rig.add(card);

      const geo = inflateSubject(art.canvases.subject, art.canvases.fx, rar, cd.seed, c.quality);
      splat = new GaussianSplat(geo);
      splat.position.z = CARD.t / 2 + 0.001;
      rig.add(splat);
      c.bag.add(geo);
      c.bag.fn(() => (splat as unknown as { dispose?: () => void }).dispose?.());

      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add(params, 'relief', 0, 2.5, 0.01).name('relief');
      c.gui.add({ n: geo.getAttribute('position').count }, 'n').name('gaussiennes').disable();
      play();
    },
    replay() {
      play();
    },
    update(_dt, t) {
      const p = ctx.input.pose(0.55);
      rig.rotation.set(p.x, p.y, 0);
      const idle = ctx.input.inside || ctx.input.gyroEnabled ? 0 : 1;
      rig.rotation.y += Math.sin(t * 0.5) * 0.35 * idle;
      rig.rotation.x += Math.sin(t * 0.33) * 0.1 * idle;
      splat.scale.set(1, 1, Math.max(0.001, pop.k * params.relief));
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
