import { Color, DirectionalLight, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector2, Vector3 } from 'three/webgpu';
import {
  abs,
  atan,
  color,
  exp,
  float,
  fract,
  length,
  mix,
  positionWorld,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
  hash,
  floor,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { createPackMesh, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor, generateCardArt, generateBackArt, ensureFonts } from '../../core/art';
import { CARDS, cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { createCardMesh } from '../../core/cardModel';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { EASE, anticipate } from '../../core/ease';
import { rot2, type N } from '../../core/tsl';

/**
 * 011 — Vortex.
 * Un tourbillon s'ouvre dans l'espace écran (distorsion dans le RenderPipeline) : le paquet y est aspiré en spirale,
 * le cœur pulse à la couleur du tier, puis le tourbillon s'inverse et recrache les cartes — la bonne en dernier.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const packRig = new Group();
  const cardRig = new Group();
  const extras: Group[] = [];
  let tl: gsap.core.Timeline | null = null;
  const S = { strength: 0, dir: 1, core: 0, pulse: 0, suck: 0, out: 0, extras: 0 };
  const U = {
    strength: uniform(0),
    twist: uniform(5.5),
    center: uniform(new Vector2(0.5, 0.5)),
    core: uniform(0),
    pulse: uniform(0),
    tint: uniform(new Color('#ffffff')),
  };
  const params = { twist: 5.5, radius: 0.38 };
  const RAD = uniform(0.38);
  const proj = new Vector3();

  function play() {
    tl?.kill();
    Object.assign(S, { strength: 0, dir: 1, core: 0, pulse: 0, suck: 0, out: 0, extras: 0 });
    packRig.visible = true;
    cardRig.visible = false;
    const T = rar.tier;
    tl = gsap.timeline();
    tl.to(S, { strength: 1, duration: 1.0, ease: EASE.heave, onStart: () => ctx.sfx.rumble(2.6, 0.3) }, 0.2)
      .to(S, { suck: 1, duration: 1.1, ease: 'power3.in', onStart: () => ctx.sfx.whoosh(1.1, 0.3, false) }, 0.55)
      .to(S, { core: 1, duration: 0.6, ease: EASE.glide }, 0.9)
      // suspense : le cœur bat à la couleur du tier
      .to(S, { pulse: 1, duration: 0.18, yoyo: true, repeat: 1 + T, ease: 'sine.inOut', onRepeat: () => ctx.sfx.thump(0.15 + T * 0.05, 60) }, 1.75)
      .set(S, { dir: -1 })
      .call(() => {
        packRig.visible = false;
        cardRig.visible = true;
        ctx.sfx.whoosh(0.6, 0.3, true);
      })
      .to(S, { extras: 1, duration: 1.2, ease: EASE.glide })
      .to(S, { out: 1, duration: 1.1, ease: anticipate(0.4), onComplete: () => ctx.sfx.chime(T, 0.18) }, '-=0.7')
      .to(S, { strength: 0, core: 0, duration: 1.2, ease: EASE.glide }, '-=0.5');
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      U.tint.value.set(rar.tier === 0 ? '#d9d2c4' : rar.accentHex);
      stage = createStage(c, { bg: ['#1b1917', '#080707'], env: 'studio', fill: 0.58, frameW: PACK.w, frameH: PACK.h });
      const key = new DirectionalLight(0xfff1e4, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, packRig, cardRig);

      // mur à grille de points : rend la distorsion lisible (lentille gravitationnelle)
      const wallMat = new MeshBasicNodeMaterial();
      const g = positionWorld.xy.mul(14);
      const cell = fract(g).sub(0.5);
      const id = floor(g);
      const dotR = hash(id.x.add(id.y.mul(131))).mul(0.05).add(0.08);
      const dots = smoothstep(dotR, dotR.sub(0.03), length(cell));
      const fade = exp(length(positionWorld.xy).mul(-0.35));
      wallMat.colorNode = mix(color('#0d0c0b'), color('#8a8172'), dots.mul(fade)).add(color('#1a1714').mul(fade));
      const wall = new Mesh(new PlaneGeometry(12, 8), wallMat);
      wall.position.z = -1.2;
      stage.scene.add(wall);

      const art = c.bag.add(await generatePackArt(PACK_STYLES.ember));
      const pack = createPackMesh(art);
      (pack.material as Array<{ dispose(): void }>).forEach((m) => c.bag.add(m));
      packRig.add(pack);

      const { art: ca, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(ca, back);
      cardRig.add(card.mesh);

      // cartes "de remplissage" recrachées avant la bonne (art aplati basse résolution)
      await ensureFonts();
      const bArt = c.bag.add(generateBackArt(undefined, 0.5));
      for (let i = 0; i < 4; i++) {
        const fArt = c.bag.add(generateCardArt(CARDS[(i * 5 + 2) % CARDS.length], 'common', { scale: 0.5, flatOnly: true }));
        const fm = new MeshBasicNodeMaterial({ map: fArt.flat });
        const m = createCardMesh(fm, createBackMaterial(bArt), createEdgeMaterial(), { segX: 2, segY: 2, segCorner: 4 });
        const gr = new Group();
        gr.add(m);
        gr.visible = false;
        extras.push(gr);
        stage.scene.add(gr);
      }

      // ── post : tourbillon écran (rotation ∝ chute gaussienne, aspiration radiale, horizon sombre, liseré teinté)
      post = createPipeline(c, stage.scene, stage.camera);
      const aspect = screenSize.x.div(screenSize.y);
      const d0 = screenUV.sub(U.center).mul(vec2(aspect, 1));
      const r = length(d0);
      const fall = exp(r.mul(r).div(RAD.mul(RAD)).negate());
      const ang = U.strength.mul(fall).mul(U.twist);
      const pinch = float(1).sub(U.strength.mul(fall).mul(0.45));
      const warp = (k: number) => U.center.add(rot2(d0, ang.mul(k)).mul(pinch).div(vec2(aspect, 1)));
      const col = vec3(post.color.sample(warp(1.04)).r, post.color.sample(warp(1.0)).g, post.color.sample(warp(0.96)).b);
      const coreR = U.core.mul(0.055).add(U.pulse.mul(0.012));
      const hole = smoothstep(coreR.mul(1.25), coreR.mul(0.7), r).mul(U.core);
      const ring = exp(abs(r.sub(coreR.mul(1.25))).div(0.012).negate().mul(1)).mul(U.core).mul(float(1.2).add(U.pulse.mul(2.5)));
      // bras de spirale discrets (angle polaire + torsion)
      const theta = atan(d0.y, d0.x);
      const arms = smoothstep(0.55, 1.0, sin(theta.mul(3).add(ang.mul(2.2)).add(r.mul(18))).mul(0.5).add(0.5));
      const swirlLight = arms.mul(fall).mul(abs(U.strength)).mul(smoothstep(0.02, 0.12, r)).mul(0.05);
      const tint = vec3(U.tint as unknown as N);
      const outc = col.mul(hole.oneMinus()).add(tint.mul(ring.add(swirlLight)));
      post.output = vec4(outc, 1);

      await stage.compile();
      c.bag.fn(() => tl?.kill());
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add(params, 'twist', 0, 14, 0.1).name('torsion').onChange((v: number) => (U.twist.value = v));
      c.gui.add(params, 'radius', 0.1, 0.8, 0.01).name('rayon').onChange((v: number) => (RAD.value = v));
      play();
    },
    replay() {
      play();
    },
    update(_dt, t) {
      U.strength.value = S.strength * S.dir;
      U.core.value = S.core;
      U.pulse.value = S.pulse;
      const pose = ctx.input.pose(0.2);
      // paquet aspiré en spirale (rayon et échelle → 0, rotation qui accélère)
      const k = S.suck;
      const a = k * k * 9;
      packRig.position.set(Math.cos(a) * 0.25 * k * (1 - k), Math.sin(a) * 0.25 * k * (1 - k), -k * 0.3);
      packRig.rotation.set(pose.x, pose.y, a * 0.6);
      packRig.scale.setScalar(Math.max(0.001, 1 - k));
      // la bonne carte sort du cœur, se déroule et grandit
      const o = S.out;
      cardRig.position.set(0, Math.sin(t * 1.2) * 0.005 * o, 0.05 * o);
      cardRig.rotation.set(pose.x * o, pose.y * o, (1 - o) * -5);
      cardRig.scale.setScalar(Math.max(0.001, o));
      // cartes de remplissage : éjectées en éventail, elles s'éloignent et disparaissent
      extras.forEach((e, i) => {
        const p = S.extras;
        e.visible = p > 0.001 && p < 0.999;
        const dirA = (i / extras.length) * Math.PI * 2 + 0.6;
        const dist = p * 1.6;
        e.position.set(Math.cos(dirA) * dist, Math.sin(dirA) * dist * 0.7, -0.2 + p * 0.6);
        e.rotation.set(p * 2 + i, p * 3, p * 4 * (i % 2 ? 1 : -1));
        e.scale.setScalar(Math.max(0.001, Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.7));
      });
      stage.scene.updateMatrixWorld();
      proj.set(0, 0, 0).project(stage.camera);
      // screenUV : origine en haut à gauche
      U.center.value.set(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
