import {
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardNodeMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  Color,
} from 'three/webgpu';
import {
  abs,
  color,
  cos,
  float,
  frontFacing,
  mix,
  positionLocal,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
  clamp,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { createPackGeometry, createPackMaterials, generatePackArt, PACK, PACK_STYLES, TEAR_V } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { EASE, Spring, anticipate, clamp as clampN } from '../../core/ease';
import type { N } from '../../core/tsl';

/**
 * 002 — Déchirure de l'emballage.
 * On tire le haut du booster : la déchirure avance par à-coups (stick-slip), le plastique blanchit
 * le long de la coupe, des lambeaux se détachent, puis la carte sort et se retourne.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const root = new Group();
  const packGroup = new Group();
  let strip: Mesh;
  let cardMesh: Mesh;
  const cardRig = new Group();
  let shreds: InstancedMesh;
  const P = uniform(0); // progression de la déchirure (0..1.08)
  const FLY = uniform(0);
  const shake = new Spring(0, 400, 18);
  let target = 0;
  let progress = 0;
  let phase: 'idle' | 'tearing' | 'opened' = 'idle';
  let autoTear: gsap.core.Tween | null = null;
  let tl: gsap.core.Timeline | null = null;
  const fly = { t: 0 };
  const STACK0 = { y: -0.08, flip: Math.PI, pull: 0 };
  const stack = { ...STACK0 };
  let camBase = new Vector3();
  const params = { resistance: 0.06, chunk: 0.045, autoDuration: 1.1 };

  // lambeaux (CPU, 90 instances)
  const NS = 90;
  const sh = Array.from({ length: NS }, () => ({ p: new Vector3(), v: new Vector3(), r: new Vector3(), w: new Vector3(), life: 0, s: 1 }));
  let shI = 0;
  const tmp = new Object3D();

  const yTear = (TEAR_V - 0.5) * PACK.h;
  // bord de coupe : somme de sinus incommensurables (bon marché, assez irrégulier)
  const jag = (u: N): N =>
    sin(u.mul(97))
      .mul(0.5)
      .add(sin(u.mul(231).add(1.3)).mul(0.3))
      .add(sin(u.mul(517).add(2.1)).mul(0.2))
      .mul(0.007)
      .add(abs(sin(u.mul(310))).mul(0.003));
  const edgeV = (u: N): N => float(TEAR_V).add(jag(u));

  function spawnShreds(u: number, n: number) {
    for (let k = 0; k < n; k++) {
      const s = sh[shI++ % NS];
      s.p.set((u - 0.5) * PACK.w + (Math.random() - 0.5) * 0.02, yTear + (Math.random() - 0.5) * 0.01, PACK.bulge * 0.6 * (Math.random() > 0.5 ? 1 : -1));
      s.v.set(-0.15 + Math.random() * 0.5, 0.25 + Math.random() * 0.5, 0.2 + Math.random() * 0.5);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      s.life = 1.4 + Math.random() * 0.8;
      s.s = 0.4 + Math.random() * 1.1;
    }
  }

  function setProgress(p: number) {
    const before = progress;
    progress = p;
    P.value = p;
    if (p > before + 0.001) {
      spawnShreds(Math.min(1, p), 2 + Math.floor((p - before) * 40));
      shake.impulse(2.2 + (p - before) * 30);
      ctx.sfx.tear(0.05 + (p - before) * 1.2, 0.25);
    }
    if (p >= 1.0 && phase === 'tearing') open();
  }

  function open() {
    phase = 'opened';
    ctx.input.spinEnabled = true;
    const tier = rarity(ctx.rarity).tier;
    tl = gsap.timeline();
    tl.to(fly, { t: 1, duration: 0.8, ease: EASE.glide, onStart: () => ctx.sfx.whoosh(0.45, 0.25) })
      .to(packGroup.rotation, { x: -0.18, duration: 0.6, ease: EASE.settle }, 0.15)
      .to(stack, { y: 1.0, duration: 1.0, ease: EASE.glide, onStart: () => ctx.sfx.whoosh(0.7, 0.15, true) }, 0.45)
      .to(stack, { pull: 1, duration: 0.8, ease: EASE.breathe }, 1.4)
      .to(packGroup.position, { y: -1.9, duration: 0.9, ease: EASE.heave }, 1.35)
      .to(stack, {
        flip: 0, duration: 0.75, ease: EASE.snap,
        onStart: () => ctx.sfx.whoosh(0.3, 0.2),
        onComplete: () => {
          ctx.sfx.thump(0.4);
          ctx.sfx.chime(tier, 0.16 + tier * 0.02);
        },
      }, 1.7);
    void anticipate;
  }

  function reset() {
    tl?.kill();
    autoTear?.kill();
    target = 0;
    progress = 0;
    P.value = 0;
    fly.t = 0;
    phase = 'idle';
    Object.assign(stack, STACK0);
    packGroup.position.set(0, 0, 0);
    packGroup.rotation.set(0, 0, 0);
    sh.forEach((s) => (s.life = 0));
    ctx.input.spinEnabled = false;
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#25211e', '#0b0a09'], env: 'studio', fill: 0.6, fillPortrait: 0.7, frameH: PACK.h, frameW: PACK.w });
      const { scene } = stage;
      const key = new DirectionalLight(0xfff0dc, 1.6);
      key.position.set(-1.5, 2.5, 3);
      scene.add(key);
      scene.add(root);
      root.add(packGroup);

      const art = c.bag.add(await generatePackArt(PACK_STYLES.ember));
      const geo = c.bag.add(createPackGeometry(36, 72));

      // ── corps : tout sous la ligne de déchirure ; intérieur argenté (double face)
      const bodyMats = createPackMaterials(art);
      const torn = (u: N) => smoothstep(0.0, 0.015, P.sub(u));
      const whiten = (u: N, v: N) => smoothstep(0.009, 0.0, abs(v.sub(edgeV(u)))).mul(torn(u));
      for (const m of bodyMats) {
        const u = uv().x, v = uv().y;
        m.side = DoubleSide;
        m.maskNode = v.lessThan(edgeV(u));
        const base = m.colorNode as N;
        const silver = color(0.62, 0.62, 0.6);
        m.colorNode = mix(select(frontFacing, base, silver), color(0.93, 0.92, 0.9), whiten(u, v).mul(0.85));
        m.metalnessNode = select(frontFacing, m.metalnessNode as N, float(1)).mul(whiten(u, v).oneMinus());
        m.roughnessNode = select(frontFacing, m.roughnessNode as N, float(0.32));
        c.bag.add(m);
      }
      const body = new Mesh(geo, bodyMats);
      packGroup.add(body);

      // ── bande supérieure : se décolle colonne par colonne, s'enroule, puis s'envole
      const stripMats = createPackMaterials(art);
      for (const m of stripMats) {
        const u = uv().x, v = uv().y;
        m.side = DoubleSide;
        m.maskNode = v.greaterThanEqual(edgeV(u));
        const t = clamp(P.sub(u).div(0.28), 0, 1);
        const dy = positionLocal.y.sub(yTear);
        const k = dy.div(PACK.h - (yTear + PACK.h / 2)).clamp(0, 1);
        const a = t.pow(1.3).mul(2.2).mul(k.mul(0.7).add(0.5)).add(FLY.mul(1.4));
        const y2 = float(yTear).add(dy.mul(cos(a))).sub(positionLocal.z.mul(sin(a)));
        const z2 = positionLocal.z.mul(cos(a)).add(dy.mul(sin(a)));
        const x2 = positionLocal.x.sub(t.mul(0.02));
        m.positionNode = vec3(x2, y2, z2);
        const base = m.colorNode as N;
        m.colorNode = mix(select(frontFacing, base, color(0.62, 0.62, 0.6)), color(0.93, 0.92, 0.9), whiten(u, v).mul(0.85));
        m.metalnessNode = select(frontFacing, m.metalnessNode as N, float(1)).mul(whiten(u, v).oneMinus());
        c.bag.add(m);
      }
      strip = new Mesh(geo, stripMats);
      packGroup.add(strip);

      // ── lambeaux
      const shredMat = new MeshStandardNodeMaterial({ side: DoubleSide });
      shredMat.colorNode = color(new Color('#d8b088'));
      shredMat.metalnessNode = float(0.85);
      shredMat.roughnessNode = float(0.3);
      c.bag.add(shredMat);
      const shredGeo = c.bag.add(new PlaneGeometry(0.014, 0.006));
      shreds = new InstancedMesh(shredGeo, shredMat, NS);
      shreds.frustumCulled = false;
      packGroup.add(shreds);

      // ── carte à l'intérieur (de dos)
      const { art: cardArt, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(cardArt, back);
      cardMesh = card.mesh;
      cardRig.add(cardMesh);
      root.add(cardRig);
      camBase = stage.camera.position.clone();
      c.bag.scene(stage.scene);

      c.bag.fn(() => {
        tl?.kill();
        autoTear?.kill();
      });

      // ── interaction : glisser horizontalement pour déchirer, tap = déchirure auto
      c.bag.fn(
        c.input.onTap(() => {
          if (phase === 'opened') return;
          phase = 'tearing';
          autoTear?.kill();
          const o = { v: target };
          autoTear = gsap.to(o, { v: 1.08, duration: params.autoDuration, ease: EASE.breathe, onUpdate: () => (target = o.v) });
        }),
      );
      reset();
      c.gui.add(params, 'resistance', 0, 0.2, 0.005).name('résistance initiale');
      c.gui.add(params, 'chunk', 0.01, 0.12, 0.005).name('à-coups (stick-slip)');
      c.gui.add(params, 'autoDuration', 0.4, 3, 0.05).name('durée auto (tap)');
    },
    replay() {
      reset();
      ctx.sfx.tick(0.8);
    },
    update(dt, tt) {
      const input = ctx.input;
      // glisser : la cible avance avec le geste (droite = déchirer)
      if (phase !== 'opened' && input.dragging) {
        phase = 'tearing';
        target = clampN(target + Math.max(0, input.dragDX) / ((ctx.canvas.clientWidth || 800) * 0.45), 0, 1.08);
      }
      // stick-slip : la déchirure accroche puis cède par paquets
      const gap = target - progress;
      const threshold = progress < 0.02 ? params.resistance : params.chunk * (0.5 + Math.random());
      if (phase === 'tearing' && gap > threshold) setProgress(Math.min(target, progress + gap * (0.7 + Math.random() * 0.3)));

      // tension visible avant la première rupture
      const tension = phase === 'tearing' && progress < 0.02 ? clampN(gap / Math.max(0.001, params.resistance)) : 0;

      shake.update(dt);
      const pose = input.pose(0.22);
      root.rotation.set(pose.x * (phase === 'opened' ? 0.3 : 1), pose.y * (phase === 'opened' ? 0.3 : 1), 0);
      packGroup.rotation.z = -tension * 0.05 + shake.value * 0.004;
      packGroup.position.x = shake.value * 0.002;

      FLY.value = fly.t;
      strip.position.set(fly.t * 0.9, fly.t * 0.55, fly.t * 0.5);
      strip.rotation.z = -fly.t * 0.9;
      strip.visible = fly.t < 0.999;

      // carte : sort du paquet (la caméra l'accompagne), vient vers nous et se retourne
      const cy = stack.y * (1 - stack.pull);
      cardRig.position.set(0, cy + Math.sin(tt * 1.3) * 0.004 * stack.pull, stack.pull * 0.32);
      const live = phase === 'opened' && stack.flip < 0.05;
      const cardPose = input.pose(0.3);
      cardMesh.rotation.set(live ? cardPose.x : 0, stack.flip + (live ? cardPose.y : 0), 0);
      stage.camera.position.set(camBase.x, camBase.y + cy * 0.5, camBase.z + Math.sin(Math.min(1, stack.y) * Math.PI) * 0.15);
      stage.camera.lookAt(0, cy * 0.5, 0);

      // lambeaux
      for (let i = 0; i < NS; i++) {
        const s = sh[i];
        if (s.life > 0) {
          s.life -= dt;
          s.v.y -= 1.6 * dt;
          s.v.multiplyScalar(Math.exp(-1.8 * dt));
          s.p.addScaledVector(s.v, dt);
          s.r.addScaledVector(s.w, dt);
          tmp.position.copy(s.p);
          tmp.rotation.set(s.r.x, s.r.y, s.r.z);
          tmp.scale.setScalar(s.s * Math.min(1, s.life * 2));
        } else tmp.scale.setScalar(0);
        tmp.updateMatrix();
        shreds.setMatrixAt(i, tmp.matrix);
      }
      shreds.instanceMatrix.needsUpdate = true;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
      camBase = stage.camera.position.clone();
    },
    dispose() {},
  };
}
