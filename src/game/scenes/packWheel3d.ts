import { CanvasTexture, Color, Group, Mesh, MeshStandardNodeMaterial, SRGBColorSpace, type BufferGeometry, type PerspectiveCamera, type Raycaster, type Scene, type Texture } from 'three/webgpu';
import { normalMap, texture, uv, vec2 } from 'three/tsl';
import { createPackGeometry, PACK, type PackArt } from '../../core/pack';
import { releaseCanvas } from '../../core/art/canvas';

/**
 * ROUE DES BOOSTERS EN 3D (téléphone, retours de Tom, 4 nov.) : les 5 pochettes de la boutique deviennent de vrais petits
 * boosters, dans la MÊME scène que le grand (même éclairage, aucune passe de rendu en plus), mais au rabais pour ne rien
 * coûter : maillage grossier (~500 sommets au lieu de ~14 000), textures de 256 px, aluminium avec
 * les plis du sachet en relief, sans foil ; (07/11) ni reflet au sol ni halo.
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
  /** inclinaison avant/arrière (roue verticale de l'ordinateur, packReel.ts) */
  rotX?: number;
  /** largeur (px CSS) à z = 0 */
  size: number;
  /** 0 = pleine lumière, 1 = noir (pochettes qui partent sur les côtés) */
  dim: number;
  /** halo derrière (0..1) */
  glow: number;
  accent: string;
}

/** (07/11) ordinateur : les mini-boosters de la roue verticale sont presque aussi grands que le grand booster →
 *  textures et maillage plus fins (`opts`) ; téléphone : au rabais */
export interface Wheel3DOpts {
  texW?: number;
  backW?: number;
  creaseW?: number;
  seg?: [number, number];
}
const TEX_W = 256;
const BACK_W = 128;
/** carte des plis (sachets aluminium) : en petit, 192 px suffisent à garder les grandes cassures lisibles */
const CREASE_W = 192;

/**
 * Réduit une toile source à `w` px de large (jamais agrandie) et en fait une texture. (perf, iOS plafonne la mémoire des
 * toiles) la réduction est propre à chaque texture (les cartes de plis sont par booster depuis le 07/11, plus partagées
 * entre les cinq) : sa toile est vidée dès que la texture est sur le GPU.
 */
function shrink(src: Texture | undefined, w: number, srgb = true): Texture | null {
  const img = src?.image as HTMLCanvasElement | ImageBitmap | undefined;
  if (!img || !img.width) return null;
  // (audit 12/11, S17 / A10-07) rien à réduire (ordinateur : 768 demandés pour un visuel de 640) : la texture du sachet
  // sert telle quelle au lieu d'une copie à l'identique (≈ 9,6 Mo de GPU par pochette, × 5). Elle reste au sachet :
  // l'appelant ne la libère pas (voir `mine`).
  if (w >= img.width && src) return src;
  w = Math.min(w, img.width); // jamais agrandie
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((w * img.height) / img.width);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 2;
  t.onUpdate = () => {
    t.onUpdate = null;
    releaseCanvas(c);
  };
  return t;
}

interface Slot {
  key: string;
  body: Mesh;
  front: MeshStandardNodeMaterial;
  back: MeshStandardNodeMaterial;
  textured: boolean;
}

