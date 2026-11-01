import {
  Color,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Sprite,
  SpriteNodeMaterial,
} from 'three/webgpu';
import {
  color,
  float,
  instancedBufferAttribute,
  length,
  mix,
  positionWorld,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec3,
  vec4,
  hash,
  instanceIndex,
  exp,
  vec2,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createCardMesh, CARD } from '../../core/cardModel';
import { EASE, rng } from '../../core/ease';
import type { N } from '../../core/tsl';

const GLASS_T = 0.032;

/** Teinte du verre par tier : verre clair → verre de mer → saphir → grenat → citrine → opale. */
const TINTS = ['#e9efe9', '#bfe0cc', '#9fb9ea', '#e3a0aa', '#f2cc8a', '#f4f1ff'];

/**
 * Échantillonne l'alpha du sujet pour placer des micro-gravures dans le volume
 * (comme un cristal gravé au laser), la profondeur suit la luminance.
 */
function etchPoints(subject: HTMLCanvasElement, fx: HTMLCanvasElement, count: number, seed: number) {
  const W = 192, H = Math.round((192 * subject.height) / subject.width);
  const sc = document.createElement('canvas');
  sc.width = W;
  sc.height = H;
  const g = sc.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(subject, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  g.clearRect(0, 0, W, H);
  g.drawImage(fx, 0, 0, W, H);
  const e = g.getImageData(0, 0, W, H).data;
  const cand: number[] = [];
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 110) cand.push(i);
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const bri = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const i = cand[Math.floor(r() * cand.length)] ?? 0;
    const px = (i % W) + r(), py = Math.floor(i / W) + r();
    const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    const u = px / W, v = 1 - py / H;
    pos[k * 3] = (u - 0.5) * CARD.w;
    pos[k * 3 + 1] = (v - 0.5) * CARD.h;
    // les zones claires flottent vers l'avant, avec un peu de jitter → volume
    pos[k * 3 + 2] = (lum - 0.5) * GLASS_T * 0.55 + (r() - 0.5) * GLASS_T * 0.35;
    bri[k] = 0.35 + lum * 0.65 + (e[i * 4] / 255) * 0.8;
  }
  return { pos, bri };
}

