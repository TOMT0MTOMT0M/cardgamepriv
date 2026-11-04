import { AdditiveBlending, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, SRGBColorSpace, type BufferGeometry, type PerspectiveCamera, type Scene, type Texture } from 'three/webgpu';
import { float, length, smoothstep, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { createPackGeometry, PACK, type PackArt } from '../../core/pack';

/**
 * ROUE DES BOOSTERS EN 3D (téléphone, retours de Tom, 4 nov.) : les 5 pochettes de la boutique deviennent de vrais petits
 * boosters, dans la MÊME scène que le grand (même éclairage, aucune passe de rendu en plus), mais au rabais pour ne rien
 * coûter : maillage grossier (~500 sommets au lieu de ~14 000), textures de 256 px, matériau standard sans froissé ni
 * foil, un reflet au sol (même maillage retourné, en fondu) et un halo additif derrière celui du milieu.
 * La physique et les touchers restent dans la page (shop.ts) : la roue HTML, invisible, est posée exactement au même
 * endroit (même perspective que la caméra) et sert de zone de toucher ; elle envoie ici la pose de chaque pochette.
 */
export interface WheelItem3D {
  key: string;
  /** centre de la pochette (px CSS) par rapport au point de fuite de la caméra, y vers le bas ; z vers l'écran */
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotZ: number;
  /** largeur (px CSS) à z = 0 */
  size: number;
  /** 0 = pleine lumière, 1 = noir (pochettes qui partent sur les côtés) */
  dim: number;
  /** halo derrière (0..1) */
  glow: number;
  accent: string;
}

const TEX_W = 256;
const BACK_W = 128;

function shrink(src: Texture | undefined, w: number): Texture | null {
  const img = src?.image as HTMLCanvasElement | ImageBitmap | undefined;
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((w * img.height) / img.width);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

interface Slot {
  key: string;
  body: Mesh;
  refl: Mesh;
  front: MeshStandardNodeMaterial;
  back: MeshStandardNodeMaterial;
  reflMat: MeshBasicNodeMaterial;
  reflA: ReturnType<typeof uniform>;
  reflTex: { value: Texture };
  textured: boolean;
}

export function createWheel3D(scene: Scene, getArt: (key: string) => PackArt | undefined) {
  const group = new Group();
  group.visible = false;
  group.renderOrder = 2;
  scene.add(group);
  const geo: BufferGeometry = createPackGeometry(10, 16);
  const owned: Array<{ dispose(): void }> = [geo];
  const slots = new Map<string, Slot>();
  const blank = new CanvasTexture(document.createElement('canvas'));
  owned.push(blank);

  // halo : un disque additif doux derrière la pochette du milieu, de la couleur du booster
  const haloCol = uniform(new Color('#e8927c'));
  const haloA = uniform(0);
  const haloMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  {
    const r = length(uv().sub(vec2(0.5)));
    const fall = float(1).sub(smoothstep(0.06, 0.5, r));
    haloMat.colorNode = vec4(haloCol.mul(fall.mul(fall).mul(haloA)), 1);
  }
  const halo = new Mesh(new PlaneGeometry(1, 1), haloMat);
  halo.renderOrder = 1;
  group.add(halo);
  owned.push(halo.geometry, haloMat);

  function slot(key: string): Slot {
    let s = slots.get(key);
    if (s) return s;
    const front = new MeshStandardNodeMaterial({ roughness: 0.46, metalness: 0.12, map: blank });
    const back = new MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.05, map: blank });
    const body = new Mesh(geo, [front, back]);
    // reflet : le bas du booster, en fondu, deux fois plus sombre
    const reflTex = { value: blank as Texture };
    const reflA = uniform(0);
    const reflMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const tn = texture(blank);
    reflTex.value = blank;
    reflMat.colorNode = tn.rgb.mul(0.42);
    reflMat.opacityNode = float(1).sub(smoothstep(0.0, 0.42, uv().y)).mul(reflA);
    (reflMat as unknown as { _tn: typeof tn })._tn = tn;
    const refl = new Mesh(geo, reflMat);
    group.add(body, refl);
    owned.push(front, back, reflMat);
    s = { key, body, refl, front, back, reflMat, reflA, reflTex, textured: false };
    slots.set(key, s);
    return s;
  }
  function texturize(s: Slot) {
    if (s.textured) return;
    const art = getArt(s.key);
    if (!art) return;
    const f = shrink(art.front, TEX_W);
    const b = shrink(art.back, BACK_W);
    if (!f) return;
    owned.push(f);
    if (b) owned.push(b);
    s.front.map = f;
    s.back.map = b ?? f;
    s.front.needsUpdate = s.back.needsUpdate = true;
    (s.reflMat as unknown as { _tn: { value: Texture } })._tn.value = f;
    s.textured = true;
  }

  const tmp = new Color();
  let lastK = 0;
  return {
    group,
    /** crée d'avance les matériaux (préchauffage des shaders sous l'écran de chargement) */
    warm(keys: string[]) {
      for (const k of keys) texturize(slot(k));
      group.visible = true;
    },
    /** `k` : px CSS par unité de la scène au plan z = 0 (écran) */
    set(items: WheelItem3D[] | null, k: number) {
      if (!items || !items.length || !(k > 0)) {
        group.visible = false;
        return;
      }
      lastK = k;
      group.visible = true;
      let best: WheelItem3D | null = null;
      for (const it of items) {
        const s = slot(it.key);
        texturize(s);
        const vis = it.dim < 0.985;
        s.body.visible = s.refl.visible = vis;
        if (!vis) continue;
        const sc = it.size / k / PACK.w;
        s.body.position.set(it.x / k, -it.y / k, it.z / k);
        s.body.rotation.set(0, it.rotY, -it.rotZ);
        s.body.scale.set(sc, sc, sc * 1.25); // (un peu plus bombé : le relief se lit mieux en petit)
        const l = 1 - it.dim;
        tmp.setScalar(l);
        s.front.color.copy(tmp);
        s.back.color.copy(tmp);
        // reflet sous la pochette : miroir par rapport au sol (5 px sous son bord bas)
        const floorY = -it.y / k - (PACK.h * sc) / 2 - 7 / k;
        s.refl.position.set(it.x / k, 2 * floorY + it.y / k, it.z / k);
        s.refl.rotation.set(0, it.rotY, it.rotZ);
        s.refl.scale.set(sc, -sc, sc);
        s.reflA.value = 0.11 * l * l;
        if (!best || it.glow > best.glow) best = it;
      }
      if (best && best.glow > 0.01) {
        const sz = (best.size * 2.3) / k;
        halo.visible = true;
        halo.position.set(best.x / k, -best.y / k, best.z / k - 30 / k);
        halo.scale.set(sz, sz * 1.25, 1);
        haloCol.value.set(best.accent);
        haloA.value = 0.3 * best.glow;
      } else halo.visible = false;
    },
    hide() {
      group.visible = false;
    },
    get k() {
      return lastK;
    },
    dispose() {
      scene.remove(group);
      owned.forEach((o) => o.dispose());
      slots.clear();
    },
  };
}

/** px CSS par unité de scène au plan z = 0 et perspective équivalente (px) d'une caméra perspective */
export function cameraScale(cam: PerspectiveCamera, cssH: number) {
  const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
  const D = cam.position.z;
  const k = cssH / (2 * D * t);
  return { k, P: D * k };
}

export type Wheel3D = ReturnType<typeof createWheel3D>;

