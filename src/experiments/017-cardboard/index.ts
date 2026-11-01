import { CanvasTexture, DirectionalLight, MeshPhysicalNodeMaterial, NoColorSpace, RepeatWrapping, type Material, type Mesh } from 'three/webgpu';
import {
  abs,
  color,
  cos,
  float,
  length,
  luminance,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  normalGeometry,
  positionGeometry,
  sin,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
  sign,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardLayers, createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { Spring, rng, clamp as clampN } from '../../core/ease';
import { makeCanvas } from '../../core/art/canvas';
import type { N } from '../../core/tsl';

/** Rayures fines (vernis éraflé) : traits blancs flous sur noir, répétables. */
function scratchTexture(seed: number): CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  const r = rng(seed);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * 512, y = r() * 512, a = r() * Math.PI, l = 8 + Math.pow(r(), 3) * 160;
    g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.55})`;
    g.lineWidth = 0.5 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Usure par défaut : les cartes rares sont "mint", les communes ont vécu. */
const WEAR = [0.65, 0.45, 0.3, 0.15, 0.05, 0];

/**
 * 017 — Matière physique.
 * Une carte en carton qu'on plie entre les doigts (déformation cylindrique en vertex + normales exactes),
 * qui revient en vibrant ; vernis sélectif qui fait courir les reflets dans la courbure ; usure procédurale
 * (coins blanchis, rayures, jaunissement) — et un pli qui reste si on force trop.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const kx = new Spring(0, 260, 3.2); // courbure autour de l'axe Y (gauche/droite)
  const ky = new Spring(0, 260, 3.2); // courbure autour de l'axe X (haut/bas)
  const U = { kx: uniform(0), ky: uniform(0), wear: uniform(0), crease: uniform(0), varnish: uniform(1) };
  const params = { wear: 0, varnish: true, maxBend: 5.5 };
  let creaseAcc = 0;
  let grabbed = false;
  const dbgQ = new URLSearchParams(location.search).get('bend');
  const dbgBend = dbgQ ? parseFloat(dbgQ) : null;

  /** Pliage cylindrique (deux axes successifs) appliqué à la position et à la normale. */
  function bend(m: Material) {
    const nm = m as MeshPhysicalNodeMaterial;
    const safe = (k: N) => sign(k).mul(max(abs(k), 1e-4)).add(float(1e-4).mul(float(1).sub(abs(sign(k)))));
    const KX = safe(U.kx), KY = safe(U.ky);
    const p = positionGeometry, n = normalGeometry;
    // autour de Y : θ = κx·x, rayon local r = R − z
    // formes sans annulation : x' = sin(t)/κ − z·sin t ; z' = 2·sin²(t/2)/κ + z·cos t
    const tx = p.x.mul(KX);
    const sh = sin(tx.mul(0.5));
    const p1 = vec3(sin(tx).div(KX).sub(p.z.mul(sin(tx))), p.y, sh.mul(sh).mul(2).div(KX).add(p.z.mul(cos(tx))));
    const n1 = vec3(n.x.mul(cos(tx)).sub(n.z.mul(sin(tx))), n.y, n.x.mul(sin(tx)).add(n.z.mul(cos(tx))));
    // autour de X : θ = κy·y
    const ty = p1.y.mul(KY);
    const sy = sin(ty.mul(0.5));
    const p2 = vec3(p1.x, sin(ty).div(KY).sub(p1.z.mul(sin(ty))), sy.mul(sy).mul(2).div(KY).add(p1.z.mul(cos(ty))));
    const n2 = vec3(n1.x, n1.y.mul(cos(ty)).sub(n1.z.mul(sin(ty))), n1.y.mul(sin(ty)).add(n1.z.mul(cos(ty))));
    nm.positionNode = p2;
    nm.normalNode = transformNormalToView(n2);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      params.wear = WEAR[rar.tier];
      U.wear.value = params.wear;
      c.input.spinEnabled = false; // le drag plie la carte
      stage = createStage(c, { bg: ['#2a2622', '#0c0b0a'], env: 'studio', envIntensity: 1.1, fill: 0.68 });
      const key = new DirectionalLight(0xfff2e6, 1.0);
      key.position.set(-1.5, 2, 3);
      stage.scene.add(key);
      const cd = cardForRarity(c.rarity);
      const { art, back } = await cardArtFor(cd, c.rarity, c.bag);
      const scratch = c.bag.add(scratchTexture(cd.seed));
      const L = cardLayers(art, { bg: 0.012, subject: 0.006, fg: -0.001 });

      // ── usure procédurale
      const pl = uv().sub(0.5).mul(vec2(CARD.w, CARD.h));
      const q = abs(pl).sub(vec2(CARD.w / 2 - CARD.r, CARD.h / 2 - CARD.r));
      const edgeD = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(CARD.r).negate(); // distance au bord (>0 dedans)
      const corner = smoothstep(0.06, 0.0, length(max(q, 0))).mul(smoothstep(0.0, 0.02, min(q.x, q.y).add(0.02)));
      const fray = mx_fractal_noise_float(vec3(pl.mul(140), 0.5), 3).mul(0.0035);
      const edgeWear = smoothstep(max(U.wear.mul(0.004).add(0.0006).add(fray), 0.0002), 0.0, edgeD).mul(U.wear.mul(1.2).min(1));
      const cornerWear = corner.mul(U.wear).mul(mx_fractal_noise_float(vec3(pl.mul(60), 1.7), 3).mul(0.5).add(0.6));
      const scr = texture(scratch, uv().mul(vec2(1.4, 1.9))).r.mul(U.wear);
      const grime = mx_fractal_noise_float(vec3(pl.mul(5), 3.3), 4).mul(0.5).add(0.5).mul(smoothstep(0.08, 0.0, edgeD)).mul(U.wear);
      // pli permanent au centre si on a trop forcé
      const creaseLine = smoothstep(0.004, 0.0, abs(pl.x)).mul(U.crease);

      let col: N = L.color;
      col = mix(col, vec3(luminance(col)).mul(vec3(1.0, 0.97, 0.9)), U.wear.mul(0.22)); // encres passées, jaunissement
      col = col.mul(float(1).sub(grime.mul(0.18)));
      col = mix(col, color('#f3efe6'), edgeWear.max(cornerWear).max(creaseLine.mul(0.85)).clamp(0, 1));
      col = col.add(scr.mul(0.04));

      // ── vernis sélectif : sujet + filets/nom (relief) + motif losange en bordure
      const relief = smoothstep(0.4, 0.7, L.masks.g).mul(L.window.oneMinus());
      const spot = L.subject.a.mul(L.window).max(relief).mul(U.varnish);
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = col;
      m.metalnessNode = float(0);
      m.roughnessNode = mix(float(0.78), float(0.5), L.window).add(scr.mul(0.2));
      m.clearcoatNode = spot.mul(float(1).sub(scr.mul(0.7)));
      m.clearcoatRoughnessNode = float(0.03).add(scr.mul(0.25));
      m.emissiveNode = L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.4);
      const bm = createBackMaterial(back);
      const em = createEdgeMaterial('#ece5d6', '#2a2523');
      for (const x of [m, bm, em]) bend(x);
      card = createCardMesh(m, bm, em, { segX: 44, segY: 60, segCorner: 6 });
      stage.scene.add(card);
      await stage.compile();

      c.gui.add(params, 'wear', 0, 1, 0.01).name('usure').onChange((v: number) => (U.wear.value = v));
      c.gui.add(params, 'varnish').name('vernis sélectif').onChange((v: boolean) => (U.varnish.value = v ? 1 : 0));
      c.gui.add(params, 'maxBend', 1, 9, 0.1).name('courbure max');
      c.gui.add({ reset: () => ((creaseAcc = 0), (U.crease.value = 0)) }, 'reset').name('effacer le pli');
      c.bag.fn(c.input.onTap(() => kx.impulse(-14)));
    },
    replay() {
      creaseAcc = 0;
      U.crease.value = 0;
      kx.set(0);
      ky.set(0);
      kx.impulse(-18);
    },
    update(dt, t) {
      const inp = ctx.input;
      // geste : drag horizontal → pli autour de Y ; vertical → autour de X
      if (inp.dragging) {
        grabbed = true;
        const w = ctx.canvas.clientWidth || 800;
        kx.target = clampN(kx.target + (inp.dragDX / w) * 14, -params.maxBend, params.maxBend);
        ky.target = clampN(ky.target - (inp.dragDY / w) * 10, -params.maxBend * 0.7, params.maxBend * 0.7);
        kx.value += (kx.target - kx.value) * Math.min(1, dt * 18);
        ky.value += (ky.target - ky.value) * Math.min(1, dt * 18);
        kx.velocity = 0;
        ky.velocity = 0;
      } else {
        if (grabbed) {
          grabbed = false;
          ctx.sfx.tick(0.5, 0.22); // le "clac" du carton qui se détend
        }
        kx.target = 0;
        ky.target = 0;
        kx.update(dt);
        ky.update(dt);
      }
      // trop forcer laisse une marque
      if (Math.abs(kx.value) > params.maxBend * 0.85) creaseAcc = Math.min(1, creaseAcc + dt * 0.6);
      U.crease.value = creaseAcc;
      U.kx.value = kx.value;
      U.ky.value = ky.value;
      if (dbgBend !== null) U.kx.value = dbgBend;
      card.rotation.set(-inp.tiltY * 0.25 + Math.sin(t * 0.4) * 0.03, inp.tiltX * 0.32 + Math.sin(t * 0.5) * 0.05, 0);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
