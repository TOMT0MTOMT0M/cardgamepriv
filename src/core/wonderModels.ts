/**
 * Modèles 3D des 14 Merveilles (GLB dans public/models/merveilles/, crédits : CREDITS.md à côté).
 *
 * Les fichiers sont pré-normalisés hors ligne (base à y = 0, centrés en xz, largeur ou hauteur = 1, simplifiés,
 * textures WebP, compression meshopt) : voir « Modèles des Merveilles » dans docs/LAB_NOTES.md.
 *
 * - Une merveille = une ou plusieurs **pièces** (ex. Zeus : la statue devant son temple), chacune mise à l'échelle,
 *   tournée et placée en unités diorama ; options : socle de pierre, colline rocheuse, torche, recoloration.
 * - Chargée une fois (cache par carte), puis **clonée** par instance : géométries et matériaux partagés
 *   (`userData.sharedModel = true` → l'instance ne les libère pas).
 */
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { siteUrl } from './siteRoot';

export interface WonderPart {
  /** fichier dans public/models/merveilles/ (absent = pièce de décor seule : colline, socle) */
  file?: string;
  /** plus grande dimension horizontale visée (unités diorama)… */
  width?: number;
  /** …ou hauteur (prioritaire si fournie) */
  height?: number;
  /** rotation Y (rad) : présente la bonne face vers la vitre (+z) */
  rotY?: number;
  /** position du centre de la base (unités diorama, relative à l'emplacement du monument) */
  offset?: [number, number, number];
  /** enfonce la base dans le sol (unités diorama) : socles irréguliers des photogrammétries */
  sink?: number;
  /** teinte multipliée à tous les matériaux */
  tint?: string;
  /** recoloration des matériaux très clairs (luminance > 0,8) : blocs blancs d'un modèle stylisé */
  recolorLight?: string;
  /** rugosité forcée */
  roughness?: number;
  /** socle de pierre sous la pièce : [largeur, hauteur, profondeur] */
  plinth?: [number, number, number];
  /** étirement vertical (relevés de terrain très plats) */
  stretchY?: number;
  /** colline rocheuse sous la pièce : [rayon, hauteur] */
  hill?: [number, number];
  /** flamme accrochée au point le plus haut (torche du Colosse) */
  torch?: boolean;
}

export interface WonderModelSpec {
  parts: WonderPart[];
}

