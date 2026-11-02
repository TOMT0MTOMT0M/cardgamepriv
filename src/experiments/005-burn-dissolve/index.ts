import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  Plane,
  Raycaster,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  color,
  exp,
  float,
  hash,
  instanceIndex,
  length,
  luminance,
  mix,
  mx_fractal_noise_float,
  normalLocal,
  positionLocal,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  cos,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { createPackGeometry, createPackMaterials, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { EASE } from '../../core/ease';
import type { N } from '../../core/tsl';

/** Couleur du bord de combustion : feu "physique" pour les bas tiers, feu teinté au-delà. */
function edgeColorFor(r: Rarity): Color {
  if (r.tier <= 2) return new Color('#ff7a2a');
  if (r.tier === 5) return new Color('#fff3e0');
  return new Color(r.accentHex).lerp(new Color('#ffb060'), 0.35);
}

/**
 * 005 — Dissolve / brûlure.
 * Le paquet brûle depuis le point touché : front de combustion bruité, zone carbonisée qui s'enroule,
 * liseré de braise, cendres et escarbilles qui se détachent exactement quand le front les atteint.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  const rig = new Group();
  const cardRig = new Group();
  const B = uniform(-0.2); // progression du front (unités monde)
  const IGN = uniform(new Vector2(0.18, -0.4)); // point d'allumage (espace local xy)
  const EDGE = uniform(new Color('#ff7a2a'));
  const EDGEn = EDGE as unknown as N;
  const cardHeat = uniform(0);
  let burning = false;
  let done = false;
  let tl: gsap.core.Timeline | null = null;
  let tw: gsap.core.Tween | null = null;
  const reveal = { k: 0 };
  const params = { speed: 0.42, curl: 1, haze: 1 };
  const SPD = uniform(params.speed), CURL = uniform(1), HAZE = uniform(1), BURNING = uniform(0);
  const ray = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();

  // champ de combustion partagé (carte & particules évaluent la même fonction)
  const field = (p: N): N => {
    const d = length(p.sub(IGN));
    const n1 = mx_fractal_noise_float(vec3(p.mul(4.2), 0.37), 4, 2.1, 0.5).mul(0.2);
    const n2 = mx_fractal_noise_float(vec3(p.mul(26), 1.3), 2, 2.0, 0.5).mul(0.025);
    return d.add(n1).add(n2);
  };
  let maxF = 1.75;

  function ignite(at?: Vector2) {
    if (burning || done) return;
    burning = true;
    if (at) IGN.value.copy(at);
    B.value = -0.02;
    // durée = distance au coin le plus lointain + marge de bruit
    const ig = IGN.value;
    let far = 0;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) far = Math.max(far, Math.hypot(sx * PACK.w / 2 - ig.x, sy * PACK.h / 2 - ig.y));
    maxF = far + 0.28;
    const dur = maxF / params.speed * (1 + rar.tier * 0.1);
    ctx.sfx.thump(0.25, 70);
    ctx.sfx.rumble(dur * 0.8, 0.25);
    tw = gsap.to(B, { value: maxF, duration: dur, ease: 'none' });
    // crépitements
    const crackle = window.setInterval(() => burning && ctx.sfx.tear(0.04 + Math.random() * 0.05, 0.08 + Math.random() * 0.1), 140);
    ctx.bag.fn(() => clearInterval(crackle));
    tw.eventCallback('onComplete', () => {
      clearInterval(crackle);
      finish();
    });
  }

  function finish() {
    burning = false;
    done = true;
    tl = gsap.timeline();
    tl.to(reveal, { k: 1, duration: 1.1, ease: EASE.settle, onStart: () => ctx.sfx.chime(rar.tier, 0.18) });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      EDGE.value.copy(edgeColorFor(rar));
      stage = createStage(c, { bg: ['#1f1b18', '#080706'], env: 'warm', envIntensity: 0.8, fill: 0.62, frameH: PACK.h, frameW: PACK.w });
      const key = new DirectionalLight(0xffe2c4, 1.4);
      key.position.set(-1.5, 2, 3);
      stage.scene.add(key, rig, cardRig);

      // ── paquet qui brûle
      const art = c.bag.add(await generatePackArt(PACK_STYLES.tide));
      const mats = createPackMaterials(art);
      const p = positionLocal.xy;
      const f = field(p);
      const front = f.sub(B); // > 0 : intact ; ~0 : bord
      const char = smoothstep(0.075, 0.004, front);
      const ember = exp(front.max(0).mul(-180));
      const glow = exp(front.max(0).mul(-38)).mul(0.35);
      const flick = mx_fractal_noise_float(vec3(p.mul(18), time.mul(3)), 2).mul(0.5).add(0.75);
      for (const m of mats) {
        m.side = DoubleSide;
        m.maskNode = front.greaterThan(0);
        m.colorNode = mix(m.colorNode as N, color('#120a06'), char.mul(0.92));
        m.roughnessNode = mix(m.roughnessNode as N, float(0.95), char);
        m.metalnessNode = mix(m.metalnessNode as N, float(0), char);
        m.emissiveNode = EDGEn.mul(ember.mul(5).add(glow)).mul(flick);
        // le bord carbonisé s'enroule vers l'extérieur
        const curl = smoothstep(0.06, 0.0, front).mul(0.035).mul(CURL);
        m.positionNode = positionLocal.add(normalLocal.mul(curl)).add(vec3(0, curl.mul(0.4), 0));
        c.bag.add(m);
      }
      const pack = new Mesh(c.bag.add(createPackGeometry(48, 72)), mats);
      rig.add(pack);

      // ── escarbilles (additives) et cendres (sombres) : libérées quand le front atteint leur point
      const mkParticles = (n: number, ash: boolean) => {
        const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: ash ? NormalBlending : AdditiveBlending });
        const salt = ash ? 7000 : 0;
        const h1 = hash(instanceIndex.add(salt)), h2 = hash(instanceIndex.add(salt + 13)), h3 = hash(instanceIndex.add(salt + 29)), h4 = hash(instanceIndex.add(salt + 51));
        const p0 = vec2(h1.sub(0.5).mul(PACK.w * 0.96), h2.sub(0.5).mul(PACK.h * 0.96));
        const f0 = field(p0);
        const age = B.sub(f0).div(SPD); // secondes depuis la libération
        const life = h3.mul(1.6).add(ash ? 1.6 : 0.7);
        const alive = smoothstep(0.0, 0.05, age).mul(smoothstep(life, life.mul(0.6), age));
        const tt = age.max(0);
        const rise = ash ? 0.12 : 0.35;
        const wob = vec3(sin(tt.mul(2.3).add(h4.mul(40))).mul(0.06), 0, cos(tt.mul(1.7).add(h1.mul(30))).mul(0.05));
        const pos = vec3(p0.x.add(h4.sub(0.5).mul(0.08).mul(tt)), p0.y.add(tt.mul(rise)).add(tt.mul(tt).mul(ash ? 0.02 : 0.08)), h3.sub(0.5).mul(0.05).add(tt.mul(0.05))).add(wob.mul(tt));
        mat.positionNode = pos;
        const disc = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
        if (ash) {
          const cooled = mix(EDGEn.mul(0.6), color('#2a2522'), smoothstep(0.0, 0.5, tt));
          mat.colorNode = vec4(cooled, disc.mul(alive).mul(0.85));
          mat.scaleNode = h2.mul(0.012).add(0.006);
        } else {
          const heat = exp(tt.mul(-2.2));
          mat.colorNode = vec4(EDGEn.mul(heat.mul(3).add(0.3)), disc.mul(alive));
          mat.scaleNode = h2.mul(0.005).add(0.002);
        }
        const s = new Sprite(mat);
        s.count = n;
        s.frustumCulled = false;
        c.bag.add(mat);
        return s;
      };
      const q = c.quality === 'mobile' ? 0.45 : 1;
      rig.add(mkParticles(Math.round(1800 * q), false), mkParticles(Math.round(900 * q), true));

      // ── la carte, intacte au cœur des flammes
      const { art: cardArt, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(cardArt, back);
      card.front.emissiveNode = (card.front.emissiveNode as N).add(EDGEn.mul(cardHeat).mul(0.12));
      cardRig.add(card.mesh);

      // ── post : bloom des braises + brume de chaleur (réfraction écran pilotée par l'émissif flouté)
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const bl = post.own(bloom(post.emissive!, 0.55, 0.4, 0.1));
      const heat = smoothstep(0.08, 0.5, luminance(bl)).mul(HAZE).mul(BURNING);
      const wobble = vec2(
        mx_fractal_noise_float(vec3(screenUV.mul(vec2(18, 9)), time.mul(1.4)), 2),
        mx_fractal_noise_float(vec3(screenUV.mul(vec2(18, 9)).add(5), time.mul(1.4).add(3)), 2),
      ).mul(0.0045);
      const hazy = post.color.sample(screenUV.add(wobble.mul(heat)));
      post.output = hazy.add(bl);

      await c.renderer.compileAsync(stage.scene, stage.camera);
      c.bag.fn(() => {
        tl?.kill();
        tw?.kill();
      });
      c.bag.fn(
        c.input.onTap((x, y) => {
          ray.setFromCamera(new Vector2(x, y), stage.camera);
          plane.set(new Vector3(0, 0, 1), 0).applyMatrix4(rig.matrixWorld);
          if (ray.ray.intersectPlane(plane, hit)) {
            rig.worldToLocal(hit);
            ignite(new Vector2(Math.max(-PACK.w / 2, Math.min(PACK.w / 2, hit.x)), Math.max(-PACK.h / 2, Math.min(PACK.h / 2, hit.y))));
          } else ignite();
        }),
      );
      const dbg = new URLSearchParams(location.search).get('burn');
      if (dbg) {
        IGN.value.set(0.12, -0.25);
        B.value = parseFloat(dbg);
        BURNING.value = 1;
      }
      c.gui.add(params, 'speed', 0.15, 1.2, 0.01).name('vitesse du front').onChange((v: number) => (SPD.value = v));
      c.gui.add(params, 'curl', 0, 3, 0.01).name('enroulement').onChange((v: number) => (CURL.value = v));
      c.gui.add(params, 'haze', 0, 3, 0.01).name('brume de chaleur').onChange((v: number) => (HAZE.value = v));
    },
    replay() {
      tl?.kill();
      tw?.kill();
      burning = false;
      done = false;
      reveal.k = 0;
      B.value = -0.2;
    },
    update(_dt, t) {
      const pose = ctx.input.pose(0.25);
      rig.rotation.set(pose.x * 0.6, pose.y * 0.6, 0);
      // la carte s'avance une fois libérée
      cardRig.position.set(0, Math.sin(t * 1.1) * 0.004 * reveal.k, reveal.k * 0.12);
      // tant qu'elle est dans le booster, la carte suit exactement son inclinaison (sinon elle glisse derrière les trous)
      cardRig.rotation.set(pose.x * (0.6 + reveal.k * 0.4), pose.y * (0.6 + reveal.k * 0.4), 0);
      const burnt = Math.max(0, Math.min(1, B.value / maxF));
      // la carte tiédit sous les flammes puis refroidit en s'avançant
      cardHeat.value = burning ? burnt * 0.5 : done ? Math.max(0, 1 - reveal.k) * 0.5 : 0;
      BURNING.value += ((burning ? 1 : 0) - BURNING.value) * Math.min(1, _dt * 2);
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
