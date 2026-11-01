import { Color, DirectionalLight, HalfFloatType, MeshPhysicalNodeMaterial, Raycaster, StorageTexture, Vector2, type Mesh } from 'three/webgpu';
import {
  Fn,
  NodeAccess,
  clamp,
  exp,
  float,
  floor,
  fract,
  instanceIndex,
  int,
  ivec2,
  length,
  max,
  mix,
  normalMap,
  smoothstep,
  storageTexture,
  texture,
  textureStore,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  hue,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardLayers, createBackMaterial, createEdgeMaterial, WINDOW_UV } from '../../core/cardMaterial';
import { createCardMesh } from '../../core/cardModel';
import { encodeNormal, type N } from '../../core/tsl';

const INKS: Array<[string, string]> = [
  ['#1b1a19', '#8d877c'],
  ['#203b2b', '#a9c79a'],
  ['#1b2f5c', '#8fb3ee'],
  ['#55121f', '#f08a9a'],
  ['#5b3a0b', '#ffcf6e'],
  ['#15121e', '#f4efe6'],
];

/**
 * 014 — Encre fluide (suminagashi).
 * Fluide 2D incompressible simulé en compute sur des **storage textures** (ping-pong) : advection semi-lagrangienne,
 * divergence, Jacobi, projection ; une encre colorée flotte sur l'illustration et se laisse remuer au doigt.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const quality = { W: 160, H: 224, iters: 24 };
  const U = {
    dt: uniform(0.016),
    mouse: uniform(new Vector2(-10, -10)),
    force: uniform(new Vector2(0, 0)),
    radius: uniform(10),
    ink: uniform(0),
    time: uniform(0),
    stir: uniform(1),
    c1: uniform(new Color('#000')),
    c2: uniform(new Color('#fff')),
    seed: uniform(0),
  };
  const params = { radius: 10, stir: 1, iterations: 24, dissipation: 0.9985 };
  const DISS = uniform(0.9985);
  let steps: { init: N; advV: N; div: N; jacA: N; jacB: N; grad: N; advDye: N; copyDye: N };
  const ray = new Raycaster();
  const prevUv = new Vector2(-1, -1);
  let tPrev = 0;

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      if (c.quality === 'mobile') Object.assign(quality, { W: 112, H: 156, iters: 14 });
      params.iterations = quality.iters;
      U.c1.value.set(INKS[rar.tier][0]);
      U.c2.value.set(INKS[rar.tier][1]);
      c.input.spinEnabled = false; // le drag remue l'encre
      stage = createStage(c, { bg: ['#29251f', '#0c0b0a'], env: 'gallery', envIntensity: 0.9, fill: 0.74 });
      const key = new DirectionalLight(0xfff3e6, 1.4);
      key.position.set(-1.5, 2, 3);
      stage.scene.add(key);

      const { W, H } = quality;
      const mk = () => {
        const t = new StorageTexture(W, H);
        t.type = HalfFloatType;
        return c.bag.add(t);
      };
      const velA = mk(), velB = mk(), dyeA = mk(), dyeB = mk(), divT = mk(), pA = mk(), pB = mk();
      const R = (t: StorageTexture) => storageTexture(t).setAccess(NodeAccess.READ_ONLY);
      const Wr = (t: StorageTexture) => storageTexture(t).setAccess(NodeAccess.WRITE_ONLY);
      const cell = () => {
        const x = int(instanceIndex.mod(W)) as N, y = int(instanceIndex.div(W)) as N;
        return { x, y, c: ivec2(x, y), p: vec2(float(x), float(y)) as N };
      };
      const ld = (t: N, x: N, y: N): N => t.load(ivec2((x as N).clamp(0, W - 1), (y as N).clamp(0, H - 1)));
      // échantillonnage bilinéaire manuel (4 loads)
      const bilerp = (t: N, p: N): N => {
        const q = p.sub(0.5);
        const i = floor(q) as N, f = fract(q) as N;
        const x0 = int(i.x), y0 = int(i.y);
        const a = ld(t, x0, y0), b = ld(t, x0.add(1), y0), cc = ld(t, x0, y0.add(1)), d = ld(t, x0.add(1), y0.add(1));
        return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
      };
      const splat = (p: N) => exp(length(p.sub(U.mouse)).pow(2).div(U.radius.mul(U.radius)).negate());

      const init = Fn(() => {
        const { c: ci, p } = cell();
        // gouttes concentriques (suminagashi) autour de 3 centres
        const cA = vec2(W * 0.32, H * 0.6), cB = vec2(W * 0.68, H * 0.42), cC = vec2(W * 0.5, H * 0.78);
        const ring = (cc: N, k: number) => sin(length(p.sub(cc)).mul(0.55).add(k)).mul(0.5).add(0.5);
        const r1 = ring(cA, 0).mul(exp(length(p.sub(cA)).div(W * 0.35).negate()));
        const r2 = ring(cB, 2).mul(exp(length(p.sub(cB)).div(W * 0.3).negate()));
        const r3 = ring(cC, 4).mul(exp(length(p.sub(cC)).div(W * 0.25).negate()));
        const a1 = smoothstep(0.45, 0.6, r1.add(r3)).mul(0.9);
        const a2 = smoothstep(0.45, 0.6, r2).mul(0.85);
        const col = vec3(U.c1 as unknown as N).mul(a1).add(vec3(U.c2 as unknown as N).mul(a2));
        textureStore(Wr(dyeA), ci, vec4(col, max(a1, a2)));
        textureStore(Wr(velA), ci, vec4(0));
        textureStore(Wr(pA), ci, vec4(0));
      })().compute(W * H);

      const advV = Fn(() => {
        const { c: ci, p } = cell();
        const v = ld(R(velA), cell().x, cell().y).xy;
        const back = p.add(0.5).sub(v.mul(U.dt));
        const adv = bilerp(R(velA), back).xy.mul(0.995);
        // force du doigt + léger brassage ambiant (rotationnel) pour que l'encre vive
        const f = U.force.mul(splat(p));
        const amb = vec2(sin(p.y.mul(0.09).add(U.time.mul(0.3))), cos(p.x.mul(0.08).sub(U.time.mul(0.25)))).mul(1.6).mul(U.stir);
        textureStore(Wr(velB), ci, vec4(adv.add(f).add(amb.mul(U.dt)), 0, 1));
      })().compute(W * H);

      const div = Fn(() => {
        const { c: ci, x, y } = cell();
        const l = ld(R(velB), x.sub(1), y).x, r = ld(R(velB), x.add(1), y).x;
        const b = ld(R(velB), x, y.sub(1)).y, t = ld(R(velB), x, y.add(1)).y;
        textureStore(Wr(divT), ci, vec4(r.sub(l).add(t.sub(b)).mul(0.5), 0, 0, 1));
      })().compute(W * H);

      const jac = (src: StorageTexture, dst: StorageTexture) =>
        Fn(() => {
          const { c: ci, x, y } = cell();
          const l = ld(R(src), x.sub(1), y).x, r = ld(R(src), x.add(1), y).x;
          const b = ld(R(src), x, y.sub(1)).x, t = ld(R(src), x, y.add(1)).x;
          const d = ld(R(divT), x, y).x;
          textureStore(Wr(dst), ci, vec4(l.add(r).add(b).add(t).sub(d).mul(0.25), 0, 0, 1));
        })().compute(W * H);

      const grad = Fn(() => {
        const { c: ci, x, y } = cell();
        const l = ld(R(pA), x.sub(1), y).x, r = ld(R(pA), x.add(1), y).x;
        const b = ld(R(pA), x, y.sub(1)).x, t = ld(R(pA), x, y.add(1)).x;
        const v = ld(R(velB), x, y).xy.sub(vec2(r.sub(l), t.sub(b)).mul(0.5));
        // parois : vitesse nulle sur le bord
        const wall = float(x.greaterThan(0).and(x.lessThan(W - 1)).and(y.greaterThan(0)).and(y.lessThan(H - 1)));
        textureStore(Wr(velA), ci, vec4(v.mul(wall), 0, 1));
      })().compute(W * H);

      const advDye = Fn(() => {
        const { c: ci, p } = cell();
        const v = ld(R(velA), cell().x, cell().y).xy;
        const back = p.add(0.5).sub(v.mul(U.dt));
        const d = bilerp(R(dyeA), back).mul(DISS);
        // encre injectée au doigt (teinte qui tourne pour le mythique)
        const s = splat(p).mul(U.ink);
        const ic = rar.tier === 5 ? hue(vec3(0.95, 0.75, 0.6), U.time.mul(0.8)) : mix(vec3(U.c1 as unknown as N), vec3(U.c2 as unknown as N), sin(U.time.mul(1.7)).mul(0.5).add(0.5));
        const add = vec4(ic.mul(s), s);
        const o = d.add(add.mul(0.35));
        textureStore(Wr(dyeB), ci, vec4(o.rgb, clamp(o.a, 0, 1.2)));
      })().compute(W * H);

      const copyDye = Fn(() => {
        const { c: ci, x, y } = cell();
        textureStore(Wr(dyeA), ci, ld(R(dyeB), x, y));
      })().compute(W * H);

      steps = { init, advV, div, jacA: jac(pA, pB), jacB: jac(pB, pA), grad, advDye, copyDye };

      // ── matériau : encre au-dessus de l'illustration, dans la fenêtre
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const L = cardLayers(art, { bg: 0.02, subject: 0.01, fg: -0.002 });
      const wuv = uv().sub(vec2(WINDOW_UV.cx - WINDOW_UV.hx, WINDOW_UV.cy - WINDOW_UV.hy)).div(vec2(WINDOW_UV.hx * 2, WINDOW_UV.hy * 2));
      const dye = texture(dyeA, wuv);
      const e = 1 / W;
      const dx = texture(dyeA, wuv.add(vec2(e, 0))).a.sub(texture(dyeA, wuv.sub(vec2(e, 0))).a);
      const dy = texture(dyeA, wuv.add(vec2(0, e))).a.sub(texture(dyeA, wuv.sub(vec2(0, e))).a);
      const a = clamp(dye.a, 0, 1).mul(L.window);
      const inkCol = dye.rgb.div(max(dye.a, 0.001));
      // l'encre se dépose comme une teinture (multiplicative) + pellicule brillante
      const art2 = L.color.mul(mix(vec3(1), inkCol.mul(1.15), a.mul(0.92)));
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = art2;
      m.roughnessNode = mix(mix(float(0.6), float(0.4), L.window), float(0.08), a);
      m.metalnessNode = float(0);
      m.normalNode = normalMap(encodeNormal(vec3(dx.mul(-3), dy.mul(-3), 1).normalize()));
      m.clearcoatNode = a.mul(0.9);
      m.clearcoatRoughnessNode = float(0.06);
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      stage.scene.add(card);
      c.renderer.compute(steps.init);
      await stage.compile();

      c.gui.add(params, 'radius', 3, 30, 0.5).name('rayon du doigt').onChange((v: number) => (U.radius.value = v));
      c.gui.add(params, 'stir', 0, 4, 0.01).name('brassage ambiant').onChange((v: number) => (U.stir.value = v));
      c.gui.add(params, 'iterations', 4, 60, 1).name('itérations Jacobi');
      c.gui.add(params, 'dissipation', 0.98, 1, 0.0005).name('persistance encre').onChange((v: number) => (DISS.value = v));
    },
    replay() {
      ctx.renderer.compute(steps.init);
    },
    update(dt, t) {
      // pose douce (le drag sert à l'encre)
      const p = ctx.input;
      card.rotation.set(-p.tiltY * 0.12, p.tiltX * 0.16, 0);
      // doigt → UV de la carte → cellule de la grille
      U.force.value.set(0, 0);
      U.ink.value = 0;
      if (p.inside || p.down) {
        ray.setFromCamera(new Vector2(p.ndcX, p.ndcY), stage.camera);
        const hit = ray.intersectObject(card, false)[0];
        if (hit?.uv) {
          const wu = (hit.uv.x - (WINDOW_UV.cx - WINDOW_UV.hx)) / (WINDOW_UV.hx * 2);
          const wv = (hit.uv.y - (WINDOW_UV.cy - WINDOW_UV.hy)) / (WINDOW_UV.hy * 2);
          const gx = wu * quality.W, gy = wv * quality.H;
          U.mouse.value.set(gx, gy);
          if (prevUv.x > -1 && t - tPrev < 0.2) {
            const k = 1 / Math.max(dt, 1 / 120);
            U.force.value.set((gx - prevUv.x) * k * 1.4, (gy - prevUv.y) * k * 1.4);
            U.ink.value = p.down ? 1 : 0.25;
          }
          prevUv.set(gx, gy);
          tPrev = t;
        } else prevUv.set(-1, -1);
      } else prevUv.set(-1, -1);
      U.dt.value = Math.min(dt, 1 / 30);
      U.time.value = t;
      const r = ctx.renderer;
      r.compute(steps.advV);
      r.compute(steps.div);
      for (let i = 0; i < params.iterations; i++) r.compute(i % 2 ? steps.jacB : steps.jacA);
      if (params.iterations % 2) r.compute(steps.jacB);
      r.compute(steps.grad);
      r.compute(steps.advDye);
      r.compute(steps.copyDye);
      r.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