/** Une merveille absente d'ici garde son monument procédural. */
export const WONDER_MODELS: Record<string, WonderModelSpec> = {
  'mrv-grande-pyramide-de-kheops': {
    parts: [
      { file: 'grande-pyramide-de-kheops.glb', width: 9, rotY: 0, offset: [0.7, 0, -0.2], sink: 0.15 },
      // Khéphren et Mykérinos en retrait (même relevé, plus petits, socle enfoui), le Sphinx devant
      { file: 'grande-pyramide-de-kheops.glb', width: 7.4, rotY: 0.3, offset: [-4.2, 0, -5.5], sink: 0.35 },
      { file: 'grande-pyramide-de-kheops.glb', width: 4.6, rotY: -0.2, offset: [-8.5, 0, -9], sink: 0.25 },
      { file: 'sphinx.glb', width: 1.25, rotY: 0.35, offset: [-1.9, 0, 1.3], tint: '#e3c18e', roughness: 0.95 },
    ],
  },
  'mrv-jardins-suspendus-de-babylone': {
    parts: [{ file: 'jardins-de-babylone.glb', width: 5.2, rotY: 0.25, recolorLight: '#cfb48a', roughness: 0.9 }],
  },
  'mrv-statue-de-zeus-a-olympie': {
    parts: [
      { file: 'temple-de-zeus.glb', width: 6.8, rotY: 0.5, offset: [0.6, 0, -1.6], tint: '#efe4cf', roughness: 0.7 },
      { file: 'statue-de-zeus.glb', height: 2.6, rotY: -0.25, offset: [-0.9, 0, 1.5], plinth: [1.0, 0.35, 1.0], tint: '#f3e3c4' },
    ],
  },
  'mrv-temple-d-artemis-a-ephese': {
    parts: [{ file: 'temple-d-artemis.glb', width: 6.4, rotY: 0.45, offset: [0.5, 0, -0.2], roughness: 0.6 }],
  },
  'mrv-mausolee-d-halicarnasse': {
    parts: [{ file: 'mausolee.glb', width: 6.4, rotY: 0.35, offset: [0, 0, -0.3], tint: '#ece3d2', roughness: 0.7 }],
  },
  'mrv-colosse-de-rhodes': {
    parts: [{ file: 'colosse-de-rhodes.glb', height: 3.6, rotY: 0, offset: [0, 0, 0.6], plinth: [1.5, 0.55, 1.1], torch: true, roughness: 0.35 }],
  },
  'mrv-phare-d-alexandrie': {
    parts: [{ file: 'phare-d-alexandrie.glb', height: 4.8, rotY: 0.2, offset: [0, 0, -0.2], plinth: [2.8, 0.3, 2.8] }],
  },
  'mrv-grande-muraille-de-chine': {
    parts: [{ file: 'grande-muraille-de-chine.glb', width: 7.5, rotY: 0.4, offset: [0.3, 0, -0.4], sink: 0.15 }],
  },
  'mrv-petra-khazneh': {
    parts: [{ file: 'petra-khazneh.glb', height: 5.8, rotY: -Math.PI / 2, offset: [0, 0, -1.2], sink: 0.1 }],
  },
  'mrv-christ-redempteur-rio': {
    parts: [
      { file: 'christ-statue.glb', height: 2.4, rotY: 0.15, offset: [0, 0, -0.8], hill: [2.4, 1.6] },
      // le Pain de Sucre au fond de la baie (relevé de terrain, relief exagéré, pied sous l'eau)
      { file: 'pain-de-sucre.glb', width: 22, rotY: 0.6, offset: [5.5, -0.25, -14], stretchY: 2.4 },
    ],
  },
  'mrv-machu-picchu': {
    // citadelle en terrasses sur sa crête ; le relief « montagnes » (Huayna Picchu, vallée de l'Urubamba) fait le reste
    parts: [{ file: 'machu-picchu.glb', width: 9, rotY: Math.PI / 2 + 0.25, offset: [0, 0, 0.2], tint: '#e8dfc2', roughness: 0.95, hill: [4.6, 0.6] }],
  },
  'mrv-chichen-itza': {
    parts: [{ file: 'chichen-itza.glb', width: 5, rotY: 0.3, offset: [0, 0, 0.2], tint: '#d9cfb8', roughness: 0.92 }],
  },
  'mrv-colisee-de-rome': {
    parts: [{ file: 'colisee-de-rome.glb', width: 6.4, rotY: 0.35, offset: [0, 0, 0.9], tint: '#fff0dc', roughness: 0.85 }],
  },
  'mrv-taj-mahal': {
    parts: [{ file: 'taj-mahal.glb', width: 5.4, rotY: 0, offset: [0, 0, -1.8], tint: '#f4eee6', roughness: 0.45 }],
  },
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Group | null>>();
/** un fichier n'est téléchargé qu'une fois, même s'il sert plusieurs pièces (Khéops et ses deux sœurs) */
const files = new Map<string, Promise<Object3D>>();
function loadFile(file: string): Promise<Object3D> {
  let p = files.get(file);
  if (!p) files.set(file, (p = loader.loadAsync(siteUrl(`models/merveilles/${file}`)).then((g) => g.scene)));
  return p;
}
const ready = new Map<string, Group>();

export function hasWonderModel(cardId: string): boolean {
  return cardId in WONDER_MODELS;
}

/** Résultat déjà chargé (synchrone), ou null. */
export function wonderModelIfReady(cardId: string): Group | null {
  return ready.get(cardId) ?? null;
}

/**
 * Mémoire : nombre de merveilles gardées assemblées (défaut : toutes — labo). Le jeu sur téléphone en garde 2 (celle
 * affichée et la précédente) : au-delà, la plus ancienne rend ses géométries et textures (une texture WebP 2048²
 * décodée = 21 Mo avec ses mipmaps) et sera re-téléchargée (cache HTTP) si on la revoit.
 */
let modelLimit = Infinity;
/** cartes dans l'ordre d'utilisation (la dernière = la plus récente) */
const order: string[] = [];
export function setWonderModelLimit(n: number): void {
  modelLimit = Math.max(1, n);
  trimModels();
}
function touch(cardId: string) {
  const i = order.indexOf(cardId);
  if (i >= 0) order.splice(i, 1);
  order.push(cardId);
}
function trimModels() {
  while (ready.size > modelLimit) {
    const newest = order[order.length - 1];
    const filesOf = (id: string) => WONDER_MODELS[id]?.parts.map((q) => q.file).filter((f): f is string => !!f) ?? [];
    // la plus ancienne gardée, hors la plus récente, dont aucun fichier ne sert à une autre merveille encore en cache
    const victim = order.find((id) => {
      if (id === newest || !ready.has(id)) return false;
      const others = new Set(order.filter((o) => o !== id && cache.has(o)).flatMap(filesOf));
      return !filesOf(id).some((f) => others.has(f));
    });
    if (!victim) return;
    const root = ready.get(victim)!;
    ready.delete(victim);
    cache.delete(victim);
    order.splice(order.indexOf(victim), 1);
    for (const f of filesOf(victim)) files.delete(f); // matériaux recolorés : on repartira du fichier
    const mats = new Set<Material>();
    root.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry && !(o as Sprite).isSprite) m.geometry.dispose(); // (géométrie des sprites : partagée par three)
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x !== STONE && mats.add(x));
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && (v as { isTexture?: boolean }).isTexture) (v as { dispose(): void }).dispose();
      m.dispose();
    }
  }
}

