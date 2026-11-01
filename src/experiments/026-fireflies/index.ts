import {
  Color, DirectionalLight, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, PointLight, SphereGeometry, Vector3,
} from 'three/webgpu';
import { color, float, hash, instanceIndex, instancedBufferAttribute, mx_noise_float, positionLocal, positionWorld, sin, time, uniform, vec3, vec4 } from 'three/tsl';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE, rng, springCurve } from '../../core/ease';
import type { N } from '../../core/tsl';

const COUNTS = [40, 70, 120, 200, 320, 480];
/** Couplage de Kuramoto par tier. Critique ≈ 1.0 pour la dispersion de fréquences choisie. */
const COUPLING = [0.25, 1.15, 2.2, 3.4, 5.2, 8];
const TWO_PI = Math.PI * 2;

interface Fly {
  p: Vector3;
  v: Vector3;
  phi: number;
  w: number;
  seed: [number, number, number, number];
  light: PointLight;
  b: number;
}

/**
 * 026 — Lucioles.
 * Nuit. Des lucioles s'approchent d'une carte posée de dos. Chacune clignote à son rythme ; plus la carte est rare,
 * plus elles se synchronisent (oscillateurs de Kuramoto). La rareté s'entend et se voit comme un rythme commun
 * avant d'être une couleur. Quand l'essaim bat à l'unisson, le grand éclair retourne la carte.
 * Chaque luciole est une vraie PointLight : Forward+ (ClusteredLighting, r185).
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let bloomNode: ReturnType<typeof bloom>;
  const flies: Fly[] = [];
  let bodies: InstancedMesh;
  let colAttr: InstancedBufferAttribute;
  const cardRig = new Group();
  const C = new Vector3(0, -0.06, 0);
  const st = { K: 0, gather: 0, burst: 0, flip: Math.PI, hue: 0, spread: 0 };
  const params = { lights: true, R: 0 };
  let tl: gsap.core.Timeline | null = null;
  let rtl: gsap.core.Timeline | null = null;
  let tier = 0;
  let revealed = false;
  let elapsed = 0;
  let lastPsi = 0;
  let baseCol = new Color('#d6ef77');
  let hitCol = new Color('#d6ef77');
  const tmpC = new Color();
  const m4 = new Matrix4();
  const glowU = uniform(0);

  function start() {
    tl?.kill();
    rtl?.kill();
    revealed = false;
    elapsed = 0;
    Object.assign(st, { K: 0, gather: 0, burst: 0, flip: Math.PI, hue: 0, spread: 0 });
    const r = rng(7 + tier);
    for (const f of flies) {
      const a = r() * TWO_PI, rad = 1.6 + r() * 1.2;
      f.p.set(Math.cos(a) * rad, -0.3 + r() * 0.8, Math.sin(a) * rad * 0.7 - 0.4);
      f.v.set(0, 0, 0);
      f.phi = r() * TWO_PI;
    }
    const ramp = 2.2 + rarity(ctx.rarity).suspense * 1.6;
    tl = gsap.timeline();
    tl.to(st, { gather: 1, duration: ramp * 0.8, ease: EASE.breathe }, 0.2).to(st, { K: COUPLING[tier], duration: ramp, ease: EASE.heave }, 0.6);
    // les tiers bas : personne ne se met d'accord, la carte se retourne d'elle-même, sans éclat
    if (tier <= 1) tl.call(() => reveal(), [], ramp + 2.4);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    const big = tier >= 2;
    const r = (rtl = gsap.timeline());
    if (big) {
      r.to(st, { gather: 1.35, duration: 0.55, ease: EASE.heave })
        .call(() => (ctx.sfx.thump(0.25 + tier * 0.08), ctx.sfx.chime(tier, 0.1 + tier * 0.03), tier >= 4 && ctx.sfx.shimmer(tier, 2.6, 0.07)))
        .to(st, { burst: 1, duration: 0.08 })
        .to(st, { flip: 0, duration: 1.1, ease: springCurve(0.5, 11) }, '<')
        .to(st, { burst: 0, duration: 1.6, ease: EASE.glide })
        .to(st, { gather: 0.75, spread: 1, duration: 2.2, ease: EASE.glide }, '<');
      if (tier >= 3) r.to(st, { hue: 1, duration: 1.4, ease: EASE.breathe }, '<');
    } else {
      r.to(st, { flip: 0, duration: 1.3, ease: EASE.settle, onStart: () => ctx.sfx.whoosh(0.4, 0.08) }).to(st, { gather: 0.15, spread: 1, duration: 3, ease: EASE.glide }, '<');
    }
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      tier = rar.tier;
      baseCol = new Color('#d6ef77');
      hitCol = new Color(tier >= 3 ? rar.accentHex : '#d6ef77');
      stage = createStage(c, { bg: ['#0b0e12', '#020304'], env: 'night', envIntensity: 0.12, fov: 32 });

      const prevLighting = c.renderer.lighting;
      const lighting = new ClusteredLighting(1024, 32, 24, 64);
      c.renderer.lighting = lighting;
      c.bag.fn(() => {
        c.renderer.lighting = prevLighting;
        lighting.dispose();
      });

      const moon = new DirectionalLight(0x8ea4c8, 0.3); // lune basse, côté spectateur : la silhouette de la carte se lit
      moon.position.set(1.2, 1.6, 1.4);
      stage.scene.add(moon);

      // carte debout, de dos
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(art, back);
      card.front.emissiveNode = (card.front.emissiveNode as N).add(color(rar.accentHex).mul(card.layers.masks.r.mul(0.8)).mul(glowU));
      cardRig.add(card.mesh);
      cardRig.position.copy(C);
      stage.scene.add(cardRig);

      // sol + herbes (instanciées, balancement TSL)
      const gm = new MeshStandardNodeMaterial();
      gm.colorNode = vec4(color('#151b12').mul(mx_noise_float(positionWorld.xz.mul(6)).mul(0.25).add(0.85)), 1);
      gm.roughnessNode = float(0.95);
      const ground = new Mesh(new PlaneGeometry(14, 14).rotateX(-Math.PI / 2), gm);
      ground.position.y = -0.5;
      stage.scene.add(ground);
      const mobile = c.quality === 'mobile';
      const bladeG = new PlaneGeometry(0.014, 0.16, 1, 4).translate(0, 0.08, 0);
      const bm = new MeshStandardNodeMaterial({ side: DoubleSide });
      const h = hash(instanceIndex);
      const sway = sin(time.mul(1.1).add(h.mul(6.28)).add(positionWorld.x.mul(1.5))).mul(0.18).mul(positionLocal.y.mul(positionLocal.y).mul(36));
      bm.positionNode = positionLocal.add(vec3(sway.mul(0.12), 0, sway.mul(0.05)));
      bm.colorNode = vec4(mix3(color('#17240f'), color('#2b3a18'), h), 1);
      bm.roughnessNode = float(0.75);
      const nBlades = mobile ? 700 : 2200;
      const grass = new InstancedMesh(bladeG, bm, nBlades);
      const gr = rng(3);
      for (let i = 0; i < nBlades; i++) {
        let x = 0, z = 0;
        do {
          const a = gr() * TWO_PI, rad = 0.25 + Math.sqrt(gr()) * 2.6;
          x = Math.cos(a) * rad;
          z = Math.sin(a) * rad * 0.8 - 0.4;
        } while (Math.abs(x) < 0.42 && z > -0.12 && z < 1.2);
        const s = 0.5 + gr() * 1.2;
        m4.makeRotationY(gr() * Math.PI).scale(new Vector3(1, s, 1)).setPosition(x, -0.5, z);
        grass.setMatrixAt(i, m4);
      }
      stage.scene.add(grass);

      // lucioles : corps instanciés (HDR → bloom) + une PointLight chacune
      const n = Math.round(COUNTS[tier] * (mobile ? 0.5 : 1));
      const body = new SphereGeometry(0.0045, 8, 6);
      colAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
      colAttr.setUsage(DynamicDrawUsage);
      const fm = new MeshBasicNodeMaterial();
      fm.colorNode = vec4(instancedBufferAttribute(colAttr) as N, 1);
      bodies = new InstancedMesh(body, fm, n);
      bodies.instanceMatrix.setUsage(DynamicDrawUsage);
      bodies.frustumCulled = false;
      stage.scene.add(bodies);
      const r = rng(11);
      for (let i = 0; i < n; i++) {
        const light = new PointLight(baseCol, 0, 0.65, 2);
        stage.scene.add(light);
        flies.push({
          p: new Vector3(),
          v: new Vector3(),
          phi: 0,
          w: TWO_PI * (0.85 + r() * 0.3),
          seed: [r() * 10, r() * 10, r() * 10, 0.6 + r() * 0.8],
          light,
          b: 0,
        });
      }

      post = createPipeline(c, stage.scene, stage.camera);
      bloomNode = post.own(bloom(post.color, 0.5, 0.5, 0.85));
      post.output = (post.color as N).add(bloomNode);
      place(c.width, c.height);
      await stage.compile();
      c.bag.fn(() => (tl?.kill(), rtl?.kill()));
      c.bag.fn(c.input.onTap(() => start()));
      c.gui.add(params, 'lights').name('vraies lumières (Forward+)').onChange((v: boolean) => flies.forEach((f) => (f.light.visible = v)));
      c.gui.add(params, 'R', 0, 1, 0.01).name('synchronisation R').listen().disable();
      c.gui.add({ n }, 'n').name('lucioles = PointLights').disable();
      start();
      // vérification : ?ff=12 pré-simule 12 s (timelines comprises) pour capturer le climax sur un GPU logiciel
      const ff = +(new URLSearchParams(location.search).get('ff') ?? 0);
      if (ff > 0) {
        tl!.pause();
        let rt = 0;
        for (let i = 1; i <= ff * 40; i++) {
          tl!.time(i / 40);
          if (rtl) (rtl.pause(), rtl.time((rt += 1 / 40)));
          step(1 / 40, i / 40, i === ff * 40);
        }
        tl!.resume();
        rtl?.resume();
      }
    },
    replay() {
      start();
    },
    update(dtFrame, t) {
      // sous-pas : la simulation reste en temps réel même à bas fps (plafonnée à 0.3 s par frame)
      const total = Math.min(dtFrame, 0.3);
      const steps = Math.max(1, Math.ceil(total / (1 / 40)));
      for (let k = 0; k < steps; k++) step(total / steps, t - total + ((k + 1) * total) / steps, k === steps - 1);
      // carte
      const p = ctx.input.pose(0.12);
      cardRig.rotation.set(p.x, st.flip + p.y, 0);
      bloomNode.strength.value = 0.45 + st.burst * (0.4 + tier * 0.12);
      glowU.value = st.burst * (0.3 + tier * 0.15) + (revealed ? tier * 0.02 : 0);
      post.render();
    },
    resize(w, h) {
      place(w, h);
    },
    dispose() {},
  };

  function step(dt: number, t: number, last: boolean) {
    elapsed += dt;
    // ── Kuramoto : champ moyen ──
    let sx = 0, sy = 0;
    for (const f of flies) {
      sx += Math.cos(f.phi);
      sy += Math.sin(f.phi);
    }
    const R = Math.hypot(sx, sy) / flies.length;
    const psi = Math.atan2(sy, sx);
    params.R = R;
    for (const f of flies) f.phi = (((f.phi + (f.w + st.K * R * Math.sin(psi - f.phi)) * dt) % TWO_PI) + TWO_PI) % TWO_PI;
    // un battement collectif = un petit clic (le rythme devient audible quand ça se synchronise)
    if (lastPsi < 0 && psi >= 0 && R > 0.45) ctx.sfx.tick(0.6 + R * 0.6, 0.04 + R * 0.08);
    lastPsi = psi;
    if (!revealed && tier >= 2 && st.K > COUPLING[tier] * 0.85 && R > 0.9) reveal();
    if (!revealed && tier >= 2 && elapsed > 14) reveal();

    // ── vol ──
    const rT = 0.95 - 0.45 * Math.min(1, st.gather) * (0.4 + 0.6 * R) + st.spread * 0.35 - (st.gather > 1 ? (st.gather - 1) * 0.6 : 0);
    const d = new Vector3();
    flies.forEach((f, i) => {
      const [a, b, c2, sp] = f.seed;
      f.v.x += Math.sin(t * 0.7 * sp + a) * 0.5 * dt;
      f.v.y += Math.sin(t * 0.9 * sp + b) * 0.3 * dt;
      f.v.z += Math.sin(t * 0.6 * sp + c2) * 0.5 * dt;
      d.copy(f.p).sub(C);
      const L = d.length() || 1;
      const pull = (rT - L) * (0.6 + st.gather * 1.4);
      f.v.addScaledVector(d, (pull / L) * dt);
      // un peu de tourbillon autour de la carte
      f.v.x += (-d.z / L) * 0.12 * dt * (1 + st.burst * 6);
      f.v.z += (d.x / L) * 0.12 * dt * (1 + st.burst * 6);
      if (f.p.y < -0.44) f.v.y += (-0.44 - f.p.y) * 6 * dt;
      if (Math.abs(f.p.z) < 0.07 && Math.abs(f.p.x) < 0.36 && Math.abs(f.p.y - C.y) < 0.48) f.v.z += Math.sign(f.p.z || 1) * 1.5 * dt;
      f.v.multiplyScalar(Math.exp(-1.4 * dt));
      f.p.addScaledVector(f.v, dt);
      // ── éclat : bref, à la traversée de phase 0 ──
      let ph = f.phi;
      if (ph > Math.PI) ph -= TWO_PI;
      const flash = Math.exp(-((ph / 0.32) ** 2));
      f.b = 0.03 + flash * (1 + st.burst * 2.5);
      tmpC.copy(baseCol).lerp(hitCol, st.hue);
      if (tier >= 5 && st.hue > 0) tmpC.offsetHSL(((Math.atan2(d.z, d.x) / TWO_PI + t * 0.08) % 1) * st.hue, 0, 0);
      f.light.color.copy(tmpC);
      f.light.intensity = f.b * 0.24;
      colAttr.setXYZ(i, tmpC.r * f.b * 6, tmpC.g * f.b * 6, tmpC.b * f.b * 6);
      m4.makeTranslation(f.p.x, f.p.y, f.p.z);
      bodies.setMatrixAt(i, m4);
      f.light.position.copy(f.p);
    });
    if (last) {
      colAttr.needsUpdate = true;
      bodies.instanceMatrix.needsUpdate = true;
    }
  }

  function place(w: number, h: number) {
    const a = w / h;
    const k = Math.max(1, 1.05 / a);
    const c = stage.camera;
    c.aspect = a;
    c.position.set(0, 0.18 * k, 2.75 * k);
    c.lookAt(0, -0.14, 0);
    c.updateProjectionMatrix();
  }
}

function mix3(a: N, b: N, t: N): N {
  return a.mul(float(1).sub(t)).add(b.mul(t));
}
