import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  atan,
  color,
  exp,
  float,
  hash,
  hue,
  instanceIndex,
  length,
  luminance,
  mix,
  mx_fractal_noise_float,
  normalLocal,
  positionLocal,
  screenSize,
  screenUV,
  select,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  texture,
  min,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { createPackGeometry, createPackMaterials, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { cardById } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createPipeline, anamorphicFlare } from '../../core/post';
import { createHoloMaterial } from '../../core/holo';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { EASE, Spring } from '../../core/ease';
import { rot2, type N } from '../../core/tsl';

/**
 * 018 — Mythique : « L'Éclipse ».
 * La séquence la plus ambitieuse du lab, qui combine : fuite de lumière (003), combustion (005), lentille
 * gravitationnelle (011), convergence de particules (009), flare + aberration + inversion (006), foil spectral (001).
 * Les étapes se débloquent avec le tier : la séquence complète n'existe qu'en mythique.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const rig = new Group();
  const packRig = new Group();
  const cardRig = new Group();
  let tl: gsap.core.Timeline | null = null;
  let holoU: ReturnType<typeof createHoloMaterial>['uniforms'];
  let bloomRef: N;
  const shake = new Spring(0, 240, 8);
  const shake2 = new Spring(0, 280, 9);
  const S = { leak: 0, burn: -0.25, lens: 0, core: 0, conv: 0, expl: 0, shock: 0, invert: 0, flash: 0, flare: 0, ca: 0, flip: Math.PI, holo: 0, lift: 0, dark: 0 };
  const U = {
    leak: uniform(0), burn: uniform(-0.25), lens: uniform(0), core: uniform(0), conv: uniform(0), expl: uniform(0),
    shock: uniform(0), invert: uniform(0), flash: uniform(0), flare: uniform(0), ca: uniform(0), dark: uniform(0),
    center: uniform(new Vector2(0.5, 0.5)), tint: uniform(new Color('#ffffff')),
  };
  const proj = new Vector3();
  const params = { speed: 1 };
  let warm = 0;

  function play() {
    tl?.kill();
    Object.assign(S, { leak: 0, burn: -0.25, lens: 0, core: 0, conv: 0, expl: 0, shock: 0, invert: 0, flash: 0, flare: 0, ca: 0, flip: Math.PI, holo: 0, lift: 0, dark: 0 });
    packRig.visible = true;
    const T = rar.tier;
    const sfx = ctx.sfx;
    tl = gsap.timeline();
    tl.timeScale(params.speed);
    let t = 0.4;
    // 1. la lumière vit dans le paquet (≥ rare)
    if (T >= 2) {
      const beats = T + 1;
      for (let i = 0; i < beats; i++) {
        const amp = 0.4 + (i / beats) * 0.9;
        tl.to(S, { leak: amp, duration: 0.09, ease: 'none', onStart: () => sfx.thump(0.08 + i * 0.03, 55) }, t).to(S, { leak: amp * 0.3, duration: 0.5, ease: EASE.glide }, t + 0.09);
        t += Math.max(0.3, 0.85 - i * 0.12);
        // 2. fausse pause (≥ épique) : tout se tait et s'assombrit
        if (T >= 3 && i === beats - 2) {
          tl.to(S, { leak: 0.05, dark: 0.6, duration: 0.3, ease: EASE.breathe }, t);
          t += 1.1;
        }
      }
      tl.to(S, { leak: 1.3, dark: 0.75, lift: 1, duration: 0.6, ease: EASE.heave, onStart: () => sfx.riser(0.7, T, 0.14) }, t);
      t += 0.6;
    }
    // 3. combustion depuis le centre, front spectral
    tl.to(S, { burn: 0.95, duration: 1.4, ease: 'power1.in', onStart: () => (sfx.rumble(1.6, 0.25), sfx.whoosh(1.2, 0.2, true)) }, t)
      .to(S, { leak: 0, duration: 0.6 }, t + 0.3);
    t += 1.0;
    // 4. éclipse : la lentille se forme, le temps ralentit, les particules convergent vers la carte (≥ légendaire)
    if (T >= 4) {
      tl.to(S, { lens: 1, core: 1, duration: 0.9, ease: EASE.heave }, t);
      if (T === 5) tl.to(S, { conv: 1, duration: 1.6, ease: EASE.breathe }, t - 0.3);
      tl.call(() => void gsap.to(tl!, { timeScale: 0.3 * params.speed, duration: 0.25 }), [], t + 0.5);
      tl.call(() => void gsap.to(tl!, { timeScale: params.speed, duration: 0.15 }), [], t + 1.25);
      t += 1.3;
    } else t += 0.3;
    // 5. payoff : retournement, choc, inversion, flare, aberration
    const pay = t;
    tl.to(S, { flip: 0, duration: 0.55, ease: EASE.snap, onStart: () => sfx.whoosh(0.3, 0.25) }, pay - 0.2);
    tl.call(() => {
      sfx.thump(0.4 + T * 0.06);
      sfx.chime(T, 0.2);
      if (T >= 4) sfx.shimmer(T, 3.2, 0.12);
      if (T >= 3) sfx.crack(0.2);
      shake.impulse(rar.shake * 30);
      shake2.impulse(-rar.shake * 22);
    }, [], pay);
    tl.to(S, { flash: 1, flare: T >= 3 ? 1 : 0.3, ca: T >= 2 ? 0.8 : 0, lens: 0, core: 0, duration: 0.05, ease: 'none' }, pay);
    if (T >= 4) tl.fromTo(S, { shock: 0 }, { shock: 1, duration: 1.1, ease: 'power2.out' }, pay);
    if (T === 5) tl.to(S, { invert: 1, duration: 0.03 }, pay).to(S, { invert: 0, duration: 0.2, ease: 'power2.out' }, pay + 0.08);
    // 6. retombée : le foil "s'éveille", les particules s'éloignent lentement
    tl.to(S, { flash: 0, flare: 0, ca: 0, dark: 0, duration: 1.6, ease: EASE.glide }, pay + 0.1)
      .to(S, { holo: 1, duration: 2.2, ease: EASE.glide }, pay + 0.2)
      .to(S, { expl: 1, duration: 6, ease: 'power2.out' }, pay);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      U.tint.value.set(rar.tier === 0 ? '#e8e2d6' : rar.accentHex);
      const tintN = U.tint as unknown as N;
      stage = createStage(c, { bg: ['#1d1a18', '#060505'], env: 'studio', envIntensity: 0.9, fill: 0.6, frameW: PACK.w, frameH: PACK.h });
      const key = new DirectionalLight(0xfff2e6, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      rig.add(packRig, cardRig);

      // ── carte mythique (Œil du Puits si mythique, sinon une carte du tier)
      const cd = rar.tier === 5 ? cardById('oeil-du-puits') : cardById(['pierre-levee', 'lierre-sourd', 'veilleur-cendre', 'sigille-marees', 'tour-muette', 'oeil-du-puits'][rar.tier]);
      const { art, back } = await cardArtFor(cd, c.rarity, c.bag);
      const holo = createHoloMaterial(art, rar.tier);
      holoU = holo.uniforms;
      const card = createCardMesh(holo.material, createBackMaterial(back), createEdgeMaterial());
      cardRig.add(card);

      // ── paquet : fuite de lumière par les soudures + combustion spectrale depuis le centre
      const pArt = c.bag.add(await generatePackArt(PACK_STYLES.bone));
      const mats = createPackMaterials(pArt);
      const p = positionLocal.xy;
      const field = length(p.mul(vec2(1, 0.8))).add(mx_fractal_noise_float(vec3(p.mul(4), 0.4), 4).mul(0.2));
      const front = field.sub(U.burn);
      const spectral = hue(vec3(1.0, 0.55, 0.35), atan(p.y, p.x).add(time.mul(1.5)));
      const edgeCol = rar.tier === 5 ? spectral : (tintN as N);
      const cv = PACK.crimp / PACK.h;
      for (const m of mats) {
        const u = uv().x, v = uv().y;
        m.side = DoubleSide;
        m.maskNode = front.greaterThan(0);
        const seam = exp(min(u, u.oneMinus()).mul(-240)).add(exp(abs(v.sub(cv)).min(abs(v.sub(1 - cv))).mul(-300)).mul(0.8)).add(luminance(texture(pArt.front, uv()).rgb).pow(2).mul(0.15));
        const ember = exp(front.max(0).mul(-160)).mul(4).add(exp(front.max(0).mul(-30)).mul(0.3));
        m.colorNode = mix(m.colorNode as N, color('#0d0907'), smoothstep(0.06, 0.004, front));
        m.emissiveNode = (tintN as N).mul(seam).mul(U.leak).add(edgeCol.mul(ember));
        m.positionNode = positionLocal.add(normalLocal.mul(smoothstep(0.05, 0.0, front).mul(0.03)));
        c.bag.add(m);
      }
      const pack = new Mesh(c.bag.add(createPackGeometry(48, 72)), mats);
      packRig.add(pack);

      // ── particules analytiques : coquille lointaine → contour de la carte (convergence) → dérive (explosion lente)
      const N_P = c.quality === 'mobile' ? 2500 : 7000;
      const pm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const i = instanceIndex;
      const h1 = hash(i), h2 = hash(i.add(11)), h3 = hash(i.add(23)), h4 = hash(i.add(37));
      const dir = vec3(h1.sub(0.5), h2.sub(0.5), h3.sub(0.5).mul(0.5)).normalize();
      const shell = dir.mul(h4.mul(0.9).add(1.4));
      const per = h1.mul(2 * (CARD.w + CARD.h));
      const onW = per.lessThan(CARD.w * 2);
      const tx = select(onW, per.mod(CARD.w).sub(CARD.w / 2), select(per.sub(CARD.w * 2).lessThan(CARD.h), float(CARD.w / 2), float(-CARD.w / 2)));
      const ty = select(onW, select(per.lessThan(CARD.w), float(-CARD.h / 2), float(CARD.h / 2)), per.sub(CARD.w * 2).mod(CARD.h).sub(CARD.h / 2));
      const target = vec3(tx, ty, h3.sub(0.5).mul(0.02));
      const cv2 = U.conv;
      const swirlA = cv2.oneMinus().mul(4).add(h2.mul(2));
      const conv = mix(shell, target, cv2.pow(1.5));
      const sw = vec3(rot2(conv.xy, swirlA.mul(cv2.oneMinus())), conv.z);
      const drift = dir.mul(U.expl.mul(h4.mul(0.6).add(0.3))).add(vec3(0, U.expl.mul(0.15), 0));
      pm.positionNode = sw.add(drift);
      const vis = smoothstep(0.0, 0.2, cv2).mul(float(1).sub(U.expl.mul(0.85)));
      const pc = hue(vec3(1.0, 0.75, 0.6), h1.mul(6.28).add(time.mul(0.4)));
      const disc = smoothstep(0.5, 0.1, length(uv().sub(0.5)));
      pm.colorNode = vec4(pc.mul(1.6), disc.mul(vis).mul(sin(time.mul(3).add(h3.mul(40))).mul(0.3).add(0.7)));
      pm.scaleNode = h2.mul(0.006).add(0.002);
      const parts = new Sprite(pm);
      parts.count = N_P;
      parts.frustumCulled = false;
      if (rar.tier === 5) rig.add(parts);
      c.bag.add(pm);

      // ── post : bloom, flare anamorphique, lentille + horizon, onde de choc, aberration, inversion, vignette
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const bl = post.own(bloom(post.emissive!, 0.3, 0.5, 0.0)) as unknown as N;
      bloomRef = bl;
      const fl = post.own(anamorphicFlare(post.emissive!, (n) => bloom(n, 1, 0, 0.12) as unknown as N));
      const aspect = screenSize.x.div(screenSize.y);
      const d0 = screenUV.sub(U.center).mul(vec2(aspect, 1));
      const r = length(d0);
      const fall = exp(r.mul(r).div(0.09).negate());
      const ang = U.lens.mul(fall).mul(3.5);
      const pinch = float(1).sub(U.lens.mul(fall).mul(0.3));
      // onde de choc : anneau qui pousse les UV vers l'extérieur
      const R = U.shock.mul(0.9);
      const ring = exp(abs(r.sub(R)).div(0.025).negate().mul(1)).mul(U.shock.oneMinus());
      const warped = U.center.add(rot2(d0, ang).mul(pinch).sub(d0.normalize().mul(ring.mul(0.025))).div(vec2(aspect, 1)));
      let col: N = post.color.sample(warped).rgb;
      const coreR = U.core.mul(0.05);
      col = col.mul(smoothstep(coreR.mul(0.7), coreR.mul(1.3), r).max(U.core.oneMinus()));
      col = col.add(tintN.mul(exp(abs(r.sub(coreR.mul(1.3))).div(0.01).negate()).mul(U.core).mul(1.5)));
      col = col.add(bl.rgb).add(fl.rgb.mul(tintN).mul(U.flare)).add(tintN.mul(ring.mul(0.25)));
      col = (chromaticAberration(vec4(col, 1), U.ca, U.center, float(1.08)) as unknown as N).rgb;
      const lum = luminance(col);
      col = mix(col, vec3(lum).oneMinus(), U.invert);
      col = col.add(vec3(U.flash.mul(0.25)));
      const vig = smoothstep(1.2, 0.3, screenUV.sub(0.5).length().mul(1.6));
      col = col.mul(mix(float(0.8), float(1), vig)).mul(float(1).sub(U.dark.mul(0.55).mul(smoothstep(0.1, 0.6, r))));
      post.output = vec4(col, 1);

      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add(params, 'speed', 0.25, 2, 0.01).name('vitesse de la séquence').onChange((v: number) => tl?.timeScale(v));
      // la séquence démarre après quelques frames : les pipelines de post se compilent à la 1re frame
      warm = 3;
    },
    replay() {
      play();
    },
    update(dt, t) {
      if (warm > 0 && --warm === 0) play();
      shake.update(dt);
      shake2.update(dt);
      for (const k of Object.keys(U) as Array<keyof typeof U>) {
        if (k === 'center' || k === 'tint') continue;
        (U[k] as { value: number }).value = S[k as keyof typeof S] as number;
      }
      holoU.strength.value = 0.1 + S.holo * 0.75;
      holoU.extraEmissive.value = S.flash * 0.6 + (1 - S.holo) * 0.05;
      (bloomRef as unknown as { strength: { value: number } }).strength.value = 0.25 + S.flash * 1.2 + S.leak * 0.3;
      const tr = S.lift * 0.012 * (rar.tier / 5);
      packRig.rotation.set(Math.sin(t * 37) * tr, Math.sin(t * 29) * tr, Math.sin(t * 41) * tr);
      packRig.position.y = S.lift * 0.03 + (rar.tier === 5 ? Math.sin(t * 1.3) * 0.008 * S.lift : 0);
      packRig.visible = S.burn < 0.94;
      const pose = ctx.input.pose(S.holo > 0.2 ? 0.35 : 0.12);
      rig.rotation.set(pose.x, pose.y, 0);
      rig.position.set(shake.value * 0.004, shake2.value * 0.004, 0);
      cardRig.rotation.set(0, S.flip, 0);
      cardRig.position.z = (1 - Math.cos(Math.min(1, S.holo) * Math.PI)) * 0.05;
      stage.scene.updateMatrixWorld();
      proj.set(0, 0, 0).applyMatrix4(rig.matrixWorld).project(stage.camera);
      U.center.value.set(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
