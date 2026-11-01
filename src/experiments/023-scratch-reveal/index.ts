import { DirectionalLight, FloatType, MeshPhysicalNodeMaterial, Raycaster, RedFormat, StorageTexture, Vector2, type Mesh } from 'three/webgpu';
import {
  Fn,
  NodeAccess,
  clamp,
  color,
  dot,
  float,
  hash,
  instanceIndex,
  int,
  ivec2,
  length,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  normalMap,
  smoothstep,
  storageTexture,
  texture,
  textureStore,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardLayers, createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh } from '../../core/cardModel';
import { EASE } from '../../core/ease';
import { encodeNormal, type N } from '../../core/tsl';

const TW = 384, TH = 536;
const GW = 48, GH = 67;

/**
 * 023 — Grattage.
 * La carte arrive recouverte d'une pellicule argentée à gratter. Le masque est une **storage texture en lecture-écriture**
 * (r183) tamponnée en compute le long du geste ; au-delà de 60 %, le reste s'écaille tout seul et la carte se révèle.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  let initC: N, stampC: N;
  const U = { p0: uniform(new Vector2()), p1: uniform(new Vector2()), radius: uniform(16), clear: uniform(0), glow: uniform(0) };
  const grid = new Uint8Array(GW * GH);
  let scratched = 0;
  let done = false;
  let tl: gsap.core.Tween | gsap.core.Timeline | null = null;
  const ray = new Raycaster();
  const prev = new Vector2(-1, -1);
  let soundAcc = 0;
  const params = { radius: 16, threshold: 0.6 };

  /** Couverture estimée sur une grille CPU grossière (pas de readback GPU). */
  function markGrid(x0: number, y0: number, x1: number, y1: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    const rr = params.radius / (TW / GW);
    for (let s = 0; s <= steps; s++) {
      const px = (x0 + (x1 - x0) * (s / steps)) / (TW / GW), py = (y0 + (y1 - y0) * (s / steps)) / (TH / GH);
      for (let gy = Math.floor(py - rr); gy <= py + rr; gy++)
        for (let gx = Math.floor(px - rr); gx <= px + rr; gx++) {
          if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
          if (Math.hypot(gx + 0.5 - px, gy + 0.5 - py) > rr) continue;
          const k = gy * GW + gx;
          if (!grid[k]) ((grid[k] = 1), scratched++);
        }
    }
  }

  function reset() {
    tl?.kill();
    ctx.renderer.compute(initC);
    grid.fill(0);
    scratched = 0;
    done = false;
    U.clear.value = 0;
    U.glow.value = 0;
  }

  function finish() {
    if (done) return;
    done = true;
    const T = rarity(ctx.rarity).tier;
    ctx.sfx.tear(0.5, 0.2);
    tl = gsap.timeline()
      .to(U.clear, { value: 1, duration: 0.9, ease: EASE.glide })
      .to(U.glow, { value: 1, duration: 0.12, onStart: () => (ctx.sfx.chime(T, 0.18), ctx.sfx.thump(0.3)) }, 0.5)
      .to(U.glow, { value: 0, duration: 1.4, ease: EASE.glide });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      c.input.spinEnabled = false;
      stage = createStage(c, { bg: ['#29251f', '#0c0b0a'], env: 'studio', fill: 0.72 });
      const key = new DirectionalLight(0xfff2e6, 1.3);
      key.position.set(-1.5, 2, 3);
      stage.scene.add(key);

      // masque de pellicule (1 = couvert), lu ET écrit dans la même passe (accès read-write, r32float)
      const cover = new StorageTexture(TW, TH);
      cover.format = RedFormat;
      cover.type = FloatType;
      c.bag.add(cover);
      const rw = storageTexture(cover).setAccess(NodeAccess.READ_WRITE);
      const wo = storageTexture(cover).setAccess(NodeAccess.WRITE_ONLY);
      initC = Fn(() => {
        const x = int(instanceIndex.mod(TW)), y = int(instanceIndex.div(TW));
        textureStore(wo, ivec2(x, y), vec4(1, 0, 0, 1));
      })().compute(TW * TH);
      stampC = Fn(() => {
        const x = int(instanceIndex.mod(TW)), y = int(instanceIndex.div(TW));
        const p = vec2(float(x), float(y));
        // distance au segment du geste
        const a = U.p0, b = U.p1;
        const ab = b.sub(a);
        const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-4)), 0, 1);
        const d = length(p.sub(a.add(ab.mul(t))));
        // bord déchiqueté : le rayon varie avec un bruit fin (la pellicule casse en miettes)
        const jag = hash(float(x).add(float(y).mul(911))).mul(0.35).add(mx_fractal_noise_float(vec3(p.mul(0.08), 0), 2).mul(0.25));
        const r = U.radius.mul(float(0.8).add(jag));
        const cut = smoothstep(r.mul(0.75), r, d);
        const cur = (rw as unknown as N).load(ivec2(x, y)).r;
        textureStore(rw, ivec2(x, y), vec4(min(cur, cut), 0, 0, 1));
      })().compute(TW * TH);

      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const L = cardLayers(art, { bg: 0.02, subject: 0.01, fg: -0.002 });
      const cv = texture(cover, uv()).r;
      // l'écaillage final : la pellicule restante se dissout selon un bruit
      const flake = mx_fractal_noise_float(vec3(uv().mul(vec2(9, 12)), 4.2), 3).mul(0.5).add(0.5);
      const coat = cv.mul(smoothstep(U.clear, U.clear.add(0.06), flake.mul(0.94)));
      // relief de la pellicule au bord des zones grattées (petites miettes)
      const e = 1 / TW;
      const gx = texture(cover, uv().add(vec2(e, 0))).r.sub(texture(cover, uv().sub(vec2(e, 0))).r);
      const gy = texture(cover, uv().add(vec2(0, e))).r.sub(texture(cover, uv().sub(vec2(0, e))).r);
      const n = vec3(gx.mul(-2.2), gy.mul(-2.2), 1).normalize();
      // pellicule : argent mat imprimé d'un motif "grattez ici"
      const pat = smoothstep(0.45, 0.55, mx_fractal_noise_float(vec3(uv().mul(vec2(40, 56)), 0.7), 2).mul(0.5).add(0.5)).mul(0.08);
      const diag = smoothstep(0.92, 1.0, uv().x.add(uv().y).mul(14).fract()).mul(0.12);
      const coatCol = (color('#b9bab8') as N).sub(pat.add(diag));
      const rim = smoothstep(0.02, 0.0, coat).mul(smoothstep(0.0, 0.25, cv)).mul(0.5); // liseré sombre au bord
      const tint = color(rarity(c.rarity).accentHex);
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = mix(L.color.mul(float(1).sub(rim)), coatCol, coat);
      m.metalnessNode = coat.mul(0.85);
      m.roughnessNode = mix(mix(float(0.6), float(0.35), L.window), float(0.42), coat);
      m.normalNode = normalMap(encodeNormal(n));
      m.clearcoatNode = coat.oneMinus().mul(0.4);
      m.emissiveNode = tint.mul(U.glow).mul(L.masks.r.mul(0.6).add(0.15)).mul(coat.oneMinus());
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      stage.scene.add(card);
      c.renderer.compute(initC);
      await stage.compile();
      c.gui.add(params, 'radius', 4, 40, 1).name('taille de la pièce').onChange((v: number) => (U.radius.value = v));
      c.gui.add(params, 'threshold', 0.2, 0.95, 0.01).name('seuil d’écaillage auto');
      c.gui.add({ all: () => finish() }, 'all').name('tout révéler');
      c.bag.fn(() => tl?.kill());
      // tap = un coup de pièce automatique (zigzag) — pratique à la souris
      c.bag.fn(
        c.input.onTap(() => {
          if (done) return;
          const cx = 0.25 + Math.random() * 0.5, cy = 0.3 + Math.random() * 0.45;
          let last = new Vector2(cx * TW, cy * TH);
          for (let k = 1; k <= 9; k++) {
            const nx = (cx + (k % 2 ? 0.16 : -0.16) + (Math.random() - 0.5) * 0.04) * TW;
            const ny = (cy + k * 0.012) * TH;
            U.p0.value.copy(last);
            U.p1.value.set(nx, ny);
            ctx.renderer.compute(stampC);
            markGrid(last.x, last.y, nx, ny);
            last = new Vector2(nx, ny);
          }
          ctx.sfx.tear(0.35, 0.18);
          if (scratched / (GW * GH) > params.threshold) finish();
        }),
      );
    },
    replay() {
      reset();
    },
    update(_dt, t) {
      const inp = ctx.input;
      card.rotation.set(-inp.tiltY * 0.12 + Math.sin(t * 0.4) * 0.03, inp.tiltX * 0.16 + Math.sin(t * 0.5) * 0.05, 0);
      // gratter = appuyer et glisser (souris : clic maintenu)
      if (inp.down && !done) {
        ray.setFromCamera(new Vector2(inp.ndcX, inp.ndcY), stage.camera);
        const hit = ray.intersectObject(card, false)[0];
        if (hit?.uv) {
          const x = hit.uv.x * TW, y = hit.uv.y * TH;
          if (prev.x < 0) prev.set(x, y);
          U.p0.value.copy(prev);
          U.p1.value.set(x, y);
          ctx.renderer.compute(stampC);
          markGrid(prev.x, prev.y, x, y);
          soundAcc += prev.distanceTo(U.p1.value);
          if (soundAcc > 18) {
            ctx.sfx.tear(0.05, 0.12);
            soundAcc = 0;
          }
          prev.set(x, y);
          if (scratched / (GW * GH) > params.threshold) finish();
        } else prev.set(-1, -1);
      } else prev.set(-1, -1);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
