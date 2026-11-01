import { DirectionalLight, MeshPhysicalNodeMaterial, Vector3, type Mesh } from 'three/webgpu';
import {
  bumpMap,
  float,
  floor,
  length,
  luminance,
  max,
  mix,
  modelWorldMatrixInverse,
  mx_fractal_noise_float,
  normalMap,
  normalize,
  pow,
  reflect,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  dot,
  clamp,
  select,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardLayers, createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { hashCell, thinFilm, voronoi, saturate3 } from '../../core/tsl';
import { Spring, EASE } from '../../core/ease';

/**
 * 001 — Holo thin-film.
 * Le foil est un métal recouvert d'un film mince : la couleur naît de l'interférence
 * (12 longueurs d'onde intégrées), le grain de foil est un micro-relief par cellule.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const intro = { t: 0, on: true };
  const yawIn = new Spring(Math.PI, 70, 11);
  let idle = 0;

  const params = {
    pattern: 'cracked' as 'linear' | 'radial' | 'cracked' | 'nebula',
    strength: 0.7,
    thickness: 400,
    amplitude: 260,
    ior: 1.45,
    diffraction: 0.35,
    grain: 0.16,
    sparkle: 1,
    saturation: 1.0,
    builtin: false,
  };
  const U = {
    pattern: uniform(2),
    strength: uniform(params.strength),
    thickness: uniform(params.thickness),
    amplitude: uniform(params.amplitude),
    ior: uniform(params.ior),
    diffraction: uniform(params.diffraction),
    grain: uniform(params.grain),
    sparkle: uniform(params.sparkle),
    saturation: uniform(params.saturation),
    builtin: uniform(0),
    tier: uniform(0),
    lightDir: uniform(new Vector3(-0.5, 0.7, 0.6).normalize()),
  };

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      U.tier.value = rar.tier;
      // chaque tier a son motif de foil par défaut (modifiable dans le panneau)
      params.pattern = (['linear', 'linear', 'linear', 'radial', 'cracked', 'nebula'] as const)[rar.tier];
      stage = createStage(c, { bg: ['#2b2723', '#0d0c0b'], env: 'studio', envIntensity: 1.0 });
      const { scene } = stage;
      const key = new DirectionalLight(0xfff1e0, 1.4);
      key.position.copy(U.lightDir.value).multiplyScalar(5);
      scene.add(key);

      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const L = cardLayers(art, { bg: 0.03, subject: 0.014, fg: -0.003 });

      // ── zones foil (selon la rareté) : cadre (masque R) + fond d'illustration (≥ épique) + sujet (mythique)
      const tier = U.tier;
      const winFoil = L.window.mul(L.subject.a.oneMinus()).mul(select(tier.greaterThanEqual(3), 1.0, 0.0));
      const subjFoil = L.window.mul(L.subject.a).mul(L.fx.g).mul(select(tier.greaterThanEqual(5), 0.8, 0.0));
      const foil = clamp(L.masks.r.mul(L.window.oneMinus()).add(winFoil).add(subjFoil), 0, 1).toVar();

      // ── grain de foil : micro-facettes par cellule
      const cellUV = uv().mul(vec2(170, 237));
      const cell = floor(cellUV);
      const h1 = hashCell(cell, 11), h2 = hashCell(cell, 12), h3 = hashCell(cell, 13);
      const tilt = vec2(h1.sub(0.5), h2.sub(0.5)).mul(U.grain).mul(foil);
      const nTS = normalize(vec3(tilt, 1));

      // ── champ d'épaisseur du film (motif de foil)
      const q = uv().sub(0.5).mul(vec2(CARD.w, CARD.h)).mul(10);
      const pLinear = sin(dot(q, vec2(0.8, 0.6)).mul(2.2)).mul(0.5).add(0.5);
      const pRadial = sin(length(q.sub(vec2(0, 0.6))).mul(3.4)).mul(0.5).add(0.5);
      const vor = voronoi(q.mul(1.3), float(0.9));
      const pCracked = vor.z.add(smoothstep(0.0, 0.08, vor.y.sub(vor.x)).oneMinus().mul(0.3));
      const pNebula = mx_fractal_noise_float(vec3(q.mul(0.35), 1.7), 4).mul(0.9).add(0.5);
      const pat = select(U.pattern.equal(0), pLinear, select(U.pattern.equal(1), pRadial, select(U.pattern.equal(2), pCracked, pNebula)));

      const V = L.view;
      // pseudo-réseau de diffraction : la teinte "glisse" quand on incline la carte
      const grating = dot(V.xy, vec2(0.7, 0.7)).mul(U.diffraction).mul(900);
      const d = U.thickness.add(pat.sub(0.5).mul(U.amplitude)).add(h3.sub(0.5).mul(14)).add(grating);
      const cosI = max(dot(nTS, V), 0.05);
      const film = saturate3(thinFilm(d, cosI, U.ior, 0.95), U.saturation);

      // l'encre imprimée filtre le foil : les encres sombres l'éteignent
      const artCol = L.color;
      const inkLight = smoothstep(0.04, 0.5, luminance(artCol));
      // le papier du cadre reste lisible : le foil y est plus discret que dans l'illustration
      const zone = mix(float(0.55), float(1.0), L.window);
      const metal = foil.mul(inkLight).mul(zone).mul(U.strength);
      const foilCol = mix(vec3(0.92), film, 0.85).mul(mix(vec3(1), pow(artCol, vec3(0.5)), 0.55)).mul(1.15);

      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = mix(artCol, mix(foilCol, artCol, U.builtin), metal);
      m.metalnessNode = metal;
      m.roughnessNode = mix(mix(float(0.6), float(0.34), L.window), float(0.24).add(h1.mul(0.08)), metal);
      const nWithGrain = normalMap(vec4(nTS.mul(0.5).add(0.5), 1).xyz);
      m.normalNode = bumpMap(L.masks.g, float(0.6), nWithGrain);
      m.clearcoatNode = float(0.35);
      m.clearcoatRoughnessNode = float(0.18);
      // mode comparatif : iridescence native de MeshPhysicalNodeMaterial
      m.iridescenceNode = foil.mul(U.builtin);
      m.iridescenceIORNode = U.ior;
      m.iridescenceThicknessNode = d.clamp(100, 1200);

      // paillettes : facettes alignées sur la lampe
      const Lobj = normalize(modelWorldMatrixInverse.mul(vec4(U.lightDir, 0)).xyz);
      const R = reflect(V.negate(), nTS);
      const glint = pow(max(dot(R, Lobj), 0), 220).mul(smoothstep(0.9, 0.99, h2)).mul(metal).mul(U.sparkle);
      const emisSubj = L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.5);
      m.emissiveNode = film.mul(glint).mul(6).add(emisSubj);

      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      scene.add(card);
      this.replay!();

      const g = c.gui;
      g.add(params, 'pattern', ['linear', 'radial', 'cracked', 'nebula']).name('motif').onChange((v: string) => (U.pattern.value = ['linear', 'radial', 'cracked', 'nebula'].indexOf(v)));
      g.add(params, 'strength', 0, 1, 0.01).name('intensité foil').onChange((v: number) => (U.strength.value = v));
      g.add(params, 'thickness', 150, 1200, 1).name('épaisseur (nm)').onChange((v: number) => (U.thickness.value = v));
      g.add(params, 'amplitude', 0, 900, 1).name('variation (nm)').onChange((v: number) => (U.amplitude.value = v));
      g.add(params, 'ior', 1.1, 2.4, 0.01).name('IOR film').onChange((v: number) => (U.ior.value = v));
      g.add(params, 'diffraction', 0, 1.5, 0.01).name('diffraction').onChange((v: number) => (U.diffraction.value = v));
      g.add(params, 'grain', 0, 1.2, 0.01).name('grain foil').onChange((v: number) => (U.grain.value = v));
      g.add(params, 'sparkle', 0, 3, 0.01).name('paillettes').onChange((v: number) => (U.sparkle.value = v));
      g.add(params, 'saturation', 0.5, 2.5, 0.01).name('saturation').onChange((v: number) => (U.saturation.value = v));
      g.add(params, 'builtin').name('iridescence native').onChange((v: boolean) => (U.builtin.value = v ? 1 : 0));
      U.pattern.value = ['linear', 'radial', 'cracked', 'nebula'].indexOf(params.pattern);
    },
    replay() {
      intro.t = 0;
      intro.on = true;
      yawIn.set(Math.PI);
      yawIn.target = 0;
      ctx.sfx.whoosh(0.5, 0.2);
    },
    update(dt, t) {
      intro.t += dt;
      yawIn.update(dt);
      const busy = ctx.input.inside || ctx.input.dragging || ctx.input.gyroEnabled;
      idle = busy ? 0 : idle + dt;
      applyPose(card, ctx, 0.38);
      // balancement d'attente : on montre le foil même sans interaction
      const k = EASE.breathe(Math.min(1, Math.max(0, idle - 1.2) / 1.5));
      card.rotation.y += yawIn.value + Math.sin(t * 0.7) * 0.32 * k;
      card.rotation.x += Math.sin(t * 0.53 + 1) * 0.16 * k;
      card.position.y = Math.sin(t * 0.9) * 0.006;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
