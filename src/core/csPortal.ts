/**
 * Skins CS 6★ en 3D (11/11) — la face de la carte devient une FENÊTRE : le skin (vrai modèle de CS2, peinture
 * recomposée hors ligne par scripts/make-cs3d.py) flotte dans une boîte derrière la vitre, la carte garde son épaisseur.
 *
 * Même technique que les Merveilles (core/wonderDiorama, exp 010) : la scène du skin est rendue par `pass(scene, camera)`
 * avec LA caméra de la visionneuse et suit la matrice de la carte → parallaxe exacte quand on incline. Le cadre de la
 * carte (nom, étoiles, bordure 6★) reste imprimé sur la vitre : là où le calque `frame` est transparent, on voit dedans.
 *
 * Éclairage IDENTIQUE à celui des cartes de la visionneuse (game/scenes/viewer.ts) : environnement 'studio' ×1,2 + lumière
 * principale 0xfff0e0 ×1,2 venant de (−1, 2, 3), en repère monde (elle ne tourne pas avec la carte).
 * Coût : un maillage (7 000 à 22 000 triangles, ~120 Ko) partagé par modèle, deux textures WebP 1024² par carte (~200 Ko),
 * passe portail limitée (scissor) au rectangle de la carte, 0,8 de résolution sur téléphone. Effets réduits : pas de 3D.
 */
