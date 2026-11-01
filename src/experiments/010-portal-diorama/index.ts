import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  ConeGeometry,
  Matrix4,
} from 'three/webgpu';
import {
  abs,
  color,
  float,
  floor,
  fog,
  fract,
  hash,
  instanceIndex,
  length,
  mix,
  mx_fractal_noise_float,
  pass,
  positionLocal,
  positionWorld,
  positionWorldDirection,
  rangeFogFactor,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  texture,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardById } from '../../core/cardData';
import { rarity, type Rarity } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial, windowSDF } from '../../core/cardMaterial';
import { createCardMesh } from '../../core/cardModel';
import type { N } from '../../core/tsl';

/** Heure du jour par tier : la rareté change la lumière du monde derrière la fenêtre. */
const SKIES: Array<{ top: string; horizon: string; fog: string; sun: string; sunY: number; light: number; lit: number }> = [
  { top: '#8c949a', horizon: '#c9c6bd', fog: '#b9b6ad', sun: '#f2efe6', sunY: 0.5, light: 1.6, lit: 0.05 }, // couvert
  { top: '#6f8fa8', horizon: '#e8d9b8', fog: '#d6ccb4', sun: '#fff1cf', sunY: 0.25, light: 2.0, lit: 0.1 }, // matin
  { top: '#1d2c4a', horizon: '#7d8fb3', fog: '#5a6a8c', sun: '#cfe0ff', sunY: 0.12, light: 0.9, lit: 0.45 }, // heure bleue
  { top: '#2a1622', horizon: '#d2574a', fog: '#8a3a3a', sun: '#ffb070', sunY: 0.04, light: 1.3, lit: 0.6 }, // couchant pourpre
  { top: '#3a2a3c', horizon: '#ffb45c', fog: '#c98a52', sun: '#ffd27a', sunY: 0.08, light: 1.8, lit: 0.75 }, // heure dorée
  { top: '#05060c', horizon: '#1b2240', fog: '#121a30', sun: '#e9eeff', sunY: 0.35, light: 0.35, lit: 1.0 }, // nuit + aurore
];

