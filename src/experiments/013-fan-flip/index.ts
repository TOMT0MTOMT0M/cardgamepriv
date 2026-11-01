import { Color, DirectionalLight, Group, Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import { float, uniform, vec3 } from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { createPackMesh, generatePackArt, PACK_STYLES } from '../../core/pack';
import { cardArtFor, generateCardArt, generateBackArt, ensureFonts } from '../../core/art';
import { CARDS, cardForRarity } from '../../core/cardData';
import { rarity, type RarityId } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE, springCurve } from '../../core/ease';
import type { N } from '../../core/tsl';

interface Slot {
  rig: Group;
  mesh: Mesh;
  rar: RarityId;
  s: { x: number; y: number; z: number; rx: number; ry: number; rz: number; sc: number; glow: number; dim: number };
  fan: { x: number; y: number; z: number; rz: number };
  revealed: boolean;
  G: { value: number };
  D: { value: number };
}

/**
 * 013 — Éventail + flip.
 * Les cartes sortent du paquet et s'ouvrent en éventail, faces cachées. Chaque retournement a un timing
 * propre à sa rareté : les communes claquent, la dernière (la bonne) se soulève, hésite, puis se retourne au ralenti.
 * La caméra et la mise au point accompagnent.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const slots: Slot[] = [];
  const packRig = new Group();
  let tl: gsap.core.Timeline | null = null;
  let busy = false;
  let next = 0;
  let autoCall: gsap.core.Tween | null = null;
  const cam = { x: 0, y: 0.05, z: 0, look: new Vector3(0, 0.05, 0), fov: 34 };
  let camBase = new Vector3();
  const U = { focus: uniform(2.6), focal: uniform(0.9), bokeh: uniform(1), bloom: uniform(0.15) };
  const params = { auto: true, dof: true };
  let bloomRef: ReturnType<typeof bloom>;
  const DOF = uniform(1);

  /** Retournement automatique en temps réel (indépendant du framerate). */
  function scheduleAuto(delay: number) {
    autoCall?.kill();
    autoCall = gsap.delayedCall(delay, () => params.auto && !busy && flip(next));
  }

  function flip(i: number) {
    const sl = slots[i];
    if (!sl || sl.revealed || busy) return;
    busy = true;
    const T = rarity(sl.rar).tier;
    const isLast = i === slots.length - 1;
    const s = sl.s;
    const anti = 0.12 + T * 0.12 + (isLast ? 0.25 : 0);
    const pause = T * 0.16 + (isLast ? 0.35 : 0);
    const flipDur = 0.32 + T * 0.06;
    tl = gsap.timeline({
      onComplete: () => {
        busy = false;
        sl.revealed = true;
        next = i + 1;
        if (!isLast) scheduleAuto(0.55);
        if (isLast) hero(i);
      },
    });
    // caméra : s'approche de la carte active
    tl.to(cam, { x: s.x * 0.45, y: s.y * 0.3 + 0.03, z: isLast ? -0.55 : -0.25, duration: 0.6, ease: EASE.breathe }, 0);
    tl.to(cam.look, { x: s.x * 0.8, y: s.y * 0.8, duration: 0.6, ease: EASE.breathe }, 0);
    // anticipation : la carte se soulève et recule d'un rien
    tl.to(s, { z: s.z + 0.14 + T * 0.02, rx: -0.18, sc: 1.04, duration: anti, ease: EASE.heave, onStart: () => ctx.sfx.tick(0.8 + T * 0.1, 0.18) }, 0.1);
    // pause / hésitation (micro-oscillation pour les hauts tiers)
    if (pause > 0.05) tl.to(s, { rz: s.rz + (T >= 3 ? 0.04 : 0.01), duration: pause / 4, yoyo: true, repeat: 3, ease: 'sine.inOut', onStart: () => T >= 3 && ctx.sfx.riser(pause + flipDur * 0.6, T, 0.08) });
    // retournement
    const flipAt = tl.duration();
    tl.to(s, { ry: 0, rx: 0, duration: flipDur, ease: T >= 2 ? springCurve(0.5, 15) : EASE.snap, onStart: () => ctx.sfx.whoosh(0.25, 0.15 + T * 0.03) }, flipAt);
    if (T >= 3) {
      tl.call(() => void gsap.to(tl!, { timeScale: rarity(sl.rar).slowmo, duration: 0.05 }), [], flipAt + flipDur * 0.25);
      tl.call(() => void gsap.to(tl!, { timeScale: 1, duration: 0.35 }), [], flipAt + flipDur * 0.6);
    }
    // payoff
    tl.call(() => {
      ctx.sfx.thump(0.15 + T * 0.07);
      if (T >= 1) ctx.sfx.chime(T, 0.1 + T * 0.03);
    }, [], flipAt + flipDur * 0.55);
    tl.to(s, { glow: 0.4 + T * 0.35, duration: 0.08 }, flipAt + flipDur * 0.55).to(s, { glow: T * 0.06, duration: 1.2, ease: EASE.glide });
    tl.to(U.bloom, { value: 0.15 + T * 0.18, duration: 0.08 }, flipAt + flipDur * 0.55).to(U.bloom, { value: 0.15, duration: 1.2, ease: EASE.glide });
    tl.to(s, { z: s.z + 0.04, sc: 1, duration: 0.6, ease: EASE.settle }, flipAt + flipDur);
    if (!isLast) tl.to(cam, { x: 0, y: 0.05, z: 0, duration: 0.9, ease: EASE.breathe }, flipAt + flipDur).to(cam.look, { x: 0, y: 0.05, duration: 0.9, ease: EASE.breathe }, '<');
  }

  /** La bonne carte vient au premier plan, les autres reculent et s'assombrissent. */
  function hero(i: number) {
    const s = slots[i].s;
    const h = gsap.timeline();
    h.to(s, { x: 0, y: 0.06, z: 0.55, rz: 0, sc: 1.18, duration: 1.0, ease: EASE.settle }, 0.2)
      .to(cam, { x: 0, y: 0.05, z: -0.35, duration: 1.2, ease: EASE.breathe }, 0.2)
      .to(cam.look, { x: 0, y: 0.06, duration: 1.2, ease: EASE.breathe }, 0.2);
    slots.forEach((o, k) => k !== i && h.to(o.s, { z: o.s.z - 0.25, dim: 0.55, duration: 1.0, ease: EASE.glide }, 0.2));
  }

  function deal() {
    tl?.kill();
    autoCall?.kill();
    busy = true;
    next = 0;
    Object.assign(cam, { x: 0, y: 0.05, z: 0.25 });
    cam.look.set(0, -0.05, 0);
    packRig.position.set(0, -0.62, 0.05);
    packRig.rotation.set(-0.35, 0, 0);
    tl = gsap.timeline({ onComplete: () => ((busy = false), scheduleAuto(0.9)) });
    tl.to(cam, { z: 0, duration: 2.4, ease: EASE.breathe }, 0).to(cam.look, { y: 0.05, duration: 2.4, ease: EASE.breathe }, 0);
    slots.forEach((sl, k) => {
      sl.revealed = false;
      Object.assign(sl.s, { x: 0, y: -0.62, z: 0.04 - k * 0.006, rx: -0.35, ry: Math.PI, rz: 0, sc: 0.92, glow: 0, dim: 0 });
      const at = 0.35 + k * 0.14;
      tl!.to(sl.s, { y: 0.15, rx: 0, duration: 0.45, ease: EASE.heave, onStart: () => ctx.sfx.whoosh(0.3, 0.1) }, at)
        .to(sl.s, { x: sl.fan.x, y: sl.fan.y, z: sl.fan.z, rz: sl.fan.rz, sc: 1, duration: 0.75, ease: EASE.settle }, at + 0.32);
    });
    tl.to(packRig.position, { y: -1.6, duration: 0.8, ease: EASE.heave }, 0.35 + slots.length * 0.14 + 0.3);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#25211d', '#0a0908'], env: 'studio', fill: 0.42, fillPortrait: 0.3 });
      const key = new DirectionalLight(0xfff0e0, 1.3);
      key.position.set(-1, 2.5, 3);
      stage.scene.add(key, packRig);
      camBase = stage.camera.position.clone();

      // table
      const table = new Mesh(new PlaneGeometry(10, 10), new MeshStandardNodeMaterial({ color: 0x15120f, roughness: 0.85 }));
      table.position.z = -0.3;
      stage.scene.add(table);

      const pArt = c.bag.add(await generatePackArt(PACK_STYLES.tide));
      const pack = createPackMesh(pArt);
      (pack.material as Array<{ dispose(): void }>).forEach((m) => c.bag.add(m));
      pack.scale.setScalar(0.92);
      packRig.add(pack);

      // 5 cartes : 4 de remplissage (résolution réduite) + la bonne en dernier
      await ensureFonts();
      const hit = c.rarity;
      const fillers: RarityId[] = hit === 'common' ? ['common', 'common', 'common', 'common'] : ['common', 'uncommon', 'common', hit === 'uncommon' ? 'common' : 'uncommon'];
      const bArt = c.bag.add(generateBackArt(undefined, 0.6));
      const n = 5;
      for (let k = 0; k < n; k++) {
        const rid = k === n - 1 ? hit : fillers[k];
        const cd = k === n - 1 ? cardForRarity(hit) : CARDS[(k * 3 + 1) % CARDS.length];
        let art, back;
        if (k === n - 1) ({ art, back } = await cardArtFor(cd, rid, c.bag));
        else {
          art = c.bag.add(generateCardArt(cd, rid, { scale: 0.55 }));
          back = bArt;
        }
        const card = createStandardCard(art, back);
        const G = uniform(0), D = uniform(0);
        const sl: Slot = {
          rig: new Group(),
          mesh: card.mesh,
          rar: rid,
          s: { x: 0, y: 0, z: 0, rx: 0, ry: Math.PI, rz: 0, sc: 1, glow: 0, dim: 0 },
          fan: { x: 0, y: 0, z: 0, rz: 0 },
          revealed: false,
          G,
          D,
        };
        const tint = new Color(rarity(rid).accentHex);
        card.front.emissiveNode = (card.front.emissiveNode as N).add(vec3(tint.r, tint.g, tint.b).mul(card.layers.masks.r.mul(0.5).add(0.15)).mul(G));
        card.front.colorNode = (card.front.colorNode as N).mul(float(1).sub(D));
        // éventail : arc de cercle
        const a = (k - (n - 1) / 2) * 0.24;
        const R = 1.9;
        sl.fan = { x: Math.sin(a) * R * 0.62, y: Math.cos(a) * R * 0.18 - 0.28, z: k * 0.012, rz: -a * 0.85 };
        sl.rig.add(card.mesh);
        stage.scene.add(sl.rig);
        slots.push(sl);
      }

      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      bloomRef = post.own(bloom(post.emissive!, 0.15, 0.4, 0.0));
      const viewZ = post.scenePass.getViewZNode();
      const blurred = post.own(dof(post.color, viewZ, U.focus, U.focal, U.bokeh));
      post.output = (post.color as N).mix(blurred, DOF).add(bloomRef);

      await stage.compile();
      c.bag.fn(() => (tl?.kill(), autoCall?.kill()));
      c.bag.fn(c.input.onTap(() => !busy && flip(next)));
      c.gui.add(params, 'auto').name('retournement auto');
      c.gui.add(params, 'dof').name('profondeur de champ').onChange((v: boolean) => (DOF.value = v ? 1 : 0));
      deal();
    },
    replay() {
      deal();
    },
    update(dt, t) {
      const pose = ctx.input.pose(0.08);
      let focusTarget: Vector3 | null = null;
      slots.forEach((sl, k) => {
        const s = sl.s;
        sl.rig.position.set(s.x, s.y + Math.sin(t * 1.1 + k) * 0.003, s.z);
        sl.rig.rotation.set(s.rx + pose.x * 0.5, s.ry + pose.y * 0.5, s.rz);
        sl.rig.scale.setScalar(s.sc);
        sl.G.value = s.glow;
        sl.D.value = s.dim;
        if (k === Math.min(next, slots.length - 1)) focusTarget = sl.rig.position;
      });
      stage.camera.position.set(camBase.x + cam.x, camBase.y + cam.y, camBase.z + cam.z);
      stage.camera.lookAt(cam.look);
      if (focusTarget) U.focus.value += (stage.camera.position.distanceTo(focusTarget) - U.focus.value) * Math.min(1, dt * 4);
      bloomRef.strength.value = U.bloom.value;
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
      camBase = stage.camera.position.clone();
    },
    dispose() {},
  };
}