/** Charge (une fois) et assemble le modèle d'une merveille. `null` si absent ou en échec (→ monument procédural). */
export function preloadWonderModel(cardId: string): Promise<Group | null> {
  const spec = WONDER_MODELS[cardId];
  if (!spec) return Promise.resolve(null);
  touch(cardId);
  let p = cache.get(cardId);
  if (!p) {
    p = Promise.all(
      spec.parts.map((part) => (part.file ? loadFile(part.file).then((sc) => buildPart(sc.clone(true), part)) : buildPart(new Group(), part))),
    )
      .then((parts) => {
        const root = new Group();
        root.name = cardId;
        parts.forEach((g) => root.add(g));
        root.traverse((o) => {
          o.userData.sharedModel = true;
          o.frustumCulled = false;
        });
        ready.set(cardId, root);
        trimModels();
        return root;
      })
      .catch((e) => {
        console.warn(`[merveilles] modèle de ${cardId} indisponible, monument procédural`, e);
        return null;
      });
    cache.set(cardId, p);
  }
  return p;
}

// ───────────────────────────────────────────── assemblage d'une pièce
const STONE = new MeshStandardMaterial({ color: '#a89c86', roughness: 0.9, metalness: 0 });

function buildPart(scene: Object3D, part: WonderPart): Group {
  const holder = new Group();
  // 1. normalisation (le fichier l'est déjà ; on la refait par sécurité : base à 0, centre en xz)
  scene.rotation.y = part.rotY ?? 0;
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const c = box.getCenter(new Vector3());
  const k = box.isEmpty() ? 1 : part.height ? part.height / size.y : (part.width ?? 4) / Math.max(size.x, size.z);
  if (box.isEmpty()) c.set(0, 0, 0), (box.min.y = 0);
  const inner = new Group();
  scene.position.set(-c.x, -box.min.y, -c.z);
  inner.add(scene);
  inner.scale.set(k, k * (part.stretchY ?? 1), k);

  // 2. matériaux
  const tint = part.tint ? new Color(part.tint) : null;
  const light = part.recolorLight ? new Color(part.recolorLight) : null;
  const seen = new Set<Material>();
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as MeshStandardMaterial[]) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (light && m.color && !m.map) {
        const hsl = { h: 0, s: 0, l: 0 };
        m.color.getHSL(hsl);
        if (hsl.l > 0.8) m.color.copy(light);
      }
      if (tint && m.color) m.color.multiply(tint);
      if (part.roughness !== undefined && 'roughness' in m) m.roughness = part.roughness;
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.15);
    }
  });

  // 3. socle / colline : la pièce est posée dessus
  let lift = -(part.sink ?? 0);
  if (part.plinth) {
    const [w, h, d] = part.plinth;
    const base = new Mesh(new BoxGeometry(w, h, d), STONE);
    base.position.y = h / 2 - 0.05;
    holder.add(base);
    lift += h - 0.05;
  }
  if (part.hill) {
    const [r, h] = part.hill;
    holder.add(rockHill(r, h));
    lift += h - 0.08;
  }
  inner.position.y = lift;
  holder.add(inner);

  // 4. torche : flamme + halo au sommet de la pièce
  if (part.torch) {
    holder.updateMatrixWorld(true);
    const top = highestPoint(inner);
    if (top) holder.add(torch(top));
  }
  if (part.offset) holder.position.set(...part.offset);
  return holder;
}

/** Colline rocheuse (demi-sphère déformée, plateau au sommet pour poser la statue). */
function rockHill(r: number, h: number): Mesh {
  const g = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 7.1 + z * 3.3) * 0.06 + Math.sin(z * 9.7 - x * 5.1 + y * 4) * 0.05 + Math.sin((x + z) * 17) * 0.02;
    const top = y > 0.9 ? 0 : 1; // plateau
    const yy = Math.min(y, 0.96);
    p.setXYZ(i, x * r * (1 + n * top), Math.pow(yy, 0.8) * h * (1 + n * 0.6 * top), z * r * (1 + n * top));
  }
  g.computeVertexNormals();
  const m = new MeshStandardMaterial({ color: '#4c5a3c', roughness: 0.95, flatShading: true });
  return new Mesh(g, m);
}

function highestPoint(o: Object3D): Vector3 | null {
  let best: Vector3 | null = null;
  const v = new Vector3();
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (!best || v.y > best.y) best = v.clone();
    }
  });
  return best;
}

function torch(at: Vector3): Group {
  const g = new Group();
  g.position.copy(at);
  const flame = new Mesh(new ConeGeometry(0.06, 0.22, 10), new MeshBasicMaterial({ color: new Color('#ffb347').multiplyScalar(3), toneMapped: false }));
  flame.position.y = 0.11;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,200,120,1)');
  gr.addColorStop(0.35, 'rgba(255,140,40,0.45)');
  gr.addColorStop(1, 'rgba(255,100,20,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const halo = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), blending: AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(0.9);
  halo.position.y = 0.14;
  g.add(flame, halo);
  return g;
}
