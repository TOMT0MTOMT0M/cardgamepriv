import { CanvasTexture, Color, DirectionalLight, Group, MirroredRepeatWrapping, NoColorSpace, Vector2, type Mesh } from 'three/webgpu';
import {
  Fn,
  Loop,
  float,
  luminance,
  mix,
  rtt,
  screenUV,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSize,
  saturation,
  int,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { lensDirt } from 'three/addons/tsl/display/lensDirt.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { RARITIES, rarity, type Rarity, type RarityId } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE, Spring, anticipate, rng } from '../../core/ease';
import { Bag, disposeObject } from '../../core/bag';
import { makeCanvas } from '../../core/art/canvas';
import type { N } from '../../core/tsl';

/** Poussière d'objectif procédurale (taches floues + traînées). */
function makeDirt(): CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  const r = rng(42);
  for (let i = 0; i < 70; i++) {
    const x = r() * 512, y = r() * 512, s = 4 + r() * 38;
    g.filter = `blur(${2 + r() * 10}px)`;
    g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.25})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'blur(3px)';
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 9; i++) {
    g.lineWidth = 6 + r() * 14;
    g.beginPath();
    const x = r() * 512, y = r() * 512;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 80, y - 40, x + 140, y + 60, x + 230 * r(), y + 90 * r());
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  return t;
}

