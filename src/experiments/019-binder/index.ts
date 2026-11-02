import {
  BatchedMesh,
  DataArrayTexture,
  DataTexture,
  FloatType,
  RGBAFormat,
  DirectionalLight,
  LinearFilter,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { abs, batchIndirectIndex, color, float, int, ivec2, mix, normalGeometry, round, select, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { ensureCardImages, ensureFonts, generateBackArt, generateCardArt } from '../../core/art';
import { CARDS } from '../../core/cardData';
import { RARITIES, rarity } from '../../core/rarity';
import { createCardGeometry, CARD } from '../../core/cardModel';
import { Spring, rng } from '../../core/ease';
import type { N } from '../../core/tsl';

/**
 * 019 — Classeur / collection 3D.
 * Des centaines de cartes sur la paroi intérieure d'un cylindre, en **un seul BatchedMesh** (un seul draw call) ;
 * faces dans une **texture array** (une couche par carte), couche et rareté passées par la couleur d'instance.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let batch: BatchedMesh;
  const ids: number[] = [];
  const meta: Array<{ angle: number; y: number; rar: number; layer: number }> = [];
  const lift: Spring[] = [];
  const COLS = 60, ROWS = 9, R = 7;
  const scroll = new Spring(0, 30, 9);
  let scrollVel = 0;
  let hover = -1;
  const ray = new Raycaster();
  const m4 = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3(1, 1, 1);
  const SEL = uniform(-1);
  const params = { count: COLS * ROWS };

  function place(i: number) {
    const mm = meta[i];
    const a = mm.angle + scroll.value;
    const l = lift[i].value;
    const r = R - l * 0.9;
    pos.set(Math.sin(a) * r, mm.y + l * 0.04, -Math.cos(a) * r);
    q.setFromAxisAngle(new Vector3(0, 1, 0), -a);
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -mm.y * 0.12);
    q.multiply(tilt);
    scl.setScalar(1 + l * 0.12);
    m4.compose(pos, q, scl);
    batch.setMatrixAt(ids[i], m4);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      const selTier = rarity(c.rarity).tier;
      SEL.value = selTier;
      c.input.spinEnabled = false;
      stage = createStage(c, { bg: ['#1f1c19', '#0a0908'], env: 'gallery', envIntensity: 0.8 });
      stage.camera.position.set(0, 0, 0.01);
      stage.camera.fov = 55;
      stage.camera.updateProjectionMatrix();
      stage.camera.lookAt(0, 0, -1);
      const key = new DirectionalLight(0xfff2e4, 0.9);
      key.position.set(0, 2, 1);
      stage.scene.add(key);

      // ── texture array : une couche par carte (plafonné à 151 pour la limite WebGPU maxTextureArrayLayers=256) + 1 dos
      const BINDER_POOL = CARDS.slice(0, 151);
      await Promise.all([ensureFonts(), ensureCardImages(BINDER_POOL)]);
      const W = BINDER_POOL.length > 48 ? (c.quality === 'mobile' ? 144 : 192) : 256, H = Math.round(W * 1.4), L = BINDER_POOL.length + 1;
      const artScale = Math.min(0.5, (W / 768) * 1.25);
      const data = new Uint8Array(W * H * 4 * L);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      const putLayer = (src: HTMLCanvasElement, layer: number) => {
        g.clearRect(0, 0, W, H);
        g.drawImage(src, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        // retournement vertical (une DataArrayTexture n'applique pas flipY)
        for (let y = 0; y < H; y++) data.set(d.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), layer * W * H * 4 + y * W * 4);
      };
      BINDER_POOL.forEach((cd, k) => {
        const art = generateCardArt(cd, cd.rarity, { scale: artScale, flatOnly: true });
        putLayer((art.canvases as Record<string, HTMLCanvasElement>).flat, k);
        art.dispose();
      });
      const back = generateBackArt(undefined, artScale);
      const bc = (back.color as unknown as { image: HTMLCanvasElement }).image;
      putLayer(bc, BINDER_POOL.length);
      back.dispose();
      const arr = c.bag.add(new DataArrayTexture(data, W, H, L));
      arr.colorSpace = SRGBColorSpace;
      // NB : pas de génération de mipmaps pour une texture array ici (niveaux vides → noir) — filtrage linéaire simple
      arr.generateMipmaps = false;
      arr.minFilter = LinearFilter;
      arr.magFilter = LinearFilter;
      arr.anisotropy = 4;
      arr.needsUpdate = true;

      // ── table par instance (couche de texture, tier) lue par l'index d'instance du batch
      // NB : batchColor est multiplié d'office dans la couleur diffuse → inutilisable pour encoder des données.
      const n = COLS * ROWS;
      const lutData = new Float32Array(n * 4);
      const lut = c.bag.add(new DataTexture(lutData, n, 1, RGBAFormat, FloatType));
      const rec = texture(lut).load(ivec2(int(batchIndirectIndex), 0)) as unknown as N;
      const layer = round(rec.r);
      const tierI = round(rec.g);
      const front = texture(arr, uv()).depth(layer) as unknown as N;
      const backT = texture(arr, uv()).depth(float(BINDER_POOL.length)) as unknown as N;
      const nz = normalGeometry.z;
      const isFront = nz.greaterThan(0.5), isBack = nz.lessThan(-0.5);
      const edge = color('#e6dfd0');
      const base = select(isFront, front.rgb, select(isBack, backT.rgb, edge));
      // rareté choisie : les autres s'effacent un peu, celles du tier sont mises en avant
      const match = float(1).sub(smoothstep(0.0, 0.5, abs(tierI.sub(SEL))));
      const mat = new MeshStandardNodeMaterial();
      mat.colorNode = base.mul(mix(float(0.42), float(1), match));
      mat.roughnessNode = float(0.45);
      mat.metalnessNode = float(0);
      const tint = vec3(1.0, 0.86, 0.6);
      mat.emissiveNode = tint.mul(match.mul(0.05)).mul(float(isFront));
      c.bag.add(mat);

      const geo = c.bag.add(createCardGeometry({ segX: 2, segY: 2, segCorner: 3 }));
      batch = new BatchedMesh(n, geo.getAttribute('position').count, geo.getIndex()!.count, mat);
      batch.perObjectFrustumCulled = true;
      batch.sortObjects = false;
      const gid = batch.addGeometry(geo);
      const r = rng(2026);
      for (let i = 0; i < n; i++) {
        const id = batch.addInstance(gid);
        const col = i % COLS, row = Math.floor(i / COLS);
        // collection aléatoire, pondérée comme un vrai tirage
        const roll = r();
        const tier = roll < 0.55 ? 0 : roll < 0.8 ? 1 : roll < 0.92 ? 2 : roll < 0.975 ? 3 : roll < 0.995 ? 4 : 5;
        const pool = BINDER_POOL.map((cd, k) => ({ cd, k })).filter((o) => rarity(o.cd.rarity).tier === tier);
        const pick = pool.length ? pool[Math.floor(r() * pool.length)].k : Math.floor(r() * BINDER_POOL.length);
        lutData[id * 4] = pick;
        lutData[id * 4 + 1] = rarity(BINDER_POOL[pick].rarity).tier;
        ids.push(id);
        meta.push({ angle: (col / COLS) * Math.PI * 2 + (row % 2) * (Math.PI / COLS), y: (row - (ROWS - 1) / 2) * (CARD.h + 0.1), rar: rarity(BINDER_POOL[pick].rarity).tier, layer: pick });
        lift.push(new Spring(0, 120, 14));
      }
      lut.needsUpdate = true;
      stage.scene.add(batch);
      for (let i = 0; i < n; i++) place(i);
      c.bag.add(batch as unknown as { dispose(): void });
      await stage.compile();
      c.gui.add(params, 'count').name('cartes (1 draw call)').disable();
      c.gui.add({ info: `${RARITIES[selTier].label} en avant` }, 'info').name('rareté').disable();
    },
    async setRarity(id) {
      SEL.value = rarity(id).tier;
    },
    update(dt) {
      const inp = ctx.input;
      // défilement : drag horizontal avec élan
      if (inp.dragging) {
        const w = ctx.canvas.clientWidth || 800;
        const d = (inp.dragDX / w) * 1.6;
        scroll.set(scroll.value + d);
        scrollVel = d / Math.max(dt, 1 / 240);
      } else {
        scroll.value += scrollVel * dt;
        scrollVel *= Math.exp(-2.6 * dt);
        scroll.target = scroll.value;
      }
      // survol : la carte se soulève vers nous
      ray.setFromCamera(new Vector2(inp.ndcX, inp.ndcY), stage.camera);
      const hit = inp.inside ? ray.intersectObject(batch, false)[0] : undefined;
      const hid = hit ? ((hit as unknown as { batchId?: number }).batchId ?? -1) : -1;
      if (hid !== hover) {
        hover = hid;
        if (hover >= 0) ctx.sfx.tick(1.3, 0.08);
      }
      // regard qui suit légèrement le pointeur
      stage.camera.lookAt(inp.tiltX * 0.25, inp.tiltY * 0.18, -1);
      for (let i = 0; i < meta.length; i++) {
        const s = lift[i];
        s.target = ids[i] === hover ? 1 : 0;
        if (s.value !== 0 || s.target !== 0 || Math.abs(scrollVel) > 1e-4 || inp.dragging) {
          s.update(dt);
          place(i);
        }
      }
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
    },
    dispose() {},
  };
}
