import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  color,
  exp,
  float,
  hash,
  int,
  instanceIndex,
  length,
  luminance,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { backdropNode, createStandardCard } from '../../core/stage';
import { studioEnv } from '../../core/env';
import { createPackMaterials, createPackGeometry, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE, smoothstep as sstep } from '../../core/ease';
import type { N } from '../../core/tsl';

/**
 * 003 — Indice de rareté AVANT la révélation.
 * Le paquet repose fermé ; une lumière vit à l'intérieur. Elle fuit par les soudures, traverse
 * l'impression claire, s'étale sur la table. Les pulsations accélèrent avec le tier — fausse pause comprise.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.05, 30);
  const camBase = new Vector3(0, 1.9, 1.6);
  const packRig = new Group();
  const cardRig = new Group();
  let post: ReturnType<typeof createPipeline>;
  const I = uniform(0); // intensité lumineuse interne
  const LC = uniform(new Color('#ffffff')); // couleur de la lumière
  const LCn = LC as unknown as N;
  const rays = uniform(0);
  const center = uniform(new Vector2(0.5, 0.5));
  const cardGlow = uniform(0);
  let bloomNode: ReturnType<typeof bloom>;
  let t0 = 0;
  let tNow = 0;
  let pulses: number[] = [];
  let state: 'suspense' | 'sustain' | 'payoff' | 'done' = 'suspense';
  let tl: gsap.core.Timeline | null = null;
  const payoff = { lift: 0, fly: 0, burst: 0, card: 0, stand: 0 };
  const params = { tremble: 1, spill: 1 };
  const proj = new Vector3();
  const key = new DirectionalLight(0xffeedd, 0.35);

  /** Pulsations : accélération, montée, fausse pause avant la dernière (tier ≥ 3). */
  function schedule(r: Rarity) {
    const n = 1 + r.tier;
    const out: number[] = [];
    let t = 0.9;
    for (let i = 0; i < n; i++) {
      out.push(t);
      const gap = Math.max(0.28, 1.1 - i * 0.18);
      t += gap;
      if (r.tier >= 3 && i === n - 2) t += 1.0; // la fausse pause
    }
    return out;
  }

  function intensityAt(t: number, r: Rarity): number {
    let v = 0;
    const maxI = 0.22 + r.intensity * 1.5;
    pulses.forEach((p, i) => {
      const dt = t - p;
      if (dt < 0) return;
      const amp = maxI * (0.35 + 0.65 * ((i + 1) / pulses.length));
      const a = dt < 0.09 ? sstep(0, 0.09, dt) : Math.exp(-(dt - 0.09) * (r.tier >= 4 ? 3.2 : 4.5));
      v = Math.max(v, a * amp);
    });
    // maintien après la dernière pulsation : respiration
    const last = pulses[pulses.length - 1] ?? 0;
    if (t > last + 0.5) {
      const k = sstep(last + 0.5, last + 1.6, t);
      const breath = 0.55 + 0.25 * Math.sin((t - last) * (2.2 + r.tier * 0.5));
      v = Math.max(v, k * maxI * breath * (r.tier === 0 ? 0.25 : 1));
    }
    // commune : une lueur grise qui retombe, un peu décevante, c'est voulu
    return v;
  }

  function startPayoff() {
    if (state !== 'sustain' && state !== 'suspense') return;
    state = 'payoff';
    const T = rar.tier;
    tl = gsap.timeline({ onComplete: () => (state = 'done') });
    tl.to(payoff, { lift: 1, duration: 0.35 + T * 0.05, ease: EASE.heave, onStart: () => ctx.sfx.riser(0.4 + T * 0.1, T, 0.12) })
      .to(payoff, { burst: 1, duration: 0.12, ease: 'none', onStart: () => (ctx.sfx.thump(0.5), ctx.sfx.chime(T, 0.18)) })
      .to(payoff, { fly: 1, duration: 0.7, ease: EASE.glide }, '<')
      .to(payoff, { burst: 0, duration: 1.4 + T * 0.2, ease: EASE.glide })
      .to(payoff, { card: 1, duration: 0.6, ease: EASE.glide }, '<')
      .to(payoff, { stand: 1, duration: 0.9, ease: EASE.settle }, '-=0.6');
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      c.bag.scene(scene);
      scene.backgroundNode = backdropNode('#1c1916', '#070605');
      scene.environment = studioEnv(c.renderer, 'night');
      scene.environmentIntensity = 0.55;
      LC.value.set(rar.tier === 0 ? '#b9b2a6' : rar.hex);
      c.renderer.toneMappingExposure = 0.95;
      key.position.set(-1.2, 2.4, 1.6);
      scene.add(key);

      // ── table
      const tableMat = new MeshStandardNodeMaterial();
      const xz = positionWorld.xz;
      const q = abs(xz).sub(vec2(PACK.w / 2 - 0.03, PACK.h / 2 - 0.03));
      const d = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(0.03);
      const grain = mx_fractal_noise_float(vec3(xz.mul(vec2(3, 40)), 0.2), 3).mul(0.5).add(0.5);
      tableMat.colorNode = mix(color('#151311'), color('#221e1a'), grain);
      tableMat.roughnessNode = mix(float(0.62), float(0.9), grain);
      const spill = exp(d.max(0).mul(-22)).mul(0.9).add(exp(d.max(0).mul(-5)).mul(0.22)).mul(smoothstep(-0.02, 0.005, d));
      tableMat.emissiveNode = LCn.mul(I).mul(spill).mul(params.spill).mul(0.3);
      const table = new Mesh(new PlaneGeometry(8, 8), tableMat);
      table.rotation.x = -Math.PI / 2;
      scene.add(table);

      // ── paquet couché, lumière interne
      const art = c.bag.add(await generatePackArt(PACK_STYLES.ember));
      const mats = createPackMaterials(art);
      const cv = PACK.crimp / PACK.h;
      for (const m of mats) {
        const u = uv().x, v = uv().y;
        const mk = texture(art.masks, uv());
        const col = texture(art.front, uv());
        const sideSeam = exp(min(u, u.oneMinus()).mul(-260));
        const crimpLine = exp(abs(v.sub(cv)).min(abs(v.sub(1 - cv))).mul(-320)).mul(0.8);
        const crimpGaps = mk.g.oneMinus().mul(smoothstep(cv + 0.004, cv - 0.004, v).add(smoothstep(1 - cv - 0.004, 1 - cv + 0.004, v))).mul(0.35);
        const centerFall = smoothstep(0.75, 0.0, length(uv().sub(0.5).mul(vec2(1, 1.4))));
        const through = luminance(col.rgb).pow(2.2).mul(centerFall).mul(0.22);
        const flicker = mx_fractal_noise_float(vec3(uv().mul(3), time.mul(0.6)), 2).mul(0.25).add(1);
        const leak = sideSeam.add(crimpLine).add(crimpGaps).add(through.mul(flicker));
        m.emissiveNode = LCn.mul(I).mul(leak);
        c.bag.add(m);
      }
      const pack = new Mesh(c.bag.add(createPackGeometry()), mats);
      pack.rotation.x = -Math.PI / 2;
      packRig.add(pack);
      packRig.position.y = PACK.bulge + 0.002;
      scene.add(packRig);

      // ── poussière en suspension, éclairée par la fuite
      const N = c.quality === 'mobile' ? 160 : 360;
      const dust = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const h1 = hash(instanceIndex), h2 = hash(instanceIndex.add(911)), h3 = hash(instanceIndex.add(2711));
      const base = vec3(h1.sub(0.5).mul(1.8), h2.mul(0.8).add(0.02), h3.sub(0.5).mul(1.8));
      const drift = vec3(sin(time.mul(0.13).add(h2.mul(30))).mul(0.05), sin(time.mul(0.07).add(h1.mul(20))).mul(0.04), sin(time.mul(0.11).add(h3.mul(40))).mul(0.05));
      const p = base.add(drift);
      dust.positionNode = p;
      const dd = length(p.sub(vec3(0, 0.02, 0)));
      const lit = exp(dd.mul(-3.2)).mul(I).mul(float(0.6).add(sin(time.mul(3).add(h1.mul(60))).mul(0.4)));
      const disc = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
      dust.colorNode = vec4(LCn.mul(lit).mul(1.6), disc.mul(lit.min(1)));
      dust.scaleNode = h2.mul(0.006).add(0.003);
      const motes = new Sprite(dust);
      motes.count = N;
      motes.frustumCulled = false;
      if (rar.tier >= 2) scene.add(motes);
      c.bag.add(dust);

      // ── carte révélée (couchée là où était le paquet)
      const { art: cardArt, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(cardArt, back);
      const fm = card.front;
      fm.emissiveNode = (fm.emissiveNode as N).add(LCn.mul(cardGlow).mul(0.6));
      cardRig.add(card.mesh);
      cardRig.visible = false;
      scene.add(cardRig);

      // ── post : bloom sur l'émissif + rayons radiaux (≥ épique)
      post = createPipeline(c, scene, camera, { emissive: true });
      bloomNode = post.own(bloom(post.emissive!, 0.2, 0.45, 0.05));
      const shafts = radialBlur(post.emissive!, { center, weight: float(0.85), decay: float(0.94), count: int(32), exposure: rays }) as N;
      post.output = post.color.add(bloomNode).add(shafts.mul(LCn));

      this.resize!(c.width, c.height);
      pulses = schedule(rar);
      t0 = -1;
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => startPayoff()));
      c.gui.add(params, 'tremble', 0, 2, 0.01).name('tremblement');
      c.gui.add(params, 'spill', 0, 2, 0.01).name('lumière sur la table');
    },
    replay() {
      tl?.kill();
      Object.assign(payoff, { lift: 0, fly: 0, burst: 0, card: 0, stand: 0 });
      state = 'suspense';
      t0 = -1;
    },
    update(dt, t) {
      if (t0 < 0) t0 = t;
      tNow = t - t0;
      const T = rar.tier;
      if (state === 'suspense' && tNow > (pulses[pulses.length - 1] ?? 0) + 0.6) state = 'sustain';

      let inten = intensityAt(tNow, rar);
      if (state === 'payoff' || state === 'done') inten = inten * (1 - payoff.lift * 0.85) * (1 - payoff.fly) + payoff.burst * (0.6 + rar.intensity * 1.6);
      // mythique : la lumière dérive dans le spectre
      if (T === 5) LC.value.setHSL((tNow * 0.08) % 1, 0.55, 0.62);
      I.value = inten;
      rays.value = T >= 3 ? inten * (0.012 + 0.01 * (T - 3)) : 0;
      bloomNode.strength.value = 0.12 + rar.intensity * 0.3 + payoff.burst * 0.6;

      // tremblement proportionnel à la lumière (≥ rare), le paquet "veut" s'ouvrir
      const tr = T >= 2 ? inten * 0.012 * params.tremble * (T / 5) : 0;
      packRig.rotation.set(Math.sin(t * 37) * tr, Math.sin(t * 29 + 1) * tr * 0.6, Math.sin(t * 41 + 2) * tr);
      packRig.position.y = PACK.bulge + 0.002 + payoff.lift * 0.03 + payoff.fly * 1.6 + (T === 5 ? Math.sin(t * 1.4) * 0.006 * inten : 0);
      packRig.rotation.x += payoff.fly * 0.9;
      packRig.visible = payoff.fly < 0.98;

      cardRig.visible = payoff.card > 0;
      cardRig.position.set(0, 0.006 + payoff.stand * 0.5, payoff.stand * 0.1);
      cardRig.rotation.set(-Math.PI / 2 * (1 - payoff.stand) - payoff.stand * 0.75, 0, 0);
      if (state === 'done') {
        const pose = ctx.input.pose(0.25);
        cardRig.rotation.x += pose.x;
        cardRig.rotation.y = pose.y;
      }
      cardGlow.value = payoff.burst * payoff.burst * 0.7;
      key.intensity = 0.35 + payoff.stand * 1.5;
      scene.environmentIntensity = 0.55 + payoff.stand * 0.5;

      // caméra : léger parallaxe au pointeur
      camera.position.set(camBase.x + ctx.input.tiltX * 0.06, camBase.y + ctx.input.tiltY * 0.04, camBase.z);
      camera.lookAt(0, 0.08 + payoff.stand * 0.38, 0);
      proj.set(0, 0.05, 0).project(camera);
      center.value.set(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5);
      post.render();
    },
    resize(w, h) {
      camera.aspect = w / h;
      const k = w / h < 1 ? 1.35 / Math.max(0.5, w / h) : 1;
      camBase.set(0, 1.9 * k, 1.6 * k);
      camera.updateProjectionMatrix();
    },
    dispose() {},
  };
}
