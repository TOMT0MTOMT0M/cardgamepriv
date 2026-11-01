import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  attribute,
  cameraPosition,
  clamp,
  cross,
  exp,
  float,
  hash,
  hue,
  instanceIndex,
  instancedArray,
  int,
  mix,
  mx_noise_vec3,
  normalize,
  select,
  smoothstep,
  uniform,
  vec3,
  vec4,
  max,
  min,
  abs,
  sign,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { CARD } from '../../core/cardModel';
import { EASE, anticipate } from '../../core/ease';
import type { N } from '../../core/tsl';

const K = 9; // points d'historique par traînée

interface Mode {
  count: number;
  spawn: 0 | 1 | 2 | 3; // 0 surface, 1 pourtour, 2 derrière (fontaine), 3 coquille lointaine (convergence)
  speed: number;
  orbit: number;
  curl: number;
  freq: number;
  drag: number;
  gravity: number;
  life: [number, number];
  width: number;
  attract: number;
  color: string;
}

/** Une personnalité de burst par tier : quantité ET comportement. */
const MODES: Mode[] = [
  { count: 160, spawn: 0, speed: 0.08, orbit: 0, curl: 0.15, freq: 2, drag: 2.5, gravity: -0.35, life: [1.2, 2], width: 0.0025, attract: 0, color: '#bdb6a8' },
  { count: 400, spawn: 0, speed: 0.15, orbit: 0, curl: 0.35, freq: 2.2, drag: 1.2, gravity: 0.1, life: [2, 3.5], width: 0.0022, attract: 0, color: '#a9cf9a' },
  { count: 1500, spawn: 1, speed: 0.75, orbit: 0, curl: 0.7, freq: 2.6, drag: 2.2, gravity: 0, life: [1.4, 2.4], width: 0.0026, attract: 0, color: '#8fb3ee' },
  { count: 4000, spawn: 1, speed: 0.55, orbit: 2.6, curl: 0.7, freq: 2.4, drag: 1.25, gravity: 0, life: [2, 3.2], width: 0.0026, attract: 0, color: '#f08a9a' },
  { count: 12000, spawn: 2, speed: 1.8, orbit: 0.3, curl: 0.55, freq: 2, drag: 0.55, gravity: -1.25, life: [2.4, 4], width: 0.0022, attract: 0, color: '#ffc861' },
  { count: 30000, spawn: 3, speed: 0.25, orbit: 0.9, curl: 1.3, freq: 3, drag: 0.8, gravity: 0, life: [4, 6.5], width: 0.0018, attract: 1, color: '#f5efe2' },
];