import {
  ClippingGroup,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  Plane,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Camera,
  type Material,
  type Texture,
} from 'three/webgpu';
import { float, min, mix, pass, screenUV, smoothstep, texture, uv, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { CardArt } from './art';
import { artV } from './artRev';
import { CARD } from './cardModel';
import { studioEnv } from './env';
import { compilePassAsync } from './post';
import { CS3D, type Cs3dModel } from './sets/cs3d';
import { siteUrl } from './siteRoot';
import type { N } from './tsl';

export const isCs3dCard = (cardId: string): boolean => cardId in CS3D;

/**
 * Pose de chaque modèle dans la boîte (repère carte : x à droite, y en haut, z vers l'œil).
 * `side` : rotation qui présente la face « playside » ; `a` : angle dans le plan de la carte (diagonale) ;
 * `s` : plus grande dimension (unités carte) ; `y` : décalage vertical.
 */
const POSE: Record<Cs3dModel, { side: [number, number, number]; a: number; s: number; y: number }> = {
  karambit: { side: [0, Math.PI / 2, 0], a: -0.3, s: 0.6, y: 0.02 },
  butterfly: { side: [0, Math.PI / 2, 0], a: -0.75, s: 0.82, y: 0.02 },
  m9: { side: [0, Math.PI / 2, 0], a: -0.75, s: 0.84, y: 0.02 },
  talon: { side: [0, Math.PI / 2, 0], a: -0.55, s: 0.74, y: 0.02 },
  awp: { side: [0, Math.PI / 2, 0], a: 0.75, s: 0.9, y: 0 },
  m4a4: { side: [0, Math.PI / 2, 0], a: 0.75, s: 0.9, y: 0 },
} as Record<Cs3dModel, { side: [number, number, number]; a: number; s: number; y: number }>;

/** profondeur de la boîte (unités carte) : le fond est à BACK derrière la vitre, le skin au milieu */
const BACK = 0.42;
const MID = 0.17;

interface Assets {
  model: Group;
  color: Texture;
  orm: Texture;
}
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new TextureLoader();
const models = new Map<Cs3dModel, Promise<Group>>();
const assets = new Map<string, Promise<Assets>>();

function loadTex(url: string, srgb: boolean): Promise<Texture> {
  return texLoader.loadAsync(url).then((t) => {
    t.flipY = false; // UV glTF (origine en haut à gauche), comme les textures cuites
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Charge (une fois) le modèle et les deux textures d'une carte. */
export function preloadCs3d(cardId: string): Promise<Assets> {
  let p = assets.get(cardId);
  if (!p) {
    const m = CS3D[cardId];
    let g = models.get(m);
    if (!g) models.set(m, (g = loader.loadAsync(siteUrl(`models/cs/${m}.glb`)).then((x) => x.scene)));
    p = Promise.all([g, loadTex(siteUrl(artV(`art/cs3d/${cardId}-c.webp`)), true), loadTex(siteUrl(artV(`art/cs3d/${cardId}-m.webp`)), false)]).then(
      ([model, color, orm]) => ({ model, color, orm }),
    );
    p.catch(() => assets.delete(cardId)); // (réseau : on réessaiera à la prochaine ouverture)
    // une seule carte gardée en mémoire en plus de celle affichée : ~8 Mo de textures décodées chacune
    assets.set(cardId, p);
    if (assets.size > 2) {
      const [old] = assets.keys();
      const q = assets.get(old);
      assets.delete(old);
      void q?.then((a) => (a.color.dispose(), a.orm.dispose()), () => undefined);
    }
  }
  return p;
}

export interface CsVisualInstance {
  cardMesh: Mesh;
  update: (dt: number, t: number) => void;
  dispose: () => void;
}

export function createCsCardInstance(
  cardId: string,
  a: Assets,
  art: CardArt,
  backMaterial: Material,
  edgeMaterial: Material,
  cardGeometry: ReturnType<typeof import('./cardModel').createCardGeometry>,
  camera: Camera,
  quality: 'high' | 'mobile',
  renderer: { getDrawingBufferSize(v: Vector2): Vector2 },
): CsVisualInstance {
  const pose = POSE[CS3D[cardId]];
  const scene = new Scene();
  scene.environment = studioEnv(renderer as never, 'studio');
  scene.environmentIntensity = 1.2;
  const key = new DirectionalLight(0xfff0e0, 1.2);
  key.position.set(-1, 2, 3);
  scene.add(key, key.target);

  const root = new Group();
  root.matrixAutoUpdate = false;
  scene.add(root);

  // fond de la boîte : le fond de la carte, plus grand que la fenêtre (on le voit de biais quand on incline)
  const wallMat = new MeshBasicNodeMaterial();
  wallMat.colorNode = texture(art.bg, uv()).rgb;
  const wall = new Mesh(new PlaneGeometry(CARD.w * 1.45, CARD.h * 1.45), wallMat);
  wall.position.z = -BACK;
  root.add(wall);

  // le skin (coupé au plan de la vitre : rien ne dépasse devant le verre)
  const glass = new Plane(new Vector3(0, 0, -1), 0);
  const clip = new ClippingGroup();
  clip.clippingPlanes = [glass];
  root.add(clip);
  const holder = new Group();
  holder.position.set(0, pose.y, -MID);
  holder.rotation.z = pose.a;
  const spin = new Group();
  holder.add(spin);
  const skinMat = new MeshStandardNodeMaterial({ map: a.color, roughnessMap: a.orm, metalnessMap: a.orm, roughness: 1, metalness: 1 });
  const plainMat = new MeshStandardNodeMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.6 });
  const inst = a.model.clone(true);
  inst.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.material = m.material && (m.material as Material).name === 'shared_scope' ? plainMat : skinMat;
  });
  inst.rotation.set(...pose.side);
  inst.scale.setScalar(pose.s);
  spin.add(inst);
  clip.add(holder);
  root.traverse((o) => (o.frustumCulled = false));

  // la vitre : le cadre de la carte imprimé dessus, la boîte vue au travers (ombre douce sur le pourtour)
  const portalPass = pass(
    scene,
    camera,
    quality === 'mobile' ? { storeMultisampledColorBuffer: false, storeMultisampledDepthBuffer: false, storeMultisampledStencilBuffer: false, resolveDepthBuffer: false, resolveStencilBuffer: false } : undefined,
  );
  if (quality === 'mobile') portalPass.setResolutionScale(0.8);
  const portal = portalPass.context({ getUV: () => screenUV }) as unknown as N;
  const fr = texture(art.frame);
  const win = fr.a.oneMinus();
  const e = min(min(uv().x, uv().x.oneMinus()).mul(CARD.w), min(uv().y, uv().y.oneMinus()).mul(CARD.h));
  const inner = mix(float(0.45), float(1), smoothstep(0.0, 0.05, e));
  const frontMat = new MeshPhysicalNodeMaterial();
  frontMat.colorNode = fr.rgb.mul(fr.a);
  // plafonné à 1 : la face est émissive (bloom de la visionneuse) ; sans plafond, chaque reflet du métal « brûlait »
  frontMat.emissiveNode = min(portal.rgb, vec3(1)).mul(win).mul(inner);
  frontMat.roughnessNode = mix(float(0.55), float(0.02), win);
  frontMat.metalnessNode = float(0);
  frontMat.clearcoatNode = win.mul(0.3); // vitre discrète : le skin garde ses vraies couleurs
  frontMat.clearcoatRoughnessNode = float(0.02);
  const cardMesh = new Mesh(cardGeometry, [frontMat, backMaterial, edgeMaterial]);
  if ('compileAsync' in renderer) void compilePassAsync(renderer as never, portalPass);

  const cardPos = new Vector3();
  const cardZ = new Vector3();
  const tmp = new Vector3();
  const buf = new Vector2();
  const CORNERS = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => new Vector3((sx * CARD.w) / 2, (sy * CARD.h) / 2, 0)));

  const update = (_dt: number, t: number) => {
    cardMesh.updateMatrixWorld();
    root.matrix.copy(cardMesh.matrixWorld);
    root.matrixWorldNeedsUpdate = true;
    root.updateMatrixWorld(true);
    // visionneuse : le skin se balance lentement d'une face à l'autre
    spin.rotation.y = Math.sin(t * 0.45) * 0.42;
    spin.rotation.x = Math.sin(t * 0.31) * 0.06;
    cardPos.setFromMatrixPosition(cardMesh.matrixWorld);
    cardZ.setFromMatrixColumn(cardMesh.matrixWorld, 2).normalize().negate();
    glass.setFromNormalAndCoplanarPoint(cardZ, cardPos);
    // la passe ne rend que le rectangle écran de la carte
    renderer.getDrawingBufferSize(buf);
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1;
    for (const c of CORNERS) {
      tmp.copy(c).applyMatrix4(cardMesh.matrixWorld).project(camera);
      x0 = Math.min(x0, tmp.x); x1 = Math.max(x1, tmp.x);
      y0 = Math.min(y0, tmp.y); y1 = Math.max(y1, tmp.y);
    }
    const px = (v: number, s: number) => Math.min(s, Math.max(0, ((v + 1) / 2) * s));
    const X0 = Math.floor(px(x0, buf.x)) - 2, X1 = Math.ceil(px(x1, buf.x)) + 2;
    const Yt = Math.floor(buf.y - px(y1, buf.y)) - 2, Yb = Math.ceil(buf.y - px(y0, buf.y)) + 2;
    portalPass.setScissor(Math.max(0, X0), Math.max(0, Yt), Math.max(1, X1 - X0), Math.max(1, Yb - Yt));
  };

  const dispose = () => {
    portalPass.dispose();
    frontMat.dispose();
    skinMat.dispose();
    plainMat.dispose();
    wallMat.dispose();
    wall.geometry.dispose();
    // maillage du modèle et textures : partagés (cache), libérés par preloadCs3d
  };
  return { cardMesh, update, dispose };
}
