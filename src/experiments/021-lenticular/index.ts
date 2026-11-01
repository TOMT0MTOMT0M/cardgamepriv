import { DirectionalLight, MeshPhysicalNodeMaterial, type Mesh } from 'three/webgpu';
import { atan, clamp, float, floor, fract, mix, normalMap, select, sin, smoothstep, texture, uniform, uv, vec3, abs } from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { ensureFonts, generateBackArt, generateCardArt } from '../../core/art';
import { cardForRarity, type CardData, type CardPalette } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial, viewDirObject } from '../../core/cardMaterial';
import { createCardMesh } from '../../core/cardModel';
import { encodeNormal, type N } from '../../core/tsl';

/** Heures du jour pour les vues lenticulaires (même carte, autre lumière). */
const TIMES: Array<Partial<CardPalette>> = [
  { sky: '#7e9bb5', haze: '#f2d9a8', glow: '#fff4d6' }, // aube
  { sky: '#3b2a26', haze: '#c4572f', glow: '#ffb35c' }, // couchant
  { sky: '#0f1422', haze: '#2c3a5c', glow: '#cfe0ff' }, // nuit
  { sky: '#1b0f1e', haze: '#7a2d5a', glow: '#ff9ad0' }, // nuit d'orage
  { sky: '#05070a', haze: '#1f4a3c', glow: '#b8ffd6' }, // aurore
];

/**
 * 021 — Lenticulaire.
 * Une feuille de lentilles cylindriques posée sur une image entrelacée : selon l'angle, on voit une autre "heure"
 * de la même carte. Nervures visibles (normal map), diaphonie entre vues, transitions qui balaient la carte.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const params = { lpi: 90, gain: 1.4, ridges: 0.35 };
  const U = { lpi: uniform(90), gain: uniform(1.4), ridges: uniform(0.35) };

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      const nViews = Math.min(5, 2 + Math.floor(rar.tier * 0.7));
      stage = createStage(c, { bg: ['#26221e', '#0b0a09'], env: 'studio', fill: 0.7 });
      const key = new DirectionalLight(0xfff2e4, 1.1);
      key.position.set(-1, 2, 3);
      stage.scene.add(key);
      await ensureFonts();
      const base: CardData = cardForRarity(c.rarity);
      const views = Array.from({ length: nViews }, (_, k) => {
        const cd: CardData = { ...base, palette: { ...base.palette, ...TIMES[k % TIMES.length] } };
        return c.bag.add(generateCardArt(cd, c.rarity, { scale: 0.75, flatOnly: true }));
      });
      const back = c.bag.add(generateBackArt(undefined, 0.75));

      const V = viewDirObject();
      const u = uv().x;
      const lensU = fract(u.mul(U.lpi));
      // angle de vue horizontal + effet loupe de la lentille (la bande visible dépend de la position sous la lentille)
      const ang = atan(V.x, V.z).mul(U.gain).add(lensU.sub(0.5).mul(0.25));
      const f = clamp(ang.div(0.9).add(0.5), 0, 0.9999).mul(nViews);
      const idx = floor(f);
      const fr = fract(f);
      const sample = (k: N): N => {
        let out: N = texture(views[0].flat).rgb;
        for (let i = 1; i < nViews; i++) out = select(k.equal(i), texture(views[i].flat).rgb, out);
        return out;
      };
      const a = sample(idx);
      const b = sample(clamp(idx.add(1), 0, nViews - 1));
      // diaphonie : les vues voisines se mélangent près des transitions
      const col = mix(a, b, smoothstep(0.82, 1.0, fr).mul(0.5));
      const ridge = vec3(sin(lensU.mul(Math.PI * 2)).mul(U.ridges), 0, 1).normalize();
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = col;
      m.roughnessNode = float(0.35);
      m.normalNode = normalMap(encodeNormal(ridge));
      m.clearcoatNode = float(1);
      m.clearcoatRoughnessNode = float(0.08);
      m.clearcoatNormalNode = normalMap(encodeNormal(ridge));
      m.sheenNode = vec3(0.05).mul(abs(sin(lensU.mul(Math.PI))));
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial('#dfe3e6', '#9aa3a8'));
      stage.scene.add(card);
      await stage.compile();
      c.gui.add(params, 'lpi', 20, 200, 1).name('lentilles / largeur').onChange((v: number) => (U.lpi.value = v));
      c.gui.add(params, 'gain', 0.5, 3, 0.01).name('sensibilité à l’angle').onChange((v: number) => (U.gain.value = v));
      c.gui.add(params, 'ridges', 0, 1, 0.01).name('relief des nervures').onChange((v: number) => (U.ridges.value = v));
      c.gui.add({ n: nViews }, 'n').name('vues (selon la rareté)').disable();
    },
    update(_dt, t) {
      applyPose(card, ctx, 0.5);
      const idle = ctx.input.inside || ctx.input.gyroEnabled ? 0 : 1;
      card.rotation.y += Math.sin(t * 0.6) * 0.42 * idle;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