export function createWheel3D(scene: Scene, getArt: (key: string) => PackArt | undefined, opts: Wheel3DOpts = {}) {
  const texW = opts.texW ?? TEX_W;
  const backW = opts.backW ?? BACK_W;
  const creaseW = opts.creaseW ?? CREASE_W;
  const group = new Group();
  group.visible = false;
  group.renderOrder = 2;
  scene.add(group);
  // (07/11 soir, retours de Tom : « très moche sur les modèles basse définition ») 18 × 28 au lieu de 10 × 16 : le
  // plateau qui épouse la pile et sa retombée vers les soudures se voyaient en facettes (≈ 1 100 sommets, 5 pochettes)
  const geo: BufferGeometry = createPackGeometry(...(opts.seg ?? [18, 28]));
  const owned: Array<{ dispose(): void }> = [geo];
  const slots = new Map<string, Slot>();
  // (audit 12/11, A10-12) toile 1×1 : la toile par défaut (300×150) coûtait ~240 Ko de GPU pour une texture provisoire
  const blank = new CanvasTexture(Object.assign(document.createElement('canvas'), { width: 1, height: 1 }));
  owned.push(blank);

  // (07/11, retours de Tom) ni halo derrière la pochette du milieu ni reflet au sol : la couleur du booster reste sur
  // le cadran cranté (shop.ts)

  function slot(key: string): Slot {
    let s = slots.get(key);
    if (s) return s;
    /*
     * (07/11) mini-boosters ALUMINIUM, comme le grand : métal pur, brillant, et les plis du sachet dans le relief
     * (même carte de plis pleine taille, en 192 px). Les anciens sachets imprimés gardent un vernis (bump nul).
     */
    const front = new MeshStandardNodeMaterial({ roughness: 0.46, metalness: 0.12, map: blank });
    const back = new MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.05, map: blank });
    const body = new Mesh(geo, [front, back]);
    group.add(body);
    owned.push(front, back);
    s = { key, body, front, back, textured: false };
    slots.set(key, s);
    return s;
  }
  function texturize(s: Slot) {
    if (s.textured) return;
    const art = getArt(s.key);
    if (!art) return;
    const f = shrink(art.front, texW);
    const b = shrink(art.back, backW);
    if (!f) return;
    // (A10-07) seules les copies réduites sont à nous ; une texture du sachet reprise telle quelle reste au sachet
    const mine = (t: Texture | null | undefined) => !!t && t !== art.front && t !== art.back && t !== art.creaseNormal && t !== art.frontNormal;
    if (mine(f)) owned.push(f);
    if (mine(b)) owned.push(b!);
    s.front.map = f;
    s.back.map = b ?? f;
    if (art.metalBack) {
      s.front.metalness = s.back.metalness = 1;
      // (07/11 soir) un peu moins miroir : en petit, chaque variation de la normale devenait une tache de reflet
      s.front.roughness = 0.28;
      s.back.roughness = 0.32;
    }
    // (07/11 soir) plis : la carte de NORMALES du sachet (calculée en flottants, core/pack.ts), réduite — avant, un
    // bumpMap sur la hauteur 8 bits : à cette taille, les dérivées d'écran donnaient un bruit d'escalier sur chaque pli.
    // Nœuds créés ICI, avec la vraie texture (un nœud créé sur une texture vide puis changé n'est pas suivi partout).
    const nrm = art.creaseNormal ? shrink(art.creaseNormal, creaseW, false) : null;
    // (07/11) face avant : plis + nom du pack thermoformé ; réduite un peu moins (le relief des lettres reste lisible)
    const fnrm = art.frontNormal ? shrink(art.frontNormal, Math.max(creaseW, texW), false) : null;
    if (nrm) {
      if (mine(nrm)) owned.push(nrm);
      if (mine(fnrm)) owned.push(fnrm!);
      s.front.normalNode = normalMap(texture(fnrm ?? nrm, uv()), vec2(0.8));
      s.back.normalNode = normalMap(texture(nrm, uv().mul(vec2(-1, 1)).add(vec2(1, 0))), vec2(0.8));
    }
    s.front.needsUpdate = s.back.needsUpdate = true;
    s.textured = true;
  }

  const tmp = new Color();
  let lastK = 0;
  return {
    group,
    /**
     * Réduit tout de suite les toiles du sachet `key` (si son visuel est prêt) : à appeler dès que `getArt(key)` répond,
     * AVANT d'envoyer les grandes textures au GPU (leurs toiles sont vidées à l'envoi, `PackArtOptions.releaseSources`).
     * Les petites textures partent au GPU à la première image où la pochette est montrée (quelques centaines de Ko).
     */
    prepare(key: string) {
      texturize(slot(key));
    },
    /**
     * (13/11) oublie la pochette `key` (booster du moment remplacé par un autre événement) : la prochaine fois, elle
     * est refaite d'après le nouveau visuel (appeler `prepare` dès qu'il est prêt, avant son envoi au GPU)
     */
    forget(key: string) {
      const s = slots.get(key);
      if (!s) return;
      group.remove(s.body);
      slots.delete(key);
    },
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
      for (const it of items) {
        const s = slot(it.key);
        texturize(s);
        const vis = it.dim < 0.985;
        s.body.visible = vis;
        if (!vis) continue;
        const sc = it.size / k / PACK.w;
        s.body.position.set(it.x / k, -it.y / k, it.z / k);
        s.body.rotation.set(it.rotX ?? 0, it.rotY, -it.rotZ);
        s.body.scale.set(sc, sc, sc * 1.25); // (un peu plus bombé : le relief se lit mieux en petit)
        const l = 1 - it.dim;
        tmp.setScalar(l);
        s.front.color.copy(tmp);
        s.back.color.copy(tmp);
      }
    },
    hide() {
      group.visible = false;
    },
    /** la pochette visible touchée par ce rayon (roue verticale : un clic sur une voisine l'amène au milieu) */
    pick(ray: Raycaster): string | null {
      if (!group.visible) return null;
      const hit = ray.intersectObjects([...slots.values()].filter((s) => s.body.visible).map((s) => s.body), false)[0];
      if (!hit) return null;
      for (const s of slots.values()) if (s.body === hit.object) return s.key;
      return null;
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

