import { CanvasTexture, Color, DirectionalLight, MeshPhysicalNodeMaterial, NoColorSpace, type Mesh } from 'three/webgpu';
import {
  atan,
  color,
  float,
  floor,
  length,
  mix,
  normalMap,
  select,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  sin,
  abs,
  normalize,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { cardArtFor, type CardArt } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardLayers, createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { makeCanvas } from '../../core/art/canvas';
import { hashCell, type N } from '../../core/tsl';
import { rng } from '../../core/ease';

/** Métal par tier : gaufrage à sec (commune) → cuivre → argent → or rose → or → chrome noir. */
const METALS = ['#000000', '#b8754a', '#c8cbd0', '#d8a28e', '#e0b04e', '#26262b'];

/**
 * Carte de relief : hauteur = filets/texte en relief (profil biseauté par double flou),
 * fenêtre légèrement enfoncée, motif gaufré à sec dans le papier, fibres. Normales par Sobel (CPU).
 */
function buildNormalMap(art: CardArt, seed: number): CanvasTexture {
  const src = art.canvases.masks;
  const frame = art.canvases.frame;
  const W = src.width, H = src.height;
  const grab = (blur: number, from: HTMLCanvasElement, ch: 0 | 1 | 2 | 3) => {
    const { c, g } = makeCanvas(W, H);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.filter = blur ? `blur(${blur}px)` : 'none';
    g.drawImage(from, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = d[i * 4 + ch] / 255;
    void c;
    return out;
  };
  const s = W / 768;
  const r1 = grab(1.2 * s, src, 1);
  const r2 = grab(4 * s, src, 1);
  // fenêtre = 1 − alpha du cadre (cadre dessiné en alpha sur fond noir → on lit l'alpha via un canvas transparent)
  const winC = makeCanvas(W, H);
  winC.g.filter = `blur(${3 * s}px)`;
  winC.g.drawImage(frame, 0, 0);
  const fa = winC.g.getImageData(0, 0, W, H).data;
  // motif gaufré à sec : losanges fins + fibres
  const pat = makeCanvas(W, H);
  const pg = pat.g;
  pg.fillStyle = '#000';
  pg.fillRect(0, 0, W, H);
  pg.strokeStyle = '#fff';
  pg.lineWidth = 1.1 * s;
  pg.filter = `blur(${0.7 * s}px)`;
  for (let i = -H; i < W + H; i += 14 * s) {
    pg.beginPath();
    pg.moveTo(i, 0);
    pg.lineTo(i + H * 0.6, H);
    pg.moveTo(i, 0);
    pg.lineTo(i - H * 0.6, H);
    pg.stroke();
  }
  const r = rng(seed);
  pg.filter = `blur(${0.5 * s}px)`;
  pg.strokeStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 2500; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = (3 + r() * 9) * s;
    pg.lineWidth = 0.6 * s;
    pg.beginPath();
    pg.moveTo(x, y);
    pg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    pg.stroke();
  }
  const pd = pg.getImageData(0, 0, W, H).data;
  const Hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const win = 1 - fa[i * 4 + 3] / 255;
    const relief = r1[i] * 0.55 + r2[i] * 0.45;
    const blind = (pd[i * 4] / 255) * (1 - win) * (1 - Math.min(1, relief * 3));
    Hf[i] = relief * 1.0 - win * 0.35 - blind * 0.06;
  }
  const { c, g } = makeCanvas(W, H);
  const img = g.createImageData(W, H);
  const k = 6.0 * s;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const xl = Hf[y * W + Math.max(0, x - 1)], xr = Hf[y * W + Math.min(W - 1, x + 1)];
      const yu = Hf[Math.max(0, y - 1) * W + x], yd = Hf[Math.min(H - 1, y + 1) * W + x];
      let nx = -(xr - xl) * k, ny = (yd - yu) * k;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      img.data[i * 4] = (nx * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * 004 — Gaufrage & foil brossé.
 * Une carte d'imprimeur : papier coton, dorure à chaud brossée (anisotrope), gaufrage biseauté,
 * vernis sélectif sur le sujet. La lampe rasante révèle le relief.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  let rake: DirectionalLight;
  const params = { brush: 'soleil' as 'linéaire' | 'tourné' | 'soleil', relief: 1.0, aniso: 0.85, raking: true, varnish: true };
  const U = {
    brush: uniform(2),
    relief: uniform(1),
    aniso: uniform(0.85),
    varnish: uniform(1),
    metal: uniform(new Color(METALS[4])),
  };

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      U.metal.value.set(METALS[rar.tier]);
      stage = createStage(c, { bg: ['#2a2622', '#0c0b0a'], env: 'gallery', envIntensity: 0.9 });
      rake = new DirectionalLight(0xfff2e2, 2.2);
      rake.position.set(-3, 0.4, 1.2);
      stage.scene.add(rake);

      const cd = cardForRarity(c.rarity);
      const { art, back } = await cardArtFor(cd, c.rarity, c.bag);
      const nTex = c.bag.add(buildNormalMap(art, cd.seed));
      const L = cardLayers(art, { bg: 0.02, subject: 0.01, fg: -0.002 });

      // dorure à chaud = les éléments en relief (nom, filets, chiffres, médaillon) ; légendaire+ : + rayons du fond
      const stamped = smoothstep(0.45, 0.7, L.masks.g).mul(L.window.oneMinus());
      const foil = rar.tier === 0 ? float(0) : stamped;
      // direction de brossage dans l'espace tangent
      const p = uv().sub(vec2(0.5, 0.52)).mul(vec2(CARD.w, CARD.h));
      const dLinear = normalize(vec2(1, 0.35));
      const dSpun = normalize(vec2(p.y.negate(), p.x).add(1e-5));
      const dSun = normalize(p.add(1e-5));
      const dir = select(U.brush.equal(0), dLinear, select(U.brush.equal(1), dSpun, dSun));
      // micro-rayures : bandes perpendiculaires au brossage
      const coord = select(U.brush.equal(0), p.dot(vec2(-0.33, 0.94)), select(U.brush.equal(1), length(p), atan(p.y, p.x).mul(0.18)));
      const lines = hashCell(vec2(floor(coord.mul(2200)), 1.0), 3);
      const scratch = abs(sin(coord.mul(9000).add(lines.mul(6.28)))).pow(8).mul(lines.greaterThan(0.6).select(1, 0.2));

      const metalCol = U.metal as unknown as N;
      const mythicTwoTone = rar.tier === 5 ? smoothstep(0.4, 0.6, L.masks.g).mul(0.85) : float(0);
      const finalMetal = mix(metalCol, color('#e8c068'), mythicTwoTone);

      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = mix(L.color, finalMetal.mul(mix(float(0.92), float(1.05), lines)), foil);
      m.metalnessNode = foil;
      m.roughnessNode = mix(mix(float(0.82), float(0.5), L.window), float(0.2).add(scratch.mul(0.18)).add(lines.mul(0.06)), foil);
      m.anisotropyNode = dir.mul(U.aniso).mul(foil);
      m.normalNode = normalMap(texture(nTex), vec2(U.relief, U.relief));
      // vernis sélectif : seulement le sujet de l'illustration
      m.clearcoatNode = L.subject.a.mul(L.window).mul(U.varnish);
      m.clearcoatRoughnessNode = float(0.04);
      m.sheenNode = vec3(0.12).mul(foil.oneMinus()).mul(L.window.oneMinus());
      m.sheenRoughnessNode = float(0.8);

      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial('#efe8da', '#3a2c22'));
      stage.scene.add(card);
      await stage.compile();

      const g = c.gui;
      g.add(params, 'brush', ['linéaire', 'tourné', 'soleil']).name('brossage').onChange((v: string) => (U.brush.value = ['linéaire', 'tourné', 'soleil'].indexOf(v)));
      g.add(params, 'aniso', 0, 1, 0.01).name('anisotropie').onChange((v: number) => (U.aniso.value = v));
      g.add(params, 'relief', 0, 3, 0.01).name('relief').onChange((v: number) => (U.relief.value = v));
      g.add(params, 'raking').name('lampe rasante (orbite)');
      g.add(params, 'varnish').name('vernis sélectif').onChange((v: boolean) => (U.varnish.value = v ? 1 : 0));
      U.brush.value = 2;
    },
    update(dt, t) {
      applyPose(card, ctx, 0.42);
      // la lampe rasante tourne lentement autour de la carte : le relief "vit"
      if (params.raking) {
        const a = t * 0.45;
        rake.position.set(Math.cos(a) * 3, Math.sin(a) * 2.2, 0.9);
        rake.intensity = 2.2;
      } else {
        rake.position.set(-3, 0.4, 1.2);
      }
      void dt;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
