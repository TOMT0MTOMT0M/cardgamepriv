import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Plane,
  Quaternion,
  Raycaster,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  attribute,
  color,
  exp,
  float,
  hash,
  instanceIndex,
  length,
  positionWorld,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { createPackMaterials, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { EASE, Spring, rng } from '../../core/ease';
import type { N } from '../../core/tsl';

type P2 = [number, number];
const SHELL_T = 0.014;

/** Voronoï 2D par découpe de demi-plans (N petit → O(N²) suffit), clippé au rectangle du paquet. */
function voronoiCells(seeds: P2[], w: number, h: number): P2[][] {
  const rect: P2[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return seeds.map((s, i) => {
    let poly = rect.slice();
    for (let j = 0; j < seeds.length && poly.length; j++) {
      if (i === j) continue;
      const o = seeds[j];
      const nx = o[0] - s[0], ny = o[1] - s[1];
      const c = nx * (s[0] + o[0]) * 0.5 + ny * (s[1] + o[1]) * 0.5;
      const out: P2[] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
        if (da <= 0) out.push(a);
        if (da * db < 0) {
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      poly = out;
    }
    return poly;
  });
}

/** Prisme d'un éclat, centré sur son centroïde. Groupes : face, dos, tranche. Attribut `edge` (0 bord → 1 centre). */
function shardGeometry(poly: P2[], cx: number, cy: number): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], edge: number[] = [], idx: number[] = [];
  const W = PACK.w, H = PACK.h, t = SHELL_T / 2;
  const groups: Array<[number, number, number]> = [];
  for (const side of [1, -1]) {
    const start = idx.length;
    const base = pos.length / 3;
    pos.push(0, 0, side * t);
    nor.push(0, 0, side);
    uvs.push(side > 0 ? (cx + W / 2) / W : 1 - (cx + W / 2) / W, (cy + H / 2) / H);
    edge.push(1);
    for (const [x, y] of poly) {
      pos.push(x - cx, y - cy, side * t);
      nor.push(0, 0, side);
      uvs.push(side > 0 ? (x + W / 2) / W : 1 - (x + W / 2) / W, (y + H / 2) / H);
      edge.push(0);
    }
    for (let k = 0; k < poly.length; k++) {
      const a = base + 1 + k, b = base + 1 + ((k + 1) % poly.length);
      if (side > 0) idx.push(base, a, b);
      else idx.push(base, b, a);
    }
    groups.push([start, idx.length - start, side > 0 ? 0 : 1]);
  }
  const start = idx.length;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    const nx = ey / l, ny = -ex / l;
    const base = pos.length / 3;
    for (const [p, z] of [[a, t], [b, t], [b, -t], [a, -t]] as Array<[P2, number]>) {
      pos.push(p[0] - cx, p[1] - cy, z);
      nor.push(nx, ny, 0);
      uvs.push(0, 0);
      edge.push(0);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  groups.push([start, idx.length - start, 2]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('edge', new Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  groups.forEach(([s, c, m]) => g.addGroup(s, c, m));
  g.computeBoundingSphere();
  return g;
}

/**
 * 008 — Shatter.
 * Le paquet est une coque rigide. L'impact fait courir des fissures lumineuses (anticipation),
 * puis la coque éclate en cellules de Voronoï densifiées autour du point d'impact — physique Rapier.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let world: RAPIER.World | null = null;
  const shell = new Group();
  const cardRig = new Group();
  const shards: Array<{ mesh: Mesh; body: RAPIER.RigidBody | null; home: Vector3; cx: number; cy: number }> = [];
  const IMPACT = uniform(new Vector3(0, 0, 0));
  const CRACK = uniform(0); // rayon de propagation des fissures
  const GLOW = uniform(0);
  const SP = uniform(0); // temps écoulé depuis le bris (étincelles)
  const TINT = uniform(new Color('#ffffff'));
  const TINTn = TINT as unknown as N;
  let state: 'intact' | 'cracking' | 'broken' = 'intact';
  let acc = 0;
  let timeScale = 1;
  let tl: gsap.core.Timeline | null = null;
  const reveal = { k: 0 };
  const shake = new Spring(0, 300, 12);
  const ray = new Raycaster();
  const hit = new Vector3();
  const params = { force: 1, gravity: 4.5, shards: 0 };
  let packMats: MeshStandardNodeMaterial[] = [];

  function clearShards() {
    shards.forEach((s) => {
      s.mesh.geometry.dispose();
      shell.remove(s.mesh);
    });
    shards.length = 0;
    world?.free();
    world = null;
  }

  function buildShards(impact: Vector2) {
    clearShards();
    const n = params.shards || 16 + rar.tier * 6 + (ctx.quality === 'mobile' ? -6 : 0);
    const r = rng(Math.floor(impact.x * 1000 + impact.y * 7919) + 3);
    const seeds: P2[] = [];
    for (let i = 0; i < n; i++) {
      if (i < n * 0.55) {
        // densité autour de l'impact (rayon log-normal)
        const a = r() * Math.PI * 2, d = Math.pow(r(), 1.7) * 0.42;
        seeds.push([Math.max(-PACK.w / 2 + 0.01, Math.min(PACK.w / 2 - 0.01, impact.x + Math.cos(a) * d)), Math.max(-PACK.h / 2 + 0.01, Math.min(PACK.h / 2 - 0.01, impact.y + Math.sin(a) * d))]);
      } else seeds.push([(r() - 0.5) * PACK.w, (r() - 0.5) * PACK.h]);
    }
    const cells = voronoiCells(seeds, PACK.w, PACK.h).filter((p) => p.length >= 3);
    for (const poly of cells) {
      let cx = 0, cy = 0;
      poly.forEach(([x, y]) => ((cx += x), (cy += y)));
      cx /= poly.length;
      cy /= poly.length;
      const mesh = new Mesh(shardGeometry(poly, cx, cy), packMats);
      mesh.position.set(cx, cy, 0);
      shell.add(mesh);
      shards.push({ mesh, body: null, home: new Vector3(cx, cy, 0), cx, cy });
    }
  }

  function shatter() {
    state = 'broken';
    world = new RAPIER.World({ x: 0, y: -params.gravity, z: 0 });
    // sol invisible
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.95, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.05, 4).setRestitution(0.25).setFriction(0.7), ground);
    const imp = IMPACT.value;
    const T = rar.tier;
    const force = params.force * (0.55 + T * 0.12);
    shell.updateMatrixWorld();
    for (const s of shards) {
      const wp = s.mesh.getWorldPosition(new Vector3());
      const q = s.mesh.getWorldQuaternion(new Quaternion());
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.35).setAngularDamping(0.25),
      );
      const verts = s.mesh.geometry.getAttribute('position').array as Float32Array;
      const col = RAPIER.ColliderDesc.convexHull(new Float32Array(verts)) ?? RAPIER.ColliderDesc.ball(0.03);
      world.createCollider(col.setDensity(0.6).setRestitution(0.3).setFriction(0.6), body);
      const dir = new Vector3(wp.x - imp.x, wp.y - imp.y, 0);
      const d = dir.length();
      dir.normalize();
      const k = force * Math.exp(-d * 2.2);
      body.setLinvel({ x: dir.x * k * 1.6, y: dir.y * k * 1.6 + 0.4, z: 0.9 * k + 0.25 + Math.random() * 0.3 }, true);
      body.setAngvel({ x: (Math.random() - 0.5) * 9 * k, y: (Math.random() - 0.5) * 9 * k, z: (Math.random() - 0.5) * 6 * k }, true);
      s.body = body;
    }
    shake.impulse(8 + T * 6);
    ctx.sfx.crack(0.45 + T * 0.05);
    ctx.sfx.thump(0.35);
    timeScale = rar.slowmo;
    gsap.to({ v: rar.slowmo }, { v: 1, duration: 1.2, ease: 'power2.in', onUpdate() {
      timeScale = (this.targets()[0] as { v: number }).v;
    } });
    tl = gsap.timeline();
    tl.to(GLOW, { value: 0, duration: 0.8, ease: EASE.glide })
      .to(reveal, { k: 1, duration: 1.2, ease: EASE.settle, onStart: () => ctx.sfx.chime(T, 0.16) }, 0.35);
  }

  function strike(at: Vector2) {
    if (state !== 'intact') return;
    state = 'cracking';
    IMPACT.value.set(at.x, at.y, 0);
    shell.localToWorld(IMPACT.value);
    buildShards(at);
    ctx.sfx.tick(0.6, 0.4);
    ctx.sfx.crack(0.15);
    const dur = 0.28 + rar.tier * 0.08;
    tl = gsap.timeline();
    tl.to(CRACK, { value: 1.6, duration: dur, ease: 'power2.out' }).to(GLOW, { value: 1.0, duration: dur * 0.6 }, 0).call(() => shatter(), [], dur + 0.12);
  }

  function reset() {
    tl?.kill();
    state = 'intact';
    CRACK.value = 0;
    GLOW.value = 0;
    reveal.k = 0;
    buildShards(new Vector2(0, 0));
    CRACK.value = 0;
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      TINT.value.set(rar.tier === 0 ? '#ffe2c0' : rar.accentHex);
      await RAPIER.init();
      stage = createStage(c, { bg: ['#211e1b', '#090808'], env: 'studio', fill: 0.62, frameW: PACK.w, frameH: PACK.h });
      const key = new DirectionalLight(0xfff1e2, 1.3);
      key.position.set(-1, 2.5, 2.5);
      stage.scene.add(key, shell, cardRig);

      // sol sombre qui reçoit les éclats
      const floorMat = new MeshStandardNodeMaterial({ color: 0x141210, roughness: 0.9 });
      const floor = new Mesh(new PlaneGeometry(8, 8), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.9;
      stage.scene.add(floor);

      const art = c.bag.add(await generatePackArt(PACK_STYLES.bone));
      const [front, back] = createPackMaterials(art) as unknown as MeshStandardNodeMaterial[];
      const crackLine = smoothstep(0.1, 0.0, attribute('edge', 'float'));
      const reach = smoothstep(0.0, 0.06, CRACK.sub(length(positionWorld.sub(IMPACT))));
      for (const m of [front, back]) {
        m.emissiveNode = TINTn.mul(crackLine.mul(reach).mul(GLOW).mul(3.5));
      }
      const inner = new MeshStandardNodeMaterial();
      inner.colorNode = color('#cfc8bb');
      inner.roughnessNode = float(0.5);
      inner.emissiveNode = TINTn.mul(GLOW).mul(0.8);
      packMats = [front, back, inner];
      packMats.forEach((m) => c.bag.add(m));

      // étincelles d'impact (sans état : rayonnent depuis l'impact au moment du bris)
      const sparkMat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const h1 = hash(instanceIndex), h2 = hash(instanceIndex.add(77)), h3 = hash(instanceIndex.add(191));
      const dirv = vec3(h1.sub(0.5), h2.sub(0.5), h3.mul(0.6)).normalize();
      const tt = SP;
      sparkMat.positionNode = vec3(IMPACT).add(dirv.mul(tt.mul(h3.mul(1.4).add(0.4)))).add(vec3(0, tt.mul(tt).mul(-0.8), 0));
      const life = exp(tt.mul(-2.5)).mul(smoothstep(0.0, 0.02, tt));
      sparkMat.colorNode = vec4(TINTn.mul(life.mul(4)), smoothstep(0.5, 0.1, length(uv().sub(0.5))).mul(life));
      sparkMat.scaleNode = h2.mul(0.008).add(0.003);
      const sparks = new Sprite(sparkMat);
      sparks.count = 140;
      sparks.frustumCulled = false;
      stage.scene.add(sparks);
      c.bag.add(sparkMat);

      const { art: cardArt, back: cardBack } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(cardArt, cardBack);
      card.mesh.position.z = -0.012;
      card.mesh.scale.setScalar(0.94);
      cardRig.add(card.mesh);

      reset();
      await stage.compile();
      c.bag.fn(() => {
        tl?.kill();
        clearShards();
      });
      c.bag.fn(
        c.input.onTap((x, y) => {
          if (state !== 'intact') return;
          ray.setFromCamera(new Vector2(x, y), stage.camera);
          const pl = new Plane(new Vector3(0, 0, 1), 0).applyMatrix4(shell.matrixWorld);
          if (ray.ray.intersectPlane(pl, hit)) {
            shell.worldToLocal(hit);
            strike(new Vector2(Math.max(-PACK.w / 2, Math.min(PACK.w / 2, hit.x)), Math.max(-PACK.h / 2, Math.min(PACK.h / 2, hit.y))));
          }
        }),
      );
      c.gui.add(params, 'force', 0.2, 3, 0.01).name('force');
      c.gui.add(params, 'gravity', 0.5, 15, 0.1).name('gravité');
      c.gui.add(params, 'shards', 0, 120, 1).name('éclats (0 = auto)').onFinishChange(() => state === 'intact' && reset());
    },
    replay() {
      reset();
    },
    update(dt, t) {
      shake.update(dt);
      if (state === 'broken') SP.value += dt * timeScale;
      else SP.value = 0;
      const p = ctx.input.pose(0.2);
      if (state !== 'broken') {
        shell.rotation.set(p.x * 0.7, p.y * 0.7, 0);
        shell.position.set(shake.value * 0.003, Math.sin(t * 0.9) * 0.008, 0);
      }
      if (world) {
        acc += dt * timeScale;
        const step = 1 / 60;
        world.timestep = step;
        let n = 0;
        while (acc >= step && n < 4) {
          world.step();
          acc -= step;
          n++;
        }
        for (const s of shards) {
          if (!s.body) continue;
          const tr = s.body.translation(), ro = s.body.rotation();
          // l'éclat est dans `shell` : on repasse en local
          const v = shell.worldToLocal(new Vector3(tr.x, tr.y, tr.z));
          s.mesh.position.copy(v);
          s.mesh.quaternion.set(ro.x, ro.y, ro.z, ro.w).premultiply(shell.quaternion.clone().invert());
        }
      }
      cardRig.position.set(shake.value * 0.002, Math.sin(t * 1.1) * 0.005 * reveal.k, reveal.k * 0.35);
      const k = 0.35 + reveal.k * 0.65;
      cardRig.rotation.set(p.x * k, p.y * k, 0);
      stage.camera.position.x = shake.value * 0.004;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {
      clearShards();
    },
  };
}