/**
 * 007 — Carte de cristal.
 * Un bloc de verre aux coins arrondis : transmission, dispersion, teinte d'absorption selon le tier ;
 * le sujet est gravé dans la masse (nuage de micro-fractures), les textes sont dépolis en surface.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let rar: Rarity;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  const intro = { k: 0 };
  const params = { ior: 1.55, dispersion: 0.6, roughness: 0.04, etch: 1 };
  const U = { ior: uniform(1.55), disp: uniform(0.6), rough: uniform(0.04), etch: uniform(1) };

  return {
    params,
    async setup(c) {
      ctx = c;
      rar = rarity(c.rarity);
      params.dispersion = 0.15 + rar.tier * 0.18;
      U.disp.value = params.dispersion;
      stage = createStage(c, { bg: ['#1d1c1b', '#0a0a09'], env: 'studio', envIntensity: 1.1, fill: 0.66 });
      const key = new DirectionalLight(0xffffff, 1.2);
      key.position.set(-1.5, 2.5, 2);
      stage.scene.add(key, rig);

      // ── mur du fond : barres de lumière douces → la réfraction et la dispersion deviennent lisibles
      const wallMat = new MeshBasicNodeMaterial();
      const x = positionWorld.x, y = positionWorld.y;
      const bars = smoothstep(0.6, 0.98, sin(x.mul(9).add(sin(y.mul(1.3)).mul(0.6))).mul(0.5).add(0.5));
      const fall = exp(length(positionWorld.xy.mul(vec2(0.6, 0.9))).mul(-1.2));
      wallMat.colorNode = mix(color('#0d0c0b'), color('#d8cfc0'), bars.mul(fall).mul(0.55)).add(color('#2a2622').mul(fall.mul(0.5)));
      const wall = new Mesh(new PlaneGeometry(9, 6), wallMat);
      wall.position.z = -1.6;
      stage.scene.add(wall);

      const cd = cardForRarity(c.rarity);
      const { art } = await cardArtFor(cd, c.rarity, c.bag);

      // ── verre
      const tint = new Color(TINTS[rar.tier]);
      const glass = new MeshPhysicalNodeMaterial();
      const mk = texture(art.masks, uv());
      const frost = smoothstep(0.35, 0.7, mk.g).mul(U.etch);
      glass.colorNode = mix(color(tint), color('#ffffff'), frost.mul(0.6));
      glass.metalnessNode = float(0);
      glass.roughnessNode = mix(U.rough, float(0.55), frost);
      glass.transmissionNode = mix(float(1), float(0.35), frost);
      glass.iorNode = U.ior;
      glass.thicknessNode = float(GLASS_T * 2.2);
      glass.dispersionNode = U.disp;
      glass.attenuationColorNode = color(tint);
      glass.attenuationDistanceNode = float(0.12 + (5 - rar.tier) * 0.05);
      glass.specularIntensityNode = float(1);
      if (rar.tier === 5) {
        glass.iridescenceNode = float(0.7);
        glass.iridescenceIORNode = float(1.35);
        glass.iridescenceThicknessNode = sin(uv().y.mul(9).add(uv().x.mul(5))).mul(180).add(420);
      }
      c.bag.add(glass);
      // tranche : verre (ou serti d'or pour légendaire+)
      const rim = rar.tier >= 4 ? new MeshStandardNodeMaterial({ color: rar.tier === 5 ? 0xdedede : 0xe2b354, metalness: 1, roughness: 0.22 }) : glass;
      c.bag.add(rim);
      const slab = createCardMesh(glass, glass, rim, { thickness: GLASS_T, segX: 4, segY: 6 });
      rig.add(slab);

      // ── gravure laser interne
      const count = c.quality === 'mobile' ? 14000 : 42000;
      const { pos, bri } = etchPoints(art.canvases.subject, art.canvases.fx, count, cd.seed);
      const pAttr = new InstancedBufferAttribute(pos, 3);
      const bAttr = new InstancedBufferAttribute(bri, 1);
      // opaque : rendu AVANT le verre → capté par la transmission (sinon masqué par la profondeur de la face avant)
      const dots = new SpriteNodeMaterial({ transparent: false, depthWrite: true });
      dots.positionNode = instancedBufferAttribute(pAttr);
      const b = instancedBufferAttribute(bAttr) as N;
      const tw = sin(time.mul(1.5).add(hash(instanceIndex).mul(40))).mul(0.15).add(0.85);
      const disc = smoothstep(0.5, 0.2, length(uv().sub(0.5)));
      dots.maskNode = disc.greaterThan(0.3);
      dots.colorNode = vec4(vec3(1.0, 0.98, 0.94).mul(b).mul(tw).mul(U.etch).mul(1.4), 1);
      dots.scaleNode = hash(instanceIndex.add(7)).mul(0.0014).add(0.0012);
      const cloud = new Sprite(dots);
      cloud.count = count;
      cloud.frustumCulled = false;
      rig.add(cloud);
      c.bag.add(dots);
      c.bag.fn(() => {
        pAttr.array = new Float32Array(0);
        bAttr.array = new Float32Array(0);
      });

      await stage.compile();
      const g = c.gui;
      g.add(params, 'ior', 1.1, 2.4, 0.01).name('IOR').onChange((v: number) => (U.ior.value = v));
      g.add(params, 'dispersion', 0, 3, 0.01).name('dispersion').onChange((v: number) => (U.disp.value = v));
      g.add(params, 'roughness', 0, 0.4, 0.005).name('rugosité').onChange((v: number) => (U.rough.value = v));
      g.add(params, 'etch', 0, 2, 0.01).name('gravure').onChange((v: number) => (U.etch.value = v));
      this.replay!();
    },
    replay() {
      intro.k = 0;
    },
    update(dt, t) {
      intro.k = Math.min(1, intro.k + dt / 1.6);
      const e = EASE.glide(intro.k);
      const p = ctx.input.pose(0.45);
      rig.rotation.set(p.x + Math.sin(t * 0.4) * 0.05, p.y + (1 - e) * 1.2 + Math.sin(t * 0.3) * 0.12, 0);
      rig.position.z = (1 - e) * -0.3;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
