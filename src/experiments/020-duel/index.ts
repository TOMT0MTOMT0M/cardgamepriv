import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Sprite,
  SpriteNodeMaterial,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  color,
  exp,
  float,
  hash,
  instanceIndex,
  length,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { CARDS, cardForRarity, type CardData } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE, Spring, anticipate } from '../../core/ease';
import type { N } from '../../core/tsl';

/**
 * 020 — Duel (visuel seulement).
 * Deux cartes face à face sur une table. Elles se lèvent, prennent leur élan, et leurs flux d'énergie se percutent :
 * le point de choc glisse vers la plus faible (puissance), étincelles, secousse — puis la gagnante s'illumine.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const A = new Group(), B = new Group();
  let tl: gsap.core.Timeline | null = null;
  const shake = new Spring(0, 260, 9);
  const S = { rise: 0, lean: 0, beam: 0, clash: 0.5, impact: 0, win: 0, lose: 0 };
  const U = {
    beam: uniform(0),
    clash: uniform(0.5),
    impact: uniform(0),
    ca: uniform(new Color()),
    cb: uniform(new Color()),
    win: uniform(0),
    lose: uniform(0),
  };
  let pa: CardData, pb: CardData;
  let aWins = true;
  let WL: Array<{ value: number }> = [];
  const camBase = new Vector3();

  function play() {
    tl?.kill();
    Object.assign(S, { rise: 0, lean: 0, beam: 0, clash: 0.5, impact: 0, win: 0, lose: 0 });
    aWins = pa.power >= pb.power;
    const target = aWins ? 0.72 : 0.28; // le choc est repoussé vers la plus faible
    tl = gsap.timeline();
    tl.to(S, { rise: 1, duration: 0.8, ease: EASE.settle, onStart: () => ctx.sfx.whoosh(0.6, 0.18, true) }, 0.3)
      .to(S, { lean: -1, duration: 0.45, ease: EASE.breathe, onStart: () => ctx.sfx.riser(0.9, 3, 0.12) }, 1.0)
      .to(S, { lean: 1, duration: 0.22, ease: anticipate(0.4) }, 1.5)
      .to(S, { beam: 1, duration: 0.25, ease: 'power2.out', onStart: () => ctx.sfx.thump(0.4) }, 1.6)
      // lutte : le point de choc oscille puis cède
      .to(S, { clash: 0.5 + (target - 0.5) * 0.3, duration: 0.5, ease: 'sine.inOut' }, 1.85)
      .to(S, { clash: 0.5 - (target - 0.5) * 0.15, duration: 0.4, ease: 'sine.inOut' }, 2.35)
      .to(S, { clash: target, duration: 0.5, ease: EASE.heave }, 2.75)
      .to(S, { impact: 1, duration: 0.06, onStart: () => (ctx.sfx.crack(0.4), ctx.sfx.thump(0.6), shake.impulse(16)) }, 3.25)
      .to(S, { beam: 0, impact: 0, lean: 0, duration: 1.0, ease: EASE.glide }, 3.32)
      .to(S, { win: 1, lose: 1, duration: 1.2, ease: EASE.glide, onStart: () => ctx.sfx.chime(4, 0.16) }, 3.4);
  }

  return {
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#1d1a17', '#070606'], env: 'studio', envIntensity: 0.7, fill: 0.4 });
      stage.camera.position.set(0, 2.1, 2.3);
      stage.camera.lookAt(0, 0.05, 0);
      camBase.copy(stage.camera.position);
      const key = new DirectionalLight(0xfff0e0, 1.1);
      key.position.set(-1.5, 3, 1.5);
      stage.scene.add(key, A, B);

      // table + halo central
      const tm = new MeshStandardNodeMaterial();
      const d = length(positionWorld.xz.mul(vec2(1, 0.7)));
      tm.colorNode = mix(color('#2a2420'), color('#100e0c'), smoothstep(0.2, 2.2, d));
      tm.roughnessNode = float(0.8);
      tm.emissiveNode = mix(vec3(U.ca as unknown as N), vec3(U.cb as unknown as N), U.clash).mul(exp(d.mul(-3.5)).mul(U.beam.mul(0.08).add(U.impact.mul(0.35))));
      const table = new Mesh(new PlaneGeometry(10, 10), tm);
      table.rotation.x = -Math.PI / 2;
      stage.scene.add(table);

      pa = cardForRarity(c.rarity);
      const foes = CARDS.filter((x) => x.id !== pa.id && x.power > 0);
      pb = foes[Math.floor(Math.random() * foes.length)];
      U.ca.value.set(rarity(c.rarity).tier === 0 ? '#e8d9c0' : rarity(c.rarity).accentHex);
      U.cb.value.set(rarity(pb.rarity).accentHex);
      const mk = async (cd: CardData, rid: Parameters<typeof cardArtFor>[1], g: Group, z: number, loseU: N, winU: N) => {
        const { art, back } = await cardArtFor(cd, rid, c.bag);
        const card = createStandardCard(art, back);
        card.front.colorNode = (card.front.colorNode as N).mul(float(1).sub(loseU.mul(0.45)));
        card.front.emissiveNode = (card.front.emissiveNode as N).add(card.layers.masks.r.mul(0.3).add(0.05).mul(winU).mul(0.6));
        g.add(card.mesh);
        g.position.z = z;
      };
      const WA = uniform(0), LA = uniform(0), WB = uniform(0), LB = uniform(0);
      await mk(pa, c.rarity, A, 0.75, LA as unknown as N, WA as unknown as N);
      await mk(pb, pb.rarity, B, -0.75, LB as unknown as N, WB as unknown as N);
      WL = [WA, LA, WB, LB];

      // flux d'énergie : un ruban vertical qui relie les deux cartes, bruit qui coule vers le point de choc
      const bm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      const v = uv().y; // 0 = carte A, 1 = carte B
      const side = abs(uv().x.sub(0.5)).mul(2);
      const flowA = mx_fractal_noise_float(vec3(uv().x.mul(6), v.mul(8).sub(time.mul(5)), 0.3), 3).mul(0.5).add(0.5);
      const flowB = mx_fractal_noise_float(vec3(uv().x.mul(6), v.mul(8).add(time.mul(5)), 1.7), 3).mul(0.5).add(0.5);
      const toA = smoothstep(U.clash.add(0.02), U.clash.sub(0.02), v);
      const core = smoothstep(1.0, 0.0, side).pow(2);
      const ca = vec3(U.ca as unknown as N), cb = vec3(U.cb as unknown as N);
      const col = mix(cb.mul(flowB), ca.mul(flowA), toA).mul(core).mul(1.6);
      const knot = exp(abs(v.sub(U.clash)).mul(-40)).mul(core).mul(sin(time.mul(40)).mul(0.3).add(1.2));
      bm.colorNode = vec4(col.add(vec3(1, 0.95, 0.85).mul(knot)), core.mul(U.beam));
      const beam = new Mesh(new PlaneGeometry(0.16, 1.5, 1, 32), bm);
      beam.rotation.x = -Math.PI / 2;
      beam.position.y = 0.25;
      stage.scene.add(beam);

      // étincelles au point de choc (sans état)
      const sm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const h1 = hash(instanceIndex), h2 = hash(instanceIndex.add(5)), h3 = hash(instanceIndex.add(9));
      const life = time.mul(h3.mul(1.5).add(1)).add(h1).fract();
      const dir = vec3(h1.sub(0.5), h2.mul(0.8), h3.sub(0.5)).normalize();
      const clashPos = vec3(0, 0.25, float(0.75).sub(U.clash.mul(1.5)));
      sm.positionNode = clashPos.add(dir.mul(life.mul(0.35))).add(vec3(0, life.mul(life).mul(-0.3), 0));
      sm.colorNode = vec4(vec3(1, 0.85, 0.6).mul(2), smoothstep(0.5, 0.1, length(uv().sub(0.5))).mul(life.oneMinus()).mul(U.beam.add(U.impact.mul(2))));
      sm.scaleNode = h2.mul(0.008).add(0.003);
      const sparks = new Sprite(sm);
      sparks.count = c.quality === 'mobile' ? 200 : 500;
      sparks.frustumCulled = false;
      stage.scene.add(sparks);
      c.bag.add(bm);
      c.bag.add(sm);

      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const bl = post.own(bloom(post.emissive!, 0.5, 0.4, 0.0));
      post.output = post.color.add(bl);
      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add({ a: `${pa.name} (${pa.power})`, b: `${pb.name} (${pb.power})` }, 'a').name('toi').disable();
      c.gui.add({ b: `${pb.name} (${pb.power})` }, 'b').name('adversaire').disable();
      play();
    },
    replay() {
      play();
    },
    update(dt, t) {
      shake.update(dt);
      const [WA, LA, WB, LB] = WL;
      WA.value = aWins ? S.win : 0;
      LA.value = aWins ? 0 : S.lose;
      WB.value = aWins ? 0 : S.win;
      LB.value = aWins ? S.lose : 0;
      U.beam.value = S.beam;
      U.clash.value = S.clash;
      U.impact.value = S.impact;
      const rise = S.rise, lean = S.lean;
      // les cartes se lèvent face à face, prennent leur élan (recul), puis se penchent vers l'autre
      A.position.set(0, 0.006 + rise * 0.25, 0.75 - lean * 0.06 * rise);
      A.rotation.set(-Math.PI / 2 + rise * (Math.PI / 2 - 0.25) - lean * 0.18, 0, Math.sin(t * 1.3) * 0.01 * rise);
      B.position.set(0, 0.006 + rise * 0.25, -0.75 + lean * 0.06 * rise);
      // de l'autre côté de la table, face à nous aussi (vue "versus")
      B.rotation.set(-Math.PI / 2 + rise * (Math.PI / 2 - 0.15) + lean * 0.12, 0, Math.sin(t * 1.1) * 0.01 * rise);
      // perdant : secousse résiduelle
      const lose = aWins ? B : A;
      lose.position.x = Math.sin(t * 50) * 0.004 * S.lose * (1 - S.win * 0.7);
      const pose = ctx.input.pose(0.1);
      stage.camera.position.set(camBase.x + pose.y * 0.6 + shake.value * 0.006, camBase.y + pose.x * 0.4, camBase.z);
      stage.camera.lookAt(0, 0.15, 0);
      post.render();
    },
    resize(w, h) {
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
    },
    dispose() {},
  };
}