/** Diorama low-poly : vallée embrumée, la Tour Muette, lune/soleil, nuages, oiseaux. */
function buildDiorama(sky: (typeof SKIES)[number], rar: Rarity, quality: 'high' | 'mobile') {
  const scene = new Scene();
  const root = new Group();
  scene.add(root);
  const d = positionWorldDirection;
  const h = d.y;
  let bg: N = mix(color(sky.horizon), color(sky.top), smoothstep(-0.05, 0.6, h));
  if (rar.tier === 5) {
    // aurore : rideaux de bruit le long de l'horizon
    const curtain = mx_fractal_noise_float(vec3(d.x.mul(3), time.mul(0.05), d.z.mul(3)), 3).mul(0.5).add(0.5);
    const band = smoothstep(0.05, 0.25, h).mul(smoothstep(0.65, 0.3, h));
    bg = bg.add(vec3(0.25, 0.9, 0.55).mul(curtain.pow(3).mul(band).mul(0.9)));
    const st = smoothstep(0.9975, 1.0, hash(floor(d.xy.mul(900)).dot(vec2(1, 157)))).mul(smoothstep(0.0, 0.2, h)).mul(0.8);
    bg = bg.add(vec3(st));
  }
  scene.backgroundNode = bg;
  scene.fogNode = fog(color(sky.fog), rangeFogFactor(3.5, 16));
  scene.add(new HemisphereLight(new Color(sky.top), new Color('#2a2420'), 0.6));
  const sun = new DirectionalLight(new Color(sky.sun), sky.light);
  sun.position.set(-3, 2 + sky.sunY * 6, -6);
  scene.add(sun);

  // terrain : plan déplacé par fBm, vallée au centre
  const terrMat = new MeshStandardNodeMaterial({ flatShading: true });
  const p = positionLocal;
  const valley = smoothstep(0.2, 1.6, abs(p.x)).mul(0.9);
  const hgt = mx_fractal_noise_float(vec3(p.xz.mul(0.55), 0.3), 5).mul(0.6).add(valley).mul(smoothstep(0.0, 1.0, p.z.negate().add(0.5)));
  terrMat.positionNode = vec3(p.x, hgt, p.z);
  terrMat.colorNode = mix(color('#2b2a24'), color('#6b6252'), smoothstep(0.1, 0.9, positionWorld.y.add(0.4)));
  terrMat.roughnessNode = float(0.95);
  const segs = quality === 'mobile' ? 90 : 180;
  const terrGeo = new PlaneGeometry(14, 14, segs, segs);
  terrGeo.rotateX(-Math.PI / 2);
  const terrain = new Mesh(terrGeo, terrMat);
  terrain.position.set(0, -0.36, -7.2);
  root.add(terrain);

  // la tour : segments empilés, fenêtres éclairées (grille hashée)
  const towerMat = new MeshStandardNodeMaterial({ flatShading: true });
  const cell = floor(uv().mul(vec2(14, 46)));
  const lit = hash(cell.x.add(cell.y.mul(97))).lessThan(float(sky.lit * 0.6 + 0.05));
  const win = smoothstep(0.3, 0.2, abs(fract(uv().x.mul(14)).sub(0.5))).mul(smoothstep(0.32, 0.22, abs(fract(uv().y.mul(46)).sub(0.5))));
  towerMat.colorNode = color('#2b2a30');
  towerMat.roughnessNode = float(0.85);
  towerMat.emissiveNode = color('#ffc874').mul(win.mul(float(lit)).mul(2.2));
  const tower = new Group();
  let y = 0;
  for (let i = 0; i < 9; i++) {
    const r0 = 0.11 - i * 0.008, r1 = r0 - 0.006;
    const hh = 0.17 - i * 0.008;
    const seg = new Mesh(new CylinderGeometry(r1, r0, hh, 12, 1), towerMat);
    seg.position.y = y + hh / 2;
    y += hh + 0.008;
    tower.add(seg);
  }
  const spire = new Mesh(new ConeGeometry(0.05, 0.3, 12), towerMat);
  spire.position.y = y + 0.15;
  tower.add(spire);
  tower.scale.setScalar(0.62);
  tower.position.set(0.2, -0.3, -3.4);
  root.add(tower);

  // astre + halo
  const orbMat = new MeshBasicNodeMaterial({ fog: false });
  orbMat.colorNode = color(sky.sun).mul(rar.tier === 5 ? 1.2 : 2.2);
  const orb = new Mesh(new SphereGeometry(0.35, 24, 16), orbMat);
  orb.position.set(-1.25, -0.05 + sky.sunY * 3.2, -9.5);
  root.add(orb);

  // nuages (sprites doux) et oiseaux
  const cloudMat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: true });
  const ci = instanceIndex;
  const c1 = hash(ci), c2 = hash(ci.add(31)), c3 = hash(ci.add(67));
  cloudMat.positionNode = vec3(c1.sub(0.5).mul(9).add(fract(time.mul(0.004).add(c2)).mul(2).sub(1)), c2.mul(1.0).add(0.15), c3.mul(-6).sub(4));
  const soft = smoothstep(0.5, 0.0, length(uv().sub(0.5).mul(vec2(1, 2.4))));
  cloudMat.colorNode = vec4(mix(color(sky.horizon), color('#ffffff'), 0.25), soft.mul(0.22));
  cloudMat.scaleNode = vec2(c3.mul(1.4).add(0.8), c3.mul(0.5).add(0.3));
  const clouds = new Sprite(cloudMat);
  clouds.count = 26;
  clouds.frustumCulled = false;
  root.add(clouds);

  const birdMat = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const bi = instanceIndex;
  const b1 = hash(bi.add(500)), b2 = hash(bi.add(900));
  const ang = time.mul(b1.mul(0.3).add(0.25)).add(b2.mul(6.28));
  birdMat.positionNode = vec3(sin(ang).mul(b1.mul(0.3).add(0.2)).add(0.2), b2.mul(0.25).add(0.45), sin(ang.add(1.57)).mul(0.25).sub(3.4));
  const bu = uv().sub(0.5);
  const flap = sin(time.mul(9).add(b2.mul(20))).mul(0.18);
  const vshape = smoothstep(0.06, 0.0, abs(bu.y.sub(abs(bu.x).mul(0.6).add(flap.mul(abs(bu.x).mul(2)))))).mul(smoothstep(0.5, 0.3, abs(bu.x)));
  birdMat.colorNode = vec4(color('#141214'), vshape);
  birdMat.scaleNode = float(0.045);
  const birds = new Sprite(birdMat);
  birds.count = 7;
  birds.frustumCulled = false;
  root.add(birds);

  return { scene, root };
}

