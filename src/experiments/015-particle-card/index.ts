import { DirectionalLight, Matrix4, Sprite, SpriteNodeMaterial, Vector3, type Mesh, type Material } from 'three/webgpu';
import {
  Fn,
  If,
  exp,
  float,
  hash,
  hue,
  instanceIndex,
  instancedArray,
  length,
  max,
  mix,
  mx_noise_vec3,
  normalize,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { CARD } from '../../core/cardModel';
import { EASE } from '../../core/ease';
import type { N } from '../../core/tsl';

/**
 * 015 — Carte en particules.
 * La face de la carte est faite de ~36 000 particules GPU (une par "pixel"). Elles se défont selon un style propre
 * au tier (sable, vent, explosion, vortex), puis se reconstruisent en vague depuis le bas, avec un ressort,
 * avant de se condenser dans la vraie carte.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let cardMesh: Mesh;
  let sprites: Sprite;
  let initC: N, updC: N;
  let GW = 160, GH = 224;
  const U = {
    dt: uniform(0.016),
    scatter: uniform(0), // 1 = dispersé
    since: uniform(0), // temps depuis le dernier changement d'état
    mat: uniform(new Matrix4()),
    mouse: uniform(new Vector3(9, 9, 9)),
    push: uniform(0),
    time: uniform(0),
    size: uniform(1),
  };
  const solid = { k: 1 };
  let state: 'solid' | 'scattered' | 'rebuilding' = 'solid';
  let tl: gsap.core.Timeline | null = null;
  const params = { stiffness: 140, wave: 0.9 };
  const K = uniform(140), WAVE = uniform(0.9);
  const tmp = new Vector3();

  function scatter() {
    tl?.kill();
    state = 'scattered';
    U.scatter.value = 1;
    U.since.value = 0;
    solid.k = 0;
    ctx.sfx.whoosh(0.6, 0.25, true);
    if (rar.tier >= 3) ctx.sfx.crack(0.25);
    tl = gsap.timeline().call(() => rebuild(), [], 2.2 + rar.tier * 0.15);
  }

  function rebuild() {
    tl?.kill();
    state = 'rebuilding';
    U.scatter.value = 0;
    U.since.value = 0;
    ctx.sfx.riser(1.2, rar.tier, 0.12);
    tl = gsap.timeline();
    tl.to(solid, {
      k: 1, duration: 0.45, ease: EASE.glide, delay: 1.0 + params.wave * 0.9,
      onStart: () => (ctx.sfx.chime(rar.tier, 0.15), ctx.sfx.thump(0.25)),
      onComplete: () => (state = 'solid'),
    });
  }

  function setOpacity(o: number) {
    for (const m of cardMesh.material as Material[]) {
      m.opacity = o;
      m.transparent = o < 0.999;
      m.depthWrite = o > 0.5;
    }
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      if (c.quality === 'mobile') ((GW = 112), (GH = 157));
      stage = createStage(c, { bg: ['#24201c', '#090807'], env: 'studio', fill: 0.62 });
      const key = new DirectionalLight(0xfff2e4, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key);
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(art, back);
      cardMesh = card.mesh;
      stage.scene.add(cardMesh);

      const n = GW * GH;
      const pos = instancedArray(n, 'vec4');
      const vel = instancedArray(n, 'vec4');
      const T = rar.tier;
      const homeOf = (i: N) => {
        const hx = float(i.mod(GW)), hy = float(i.div(GW));
        const local = vec3(hx.add(0.5).div(GW).sub(0.5).mul(CARD.w), hy.add(0.5).div(GH).sub(0.5).mul(CARD.h), CARD.t * 0.6);
        return { world: U.mat.mul(vec4(local, 1)).xyz, uv: vec2(hx.add(0.5).div(GW), hy.add(0.5).div(GH)), hy };
      };

      initC = Fn(() => {
        const h = homeOf(instanceIndex);
        pos.element(instanceIndex).assign(vec4(h.world, 0));
        vel.element(instanceIndex).assign(vec4(0));
      })().compute(n);

      updC = Fn(() => {
        const i = instanceIndex;
        const P = pos.element(i);
        const V = vel.element(i);
        const h = homeOf(i);
        const p = P.xyz.toVar();
        const v = V.xyz.toVar();
        const r1 = hash(i), r2 = hash(i.add(7)), r3 = hash(i.add(13));
        const dt = U.dt;
        If(U.scatter.greaterThan(0.5), () => {
          // impulsion initiale (une seule fois : quand since < dt)
          If(U.since.lessThan(dt.mul(1.5)), () => {
            const out = normalize(p.sub(vec3(0, 0, -0.3)).add(vec3(r1.sub(0.5), r2.sub(0.5), r3).mul(0.4)));
            const kick = [0.25, 0.5, 0.7, 1.4, 1.8, 0.9][T];
            v.assign(out.mul(kick * 0.6).mul(r3.mul(0.6).add(0.4)).add(vec3(0, 0, r1.mul(0.3))));
          });
          const q = p.mul(2.2).add(vec3(0, 0, U.time.mul(0.2)));
          const curl = mx_noise_vec3(q).sub(mx_noise_vec3(q.add(17.3)));
          const grav = vec3(0, [-1.6, 0.25, 0.05, -0.15, 0.1, 0][T], 0);
          const wind = vec3([0, 0.6, 0.9, 0, 0, 0][T], 0, 0);
          const orbit = vec3(p.y.negate(), p.x, 0).mul([0, 0, 0, 0, 0.6, 2.2][T]);
          const acc = curl.mul([0.3, 0.9, 1.4, 1.1, 0.9, 0.8][T]).add(grav).add(wind).add(orbit);
          v.assign(v.add(acc.mul(dt)).mul(exp(dt.mul(-[2.4, 1.0, 1.1, 1.3, 1.0, 0.8][T]))));
        }).Else(() => {
          // reconstruction en vague depuis le bas (bruitée), ressort amorti vers la position d'origine
          const delay = h.hy.div(GH).mul(WAVE).add(r1.mul(0.25));
          const active = smoothstep(delay, delay.add(0.35), U.since);
          const k = K.mul(active);
          const c2 = k.sqrt().mul(2 * 0.82);
          const a = h.world.sub(p).mul(k).sub(v.mul(c2));
          v.assign(v.add(a.mul(dt)).mul(mix(float(0.985), float(1), active)));
          // le doigt repousse les particules (carte "sable")
          const d = p.sub(U.mouse);
          const dl = length(d);
          v.addAssign(normalize(d.add(vec3(0, 0, 0.001))).mul(smoothstep(0.08, 0.0, dl)).mul(U.push).mul(dt).mul(60));
        });
        p.addAssign(v.mul(dt));
        P.assign(vec4(p, P.w));
        V.assign(vec4(v, 0));
      })().compute(n);

      // ── rendu : un sprite par cellule, couleur de l'art aplati
      const mat = new SpriteNodeMaterial({ transparent: false });
      const h = homeOf(instanceIndex);
      mat.positionNode = pos.element(instanceIndex).xyz;
      const P = pos.element(instanceIndex).xyz;
      const away = smoothstep(0.002, 0.06, length(P.sub(h.world)));
      const base = texture(art.flat, h.uv).rgb.mul(0.86);
      let col: N = base;
      if (T >= 4) col = col.add(vec3(1.0, 0.85, 0.55).mul(away).mul(smoothstep(0.96, 1.0, hash(instanceIndex.add(99)))).mul(2));
      if (T === 5) col = mix(col, hue(col.add(0.15), hash(instanceIndex).mul(6.28)), away.mul(0.7));
      mat.colorNode = vec4(col, 1);
      const cell = CARD.w / GW;
      mat.scaleNode = float(cell * 1.18).mul(mix(float(1), float(0.6), away)).mul(U.size);
      const sq = max(uv().sub(0.5).abs().x, uv().sub(0.5).abs().y);
      mat.maskNode = sq.lessThan(mix(float(0.5), float(0.32), away));
      sprites = new Sprite(mat);
      sprites.count = n;
      sprites.frustumCulled = false;
      stage.scene.add(sprites);
      c.bag.add(mat);
      c.bag.fn(() => {
        (pos as unknown as { value: { dispose?: () => void } }).value.dispose?.();
        (vel as unknown as { value: { dispose?: () => void } }).value.dispose?.();
      });

      cardMesh.updateMatrixWorld();
      U.mat.value.copy(cardMesh.matrixWorld);
      c.renderer.compute(initC);
      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => (state === 'scattered' ? rebuild() : scatter())));
      c.gui.add(params, 'stiffness', 20, 400, 1).name('raideur du ressort').onChange((v: number) => (K.value = v));
      c.gui.add(params, 'wave', 0, 2, 0.01).name('durée de la vague').onChange((v: number) => (WAVE.value = v));
      tl = gsap.timeline().call(() => scatter(), [], 1.2);
    },
    replay() {
      tl?.kill();
      solid.k = 1;
      state = 'solid';
      U.scatter.value = 0;
      ctx.renderer.compute(initC);
      tl = gsap.timeline().call(() => scatter(), [], 0.6);
    },
    update(dt, t) {
      const pose = ctx.input.pose(0.25);
      cardMesh.rotation.set(pose.x, pose.y, 0);
      cardMesh.updateMatrixWorld();
      U.mat.value.copy(cardMesh.matrixWorld);
      U.dt.value = Math.min(dt, 1 / 30);
      U.since.value += U.dt.value;
      U.time.value = t;
      // doigt → plan de la carte
      tmp.set(ctx.input.ndcX, ctx.input.ndcY, 0.5).unproject(stage.camera).sub(stage.camera.position).normalize();
      const k = -stage.camera.position.z / tmp.z;
      U.mouse.value.copy(stage.camera.position).addScaledVector(tmp, k);
      U.push.value = ctx.input.inside && state !== 'solid' ? 0.6 : 0;
      ctx.renderer.compute(updC);
      setOpacity(solid.k);
      cardMesh.visible = solid.k > 0.001;
      sprites.visible = solid.k < 0.999;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