/**
 * 006 — Escalade post-FX par tier.
 * Le même geste (la carte se retourne) ; seul l'habillage change. Chaque tier ajoute une couche :
 * bloom → balayage + aberration → flare anamorphique + ralenti + secousse + étalonnage → poussière d'objectif → inversion & zoom.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const rig = new Group();
  let cardMesh: Mesh | null = null;
  let cardBag: Bag | null = null;
  let tl: gsap.core.Timeline | null = null;
  let bloomRef: ReturnType<typeof bloom> | null = null;
  const shake = new Spring(0, 260, 9);
  const shake2 = new Spring(0, 300, 10);
  const pose = { yaw: Math.PI, z: 0, scale: 1, dip: 0 };
  const fx = { bloom: 0, flare: 0, ca: 0, grade: 0, invert: 0, zoom: 0, dirt: 0, expo: 1, glow: 0, desat: 0 };
  const U = {
    bloom: uniform(0),
    flare: uniform(0),
    ca: uniform(0),
    grade: uniform(0),
    invert: uniform(0),
    zoom: uniform(0),
    dirt: uniform(0),
    glow: uniform(0),
    desat: uniform(0),
    tint: uniform(new Color('#ffffff')),
    center: uniform(new Vector2(0.5, 0.5)),
  };
  const params = { cycle: false, intensity: 1 };
  let cycleTimer = 0;

  async function buildCard(id: RarityId) {
    const prevBag = cardBag;
    const b = new Bag();
    const { art, back } = await cardArtFor(cardForRarity(id), id, b);
    const card = createStandardCard(art, back);
    // le foil émet un peu au moment du payoff → c'est lui que le bloom attrape
    card.front.emissiveNode = (card.front.emissiveNode as N).add(
      vec3(U.tint as unknown as N).mul(smoothstep(0.5, 0.8, card.layers.masks.g).mul(card.layers.window.oneMinus()).mul(0.6).add(card.layers.fx.r.mul(card.layers.subject.a).mul(card.layers.window))).mul(U.glow),
    );
    b.fn(() => disposeObject(card.mesh));
    if (cardMesh) rig.remove(cardMesh);
    cardMesh = card.mesh;
    rig.add(cardMesh);
    cardBag = b;
    prevBag?.disposeAll();
    await ctx.renderer.compileAsync(stage.scene, stage.camera);
  }

  function play() {
    tl?.kill();
    const T = rar.tier;
    const k = params.intensity;
    Object.assign(pose, { yaw: Math.PI, z: 0, scale: 1, dip: 0 });
    Object.assign(fx, { bloom: 0, flare: 0, ca: 0, grade: 0, invert: 0, zoom: 0, dirt: 0, expo: 1, glow: 0, desat: 0 });
    const anti = 0.35 + T * 0.18;
    tl = gsap.timeline({ onComplete: () => (cycleTimer = 1.4) });
    // 1. anticipation : recul, contre-rotation, la lumière se retient
    tl.to(pose, { z: -0.12 - T * 0.02, scale: 0.96, yaw: Math.PI + 0.22, duration: anti, ease: EASE.breathe, onStart: () => T >= 2 && ctx.sfx.riser(anti, T, 0.1 + T * 0.02) }, 0.3)
      .to(fx, { expo: 1 - T * 0.05, ca: T >= 3 ? 0.15 * k : 0, desat: T >= 3 ? 0.35 : 0, duration: anti, ease: EASE.breathe }, 0.3);
    // 2. retournement, ralenti au moment où la face apparaît
    const flipAt = 0.3 + anti;
    tl.to(pose, { yaw: 0, z: 0.06, scale: 1.02, duration: 0.55, ease: anticipate(0.6) }, flipAt);
    if (rar.slowmo < 1) {
      tl.call(() => void gsap.to(tl!, { timeScale: rar.slowmo, duration: 0.08 }), [], flipAt + 0.22);
      tl.call(() => void gsap.to(tl!, { timeScale: 1, duration: 0.5, ease: 'power2.in' }), [], flipAt + 0.36);
    }
    // 3. payoff : l'impulsion (tout part d'ici et décroît)
    const pay = flipAt + 0.3;
    tl.call(() => {
      ctx.sfx.whoosh(0.3, 0.2);
      if (T >= 1) ctx.sfx.chime(T, 0.16 + T * 0.02);
      if (T >= 4) ctx.sfx.shimmer(T, 2.4, 0.1);
      if (T >= 3) ctx.sfx.thump(0.3 + T * 0.08);
      shake.impulse(rar.shake * 26 * k);
      shake2.impulse(rar.shake * -18 * k);
    }, [], pay);
    tl.to(fx, {
      bloom: [0, 0.25, 0.45, 0.7, 0.95, 1.2][T] * k,
      glow: [0, 0.4, 0.7, 1.0, 1.4, 1.8][T],
      flare: T >= 3 ? (0.35 + (T - 3) * 0.25) * k : 0,
      ca: T >= 2 ? (0.25 + (T - 2) * 0.35) * k : 0,
      grade: T >= 3 ? 1 : 0,
      dirt: T >= 4 ? 1 * k : 0,
      zoom: T >= 5 ? 1 * k : 0,
      expo: 1 + T * 0.06,
      desat: 0,
      duration: 0.06,
      ease: 'none',
    }, pay);
    if (T >= 5) tl.to(fx, { invert: 1, duration: 0.03, ease: 'none' }, pay).to(fx, { invert: 0, duration: 0.18, ease: 'power2.out' }, pay + 0.09);
    // 4. retombée
    tl.to(fx, { bloom: [0, 0.08, 0.12, 0.16, 0.2, 0.25][T] * k, glow: 0.08 * T, flare: 0, ca: 0, zoom: 0, dirt: T >= 4 ? 0.25 : 0, expo: 1, grade: T >= 3 ? 0.4 : 0, duration: 1.4 + T * 0.2, ease: EASE.glide }, pay + 0.12)
      .to(pose, { z: 0, scale: 1, duration: 1.2, ease: EASE.settle }, pay + 0.1);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      U.tint.value.set(rar.tier === 0 ? '#ffffff' : rar.accentHex);
      stage = createStage(c, { bg: ['#24211e', '#0a0908'], env: 'studio', fill: 0.66 });
      const key = new DirectionalLight(0xfff3e6, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      await buildCard(c.rarity);
      c.bag.fn(() => cardBag?.disposeAll());

      // ── post
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const glowSrc = post.emissive!;
      const bl = post.own(bloom(glowSrc, 0, 0.45, 0.0));
      bloomRef = bl;
      // flare anamorphique : high-pass personnalisé + flou horizontal (même principe que l'exemple officiel)
      const fl = post.own(bloom(glowSrc, 1, 0, 0.15));
      fl.setResolutionScale(0.25);
      const SAMPLES = 48;
      fl.highPassFn = Fn(({ input, threshold, smoothWidth }: { input: N; threshold: N; smoothWidth: N }) => {
        const a = smoothstep(threshold, threshold.add(smoothWidth), luminance(input.rgb));
        const bright = rtt(mix(vec4(0), input, a), null, null, { wrapS: MirroredRepeatWrapping, wrapT: MirroredRepeatWrapping });
        const total = vec4(0).toVar();
        const half = SAMPLES / 2;
        const inv = vec2(1.0).div(viewportSize);
        Loop({ start: int(-half), end: int(half), type: 'int', condition: '<' }, ({ i }: { i: N }) => {
          const soft = float(i).abs().div(half).oneMinus().pow(2);
          total.addAssign(bright.sample(vec2(uv().x.add(inv.x.mul(float(i)).mul(6)), uv().y)).mul(soft));
        });
        return total.div(SAMPLES / 3);
      }) as unknown as typeof fl.highPassFn;
      const flare = (fl as unknown as N).mul(vec3(U.tint as unknown as N).mul(vec3(0.75, 0.85, 1.15))).mul(U.flare);

      const dirtTex = c.bag.add(makeDirt());
      const dirt = lensDirt(bl, texture(dirtTex), U.dirt) as N;
      let col: N = post.color.add(bl).add(flare).add(dirt.mul(vec3(U.tint as unknown as N)));
      // zoom-punch (mythique)
      col = mix(col, radialBlur(col, { center: U.center, weight: float(0.9), decay: float(0.93), count: int(24), exposure: float(1.1) }) as N, U.zoom.mul(0.7));
      col = chromaticAberration(col, U.ca, U.center, float(1.08)) as N;
      // étalonnage : fond qui se désature à l'anticipation, bascule chaude/teintée au payoff, inversion éclair
      const lum = luminance(col.rgb);
      const graded = mix(col.rgb, col.rgb.mul(vec3(U.tint as unknown as N).mul(0.35).add(0.75)), U.grade.mul(0.6));
      const desat = saturation(graded, float(1).sub(U.desat));
      const inverted = mix(desat, vec3(lum).oneMinus().mul(vec3(1.0, 0.97, 0.92)), U.invert);
      const vign = smoothstep(1.15, 0.35, screenUV.sub(0.5).length().mul(1.6));
      post.output = vec4(inverted.mul(mix(float(0.82), float(1), vign)), 1);

      c.gui.add(params, 'intensity', 0, 2, 0.01).name('intensité FX');
      c.gui.add(params, 'cycle').name('cycle auto 1→6');
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      play();
    },
    async setRarity(id) {
      rar = rarity(id);
      U.tint.value.set(rar.tier === 0 ? '#ffffff' : rar.accentHex);
      await buildCard(id);
      play();
    },
    replay() {
      play();
    },
    update(dt) {
      shake.update(dt);
      shake2.update(dt);
      const p = ctx.input.pose(0.2);
      rig.position.set(shake.value * 0.004, shake2.value * 0.004, pose.z);
      rig.rotation.set(p.x, pose.yaw + p.y, shake.value * 0.002);
      rig.scale.setScalar(pose.scale);
      U.bloom.value = fx.bloom;
      if (bloomRef) bloomRef.strength.value = fx.bloom;
      U.flare.value = fx.flare;
      U.ca.value = fx.ca;
      U.grade.value = fx.grade;
      U.invert.value = fx.invert;
      U.zoom.value = fx.zoom;
      U.dirt.value = fx.dirt;
      U.glow.value = fx.glow;
      U.desat.value = fx.desat;
      ctx.renderer.toneMappingExposure = fx.expo;
      if (params.cycle && cycleTimer > 0) {
        cycleTimer -= dt;
        if (cycleTimer <= 0) {
          const next = RARITIES[(RARITIES.findIndex((r) => r.id === rar.id) + 1) % RARITIES.length].id;
          window.dispatchEvent(new KeyboardEvent('keydown', { key: String(RARITIES.findIndex((r) => r.id === next) + 1) }));
        }
      }
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