/**
 * 010 — Carte-fenêtre.
 * La fenêtre d'illustration est un vrai portail : un diorama 3D vit derrière, rendu par une passe dédiée
 * (`pass(scene, camera)` échantillonnée en `screenUV`) avec la même caméra → parallaxe exacte quand on tilte.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  let dio: ReturnType<typeof buildDiorama>;
  const intro = { k: 0 };
  const scaleM = new Matrix4();
  const params = { depth: 1, glass: true };
  const GLASS = uniform(1);

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      const sky = SKIES[rar.tier];
      stage = createStage(c, { bg: ['#2a2622', '#0b0a09'], env: 'studio', fill: 0.7 });
      const key = new DirectionalLight(0xfff2e4, 1.1);
      key.position.set(-1, 2, 3);
      stage.scene.add(key);

      dio = buildDiorama(sky, rar, c.quality);
      c.bag.scene(dio.scene);

      const cd = cardById('tour-muette');
      const { art, back } = await cardArtFor(cd, c.rarity, c.bag);
      const portal = pass(dio.scene, stage.camera).context({ getUV: () => screenUV }) as unknown as N;
      c.bag.fn(() => (portal as unknown as { dispose(): void }).dispose?.());

      const m = new MeshPhysicalNodeMaterial();
      const fr = texture(art.frame);
      const win = fr.a.oneMinus();
      // ombre intérieure du cadre sur le monde (épaisseur de la fenêtre)
      const sd = windowSDF(uv());
      const inner = mix(float(0.35), float(1), smoothstep(0.0, 0.03, sd.negate()));
      m.colorNode = fr.rgb.mul(fr.a);
      m.emissiveNode = portal.rgb.mul(win).mul(inner);
      m.roughnessNode = mix(float(0.55), float(0.05), win);
      m.metalnessNode = float(0);
      m.clearcoatNode = win.mul(GLASS);
      m.clearcoatRoughnessNode = float(0.03);
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      stage.scene.add(card);
      await stage.compile();
      c.gui.add(params, 'depth', 0.3, 2.5, 0.01).name('profondeur du monde');
      c.gui.add(params, 'glass').name('vitre (clearcoat)').onChange((v: boolean) => (GLASS.value = v ? 1 : 0));
    },
    replay() {
      intro.k = 0;
    },
    update(dt, t) {
      intro.k = Math.min(1, intro.k + dt / 2);
      applyPose(card, ctx, 0.5);
      const idle = ctx.input.inside || ctx.input.gyroEnabled ? 0 : 1;
      card.rotation.y += Math.sin(t * 0.5) * 0.18 * idle;
      card.rotation.x += Math.sin(t * 0.37) * 0.06 * idle;
      // le diorama est solidaire de la carte (comme une boîte derrière la vitre), mis à l'échelle en profondeur
      card.updateMatrixWorld();
      dio.root.matrixAutoUpdate = false;
      dio.root.matrix.copy(card.matrixWorld);
      const s = params.depth;
      dio.root.matrix.multiply(scaleM.makeScale(1, 1, s));
      dio.root.matrixWorldNeedsUpdate = true;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