/** Bande de traînée : K points × 2 côtés, attributs `seg` et `side`. */
function ribbonGeometry(): BufferGeometry {
  const pos: number[] = [], seg: number[] = [], side: number[] = [], idx: number[] = [];
  for (let s = 0; s < K; s++)
    for (const sd of [-1, 1]) {
      pos.push(0, 0, 0);
      seg.push(s);
      side.push(sd);
    }
  for (let s = 0; s < K - 1; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seg', new Float32BufferAttribute(seg, 1));
  g.setAttribute('side', new Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

/**
 * 009 — Bursts compute.
 * Simulation GPU (compute TSL) : bruit de curl, orbite, gravité, attraction ; historique de positions
 * en ring buffer pour de vraies traînées (rubans orientés caméra). Le comportement change avec le tier.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let mode: Mode;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  let initC: N, updC: N;
  let ribbons: Mesh;
  let tl: gsap.core.Timeline | null = null;
  const pose = { yaw: Math.PI, z: 0 };
  const U = {
    dt: uniform(0),
    time: uniform(0),
    burst: uniform(0), // 0 = en attente, 1 = lâché
    attract: uniform(0),
    push: uniform(0),
    curl: uniform(1),
    speed: uniform(1),
    tint: uniform(new Color('#ffffff')),
    intensity: uniform(1),
  };
  const params = { curl: 1, speed: 1, intensity: 1 };

  function play() {
    tl?.kill();
    ctx.renderer.compute(initC);
    U.burst.value = 0;
    U.attract.value = mode.attract;
    U.push.value = 0;
    Object.assign(pose, { yaw: Math.PI, z: 0 });
    tl = gsap.timeline();
    tl.to(pose, { z: -0.08, yaw: Math.PI + 0.2, duration: 0.45 + rar.tier * 0.12, ease: EASE.breathe }, 0.2)
      .to(pose, { yaw: 0, z: 0.05, duration: 0.6, ease: anticipate(0.6) })
      .call(() => {
        U.burst.value = 1;
        ctx.sfx.whoosh(0.4, 0.2);
        if (rar.tier >= 1) ctx.sfx.chime(rar.tier, 0.15);
        if (rar.tier >= 4) ctx.sfx.shimmer(rar.tier, 3, 0.08);
      }, [], '-=0.32')
      .to(pose, { z: 0, duration: 1, ease: EASE.settle });
    if (mode.attract > 0)
      tl.to(U.attract, { value: 0, duration: 0.25, ease: 'power2.in' }, '+=1.1')
        .to(U.push, { value: 9, duration: 0.08, ease: 'none', onStart: () => (ctx.sfx.thump(0.4), ctx.sfx.shimmer(5, 2.5, 0.1)) }, '<')
        .to(U.push, { value: 0, duration: 0.5, ease: EASE.glide });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      mode = MODES[rar.tier];
      U.tint.value.set(mode.color);
      stage = createStage(c, { bg: ['#1f1c1a', '#070606'], env: 'studio', fill: 0.56 });
      const key = new DirectionalLight(0xfff2e4, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(art, back);
      rig.add(card.mesh);

      // ── buffers GPU
      const n = Math.max(64, Math.round(mode.count * (c.quality === 'mobile' ? 0.35 : 1)));
      const pos = instancedArray(n, 'vec4'); // xyz + âge
      const vel = instancedArray(n, 'vec4'); // xyz + durée de vie
      const trail = instancedArray(n * K, 'vec3');
      const hw = CARD.w / 2, hh = CARD.h / 2;

      const spawnPoint = Fn(([i]: [N]) => {
        const h1 = hash(i), h2 = hash(i.add(17)), h3 = hash(i.add(91));
        const surf = vec3(h1.sub(0.5).mul(CARD.w), h2.sub(0.5).mul(CARD.h), h3.sub(0.5).mul(0.02));
        // pourtour : paramétrage du rectangle
        const t = h1.mul(2 * (CARD.w + CARD.h));
        const onW = t.lessThan(CARD.w * 2);
        const px = select(onW, t.mod(CARD.w).sub(hw), select(t.sub(CARD.w * 2).lessThan(CARD.h), float(hw), float(-hw)));
        const py = select(onW, select(t.lessThan(CARD.w), float(-hh), float(hh)), t.sub(CARD.w * 2).mod(CARD.h).sub(hh));
        const rim = vec3(px, py, h3.sub(0.5).mul(0.02));
        const behind = vec3(h1.sub(0.5).mul(CARD.w * 0.9), float(hh * 0.85).add(h2.mul(0.04)), float(-0.05).sub(h3.mul(0.05)));
        const dirS = normalize(vec3(h1.sub(0.5), h2.sub(0.5), h3.sub(0.5).mul(0.6)).add(vec3(0, 0, 0.0001)));
        const shellP = dirS.mul(h2.mul(0.8).add(1.2));
        return mode.spawn === 0 ? surf : mode.spawn === 1 ? rim : mode.spawn === 2 ? behind : shellP;
      });

      initC = Fn(() => {
        const i = instanceIndex;
        const p = spawnPoint(float(i));
        const h4 = hash(i.add(333)), h5 = hash(i.add(777)), h6 = hash(i.add(1999));
        const life = mix(float(mode.life[0]), float(mode.life[1]), h4);
        // vitesse initiale : radiale (pourtour), verticale (surface), cône (fontaine)
        const radial = normalize(vec3(p.x, p.y, 0).add(vec3(0, 0, 0.0001))).mul(mode.speed).mul(h5.mul(0.6).add(0.7));
        const cone = vec3(h5.sub(0.5).mul(1.6), float(1), h6.sub(0.6).mul(0.8)).mul(mode.speed).mul(h4.mul(0.5).add(0.75));
        const up = vec3(h5.sub(0.5).mul(0.3), float(1), h6.sub(0.5).mul(0.3)).mul(mode.speed);
        const swirl = vec3(p.y.negate(), p.x, 0).normalize().mul(mode.speed);
        const v0 = mode.spawn === 1 ? radial.add(vec3(0, 0, h6.mul(0.25))) : mode.spawn === 2 ? cone : mode.spawn === 3 ? swirl : up;
        // délais d'émission étalés (les bursts ne partent pas tous à la même frame)
        const delay = h6.pow(2).mul(mode.spawn === 2 ? 1.6 : 0.5);
        pos.element(i).assign(vec4(p, delay.negate()));
        vel.element(i).assign(vec4(v0, life));
        Loop({ start: int(0), end: int(K), type: 'int', condition: '<' }, ({ i: j }: { i: N }) => {
          trail.element(i.mul(K).add(j)).assign(p);
        });
      })().compute(n);

      updC = Fn(() => {
        const i = instanceIndex;
        const P = pos.element(i);
        const V = vel.element(i);
        const dt = U.dt;
        If(U.burst.greaterThan(0.5), () => {
          P.w.addAssign(dt);
        });
        If(P.w.greaterThan(0).and(P.w.lessThan(V.w)), () => {
          const p = P.xyz;
          // bruit de curl par différences finies d'un potentiel vectoriel
          const q = p.mul(mode.freq).add(vec3(0, 0, U.time.mul(0.15)));
          const e = 0.05;
          const dx = mx_noise_vec3(q.add(vec3(e, 0, 0))).sub(mx_noise_vec3(q.sub(vec3(e, 0, 0))));
          const dy = mx_noise_vec3(q.add(vec3(0, e, 0))).sub(mx_noise_vec3(q.sub(vec3(0, e, 0))));
          const dz = mx_noise_vec3(q.add(vec3(0, 0, e))).sub(mx_noise_vec3(q.sub(vec3(0, 0, e))));
          const curl = vec3(dy.z.sub(dz.y), dz.x.sub(dx.z), dx.y.sub(dy.x)).div(2 * e);
          const orbit = vec3(p.y.negate(), p.x, 0).normalize().mul(mode.orbit);
          // attraction vers le contour de la carte (mythique : les particules dessinent la carte avant d'exploser)
          const tgt = vec3(clamp(p.x, -hw, hw), clamp(p.y, -hh, hh), 0);
          const edgeX = select(abs(p.x).div(hw).greaterThan(abs(p.y).div(hh)), sign(p.x).mul(hw), tgt.x);
          const edgeY = select(abs(p.x).div(hw).greaterThan(abs(p.y).div(hh)), tgt.y, sign(p.y).mul(hh));
          const attract = vec3(edgeX, edgeY, 0).sub(p).mul(U.attract.mul(18));
          const push = normalize(vec3(p.x, p.y, p.z.mul(0.3)).add(vec3(0, 0, 0.0001))).mul(U.push);
          const acc = curl.mul(mode.curl).mul(U.curl).add(orbit).add(vec3(0, mode.gravity, 0)).add(attract).add(push);
          const v = V.xyz.add(acc.mul(dt)).mul(exp(dt.mul(-mode.drag).mul(float(1).add(U.attract.mul(3)))));
          V.xyz.assign(v);
          P.xyz.assign(p.add(v.mul(dt).mul(U.speed)));
        });
        // historique (ring par décalage — K petit)
        const base = i.mul(K);
        Loop({ start: int(K - 1), end: int(0), type: 'int', condition: '>' }, ({ i: j }: { i: N }) => {
          trail.element(base.add(j)).assign(trail.element(base.add(j).sub(1)));
        });
        trail.element(base).assign(P.xyz);
      })().compute(n);

      // ── rubans orientés caméra
      const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      const s = attribute('seg', 'float');
      const sd = attribute('side', 'float');
      const si = int(s) as N;
      const base = int(instanceIndex).mul(K) as N;
      const p0 = trail.element(base.add(si));
      const p1 = trail.element(base.add(min(si.add(1), int(K - 1) as N)));
      const pm = trail.element(base.add(max(si.sub(1), int(0) as N)));
      const dir = p1.sub(pm).add(vec3(1e-5, 0, 0));
      const toCam = normalize(cameraPosition.sub(p0));
      const sideV = normalize(cross(dir, toCam));
      const P = pos.element(instanceIndex);
      const V = vel.element(instanceIndex);
      const lifeK = P.w.div(V.w);
      const alive = smoothstep(0.0, 0.04, P.w).mul(smoothstep(1.0, 0.7, lifeK));
      const taper = float(1).sub(s.div(K));
      mat.positionNode = p0.add(sideV.mul(sd).mul(mode.width).mul(taper.add(0.15)).mul(alive));
      const hash1 = hash(instanceIndex.add(4242));
      let col: N = vec3(U.tint as unknown as N).mul(hash1.mul(0.6).add(0.7));
      if (rar.tier === 5) col = hue(vec3(1.0, 0.82, 0.72), hash1.mul(6.283).add(U.time.mul(0.3)));
      const head = smoothstep(2.0, 0.0, s);
      // énergie totale à peu près constante quel que soit le nombre de particules (pas de mur blanc)
      const density = Math.min(1, Math.sqrt(1500 / n)) * 0.9;
      mat.colorNode = vec4(col.mul(taper.pow(1.6).mul(0.55).add(head.mul(0.9))).mul(U.intensity).mul(density), alive.mul(taper));
      ribbons = new Mesh(ribbonGeometry(), mat);
      ribbons.count = n;
      ribbons.frustumCulled = false;
      stage.scene.add(ribbons);
      c.bag.add(mat);
      c.bag.fn(() => {
        for (const b of [pos, vel, trail]) (b as unknown as { value: { dispose?: () => void } }).value.dispose?.();
      });

      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add(params, 'curl', 0, 3, 0.01).name('curl').onChange((v: number) => (U.curl.value = v));
      c.gui.add(params, 'speed', 0.1, 2, 0.01).name('vitesse').onChange((v: number) => (U.speed.value = v));
      c.gui.add(params, 'intensity', 0, 3, 0.01).name('intensité').onChange((v: number) => (U.intensity.value = v));
      c.gui.add({ n }, 'n').name('particules').disable();
      play();
    },
    replay() {
      play();
    },
    update(dt, t) {
      // sous-pas fixes : la longueur des traînées ne dépend pas du framerate
      const steps = Math.min(3, Math.max(1, Math.round(dt * 60)));
      U.dt.value = Math.min(dt, 1 / 20) / steps;
      U.time.value = t;
      for (let k = 0; k < steps; k++) ctx.renderer.compute(updC);
      const p = ctx.input.pose(0.22);
      rig.rotation.set(p.x, pose.yaw + p.y, 0);
      rig.position.z = pose.z;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
