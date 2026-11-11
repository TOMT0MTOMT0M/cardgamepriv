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
 * Coût : un maillage (7 000 à 22 000 triangles, ~120 Ko) partagé par modèle, deux textures WebP 1024² par carte (~200 Ko,
 * trois pour les gants et le sticker : + la normale, ~170 Ko ; sticker : 12 triangles + le spectre holo commun, ~3 Ko),
 * passe portail limitée (scissor) au rectangle de la carte, 0,8 de résolution sur téléphone. Effets réduits : pas de 3D.
 */
import {
  BoxGeometry,
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
  RepeatWrapping,
  type Camera,
  type Material,
  type Texture,
} from 'three/webgpu';
import { float, fract, luminance, min, mix, pass, screenUV, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { CardArt } from './art';
import { artV } from './artRev';
import { CARD } from './cardModel';
import { studioEnv } from './env';
import { compilePassAsync } from './post';
import { CS3D, CS3D_NORMAL, type Cs3dModel } from './sets/cs3d';
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
  // (11/11) gants : la paire (make-cs3d.mjs) — dos du gant droit vers l'œil, doigts vers le bas, en diagonale
  specialist: { side: [0, 0, 0], a: 0.55, s: 0.68, y: 0 },
  sporty: { side: [0, 0, 0], a: 0.55, s: 0.7, y: 0 },
  // (11/11) sticker : la feuille posée de face, à peine inclinée
  sticker: { side: [0, 0, 0], a: -0.08, s: 0.5, y: 0.02 },
} as Record<Cs3dModel, { side: [number, number, number]; a: number; s: number; y: number }>;

/**
 * Profondeur de la boîte (unités carte) : le skin tourne sur lui-même au milieu (MID, assez loin de la vitre pour qu'une
 * demi-longueur ne la traverse jamais), le fond est à BACK. SCALE compense la perspective (le skin est plus loin).
 */
const BACK = 0.85;
const MID = 0.4;
const SCALE = 1.0;

interface Assets {
  model: Group;
  color: Texture;
  orm: Texture;
  /** gants et sticker : normale (coutures, rembourrages ; relief du sticker et prédécoupe) */
  normal: Texture | null;
  /** sticker : spectre du holo (commun) */
  holo: Texture | null;
}
let holoSpectre: Promise<Texture> | null = null;
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
    // (le sticker n'a pas de maillage : sa feuille est construite dans createCsCardInstance)
    if (!g) models.set(m, (g = m === 'sticker' ? Promise.resolve(new Group()) : loader.loadAsync(siteUrl(`models/cs/${m}.glb`)).then((x) => x.scene)));
    if (m === 'sticker' && !holoSpectre) {
      holoSpectre = loadTex(siteUrl(artV('art/cs3d/holo-spectre.webp')), true).then((t) => ((t.wrapS = RepeatWrapping), t));
      holoSpectre.catch(() => (holoSpectre = null));
    }
    p = Promise.all([
      g,
      loadTex(siteUrl(artV(`art/cs3d/${cardId}-c.webp`)), true),
      loadTex(siteUrl(artV(`art/cs3d/${cardId}-m.webp`)), false),
      CS3D_NORMAL.has(m) ? loadTex(siteUrl(artV(`art/cs3d/${cardId}-n.webp`)), false) : null,
      m === 'sticker' ? holoSpectre : null,
    ]).then(([model, color, orm, normal, holo]) => ({ model, color, orm, normal, holo }));
    p.catch(() => assets.delete(cardId)); // (réseau : on réessaiera à la prochaine ouverture)
    // une seule carte gardée en mémoire en plus de celle affichée : ~8 Mo de textures décodées chacune
    assets.set(cardId, p);
    if (assets.size > 2) {
      const [old] = assets.keys();
      const q = assets.get(old);
      assets.delete(old);
      void q?.then((a) => (a.color.dispose(), a.orm.dispose(), a.normal?.dispose()), () => undefined);
    }
  }
  return p;
}

export interface CsVisualInstance {
  cardMesh: Mesh;
  /** rotation du skin (radians, axes de l'écran) donnée par la visionneuse ; idle 0..1 : balancement automatique */
  inspect: { yaw: number; pitch: number; idle: number };
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
  const wall = new Mesh(new PlaneGeometry(CARD.w * 1.7, CARD.h * 1.7), wallMat);
  wall.position.z = -BACK;
  root.add(wall);

  // le skin (coupé au plan de la vitre : rien ne dépasse devant le verre)
  const glass = new Plane(new Vector3(0, 0, -1), 0);
  const clip = new ClippingGroup();
  clip.clippingPlanes = [glass];
  root.add(clip);
  // (11/11, retours de Tom) la carte reste de face : le geste (doigt, souris, gyroscope) tourne le SKIN, autour des
  // axes de l'écran (spin), puis sa pose dans la carte (diagonale)
  const holder = new Group();
  holder.position.set(0, pose.y, -MID);
  const spin = new Group();
  holder.add(spin);
  const diag = new Group();
  diag.rotation.z = pose.a;
  spin.add(diag);
  // gants (11/11) : textile — normale du modèle, et un voile de « sheen » (le duvet du tissu au bord des reliefs) sur
  // ordinateur ; téléphone : matériau standard + normale (même coût par pixel que les couteaux, une lecture en plus)
  const cloth = !!a.normal;
  const skinMat =
    cloth && quality === 'high'
      ? new MeshPhysicalNodeMaterial({ map: a.color, roughnessMap: a.orm, metalnessMap: a.orm, roughness: 1, metalness: 1, normalMap: a.normal, sheen: 0.6, sheenRoughness: 0.75, sheenColor: 0xd8d4cc })
      : new MeshStandardNodeMaterial({ map: a.color, roughnessMap: a.orm, metalnessMap: a.orm, roughness: 1, metalness: 1, normalMap: a.normal });
  const plainMat = new MeshStandardNodeMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.6 });
  // STICKER (11/11) : objet plat — la feuille (papier, le sticker et sa prédécoupe imprimés dessus, cuits par
  // make-cs3d.py), une boîte de 1 × 1 × 0,008. Holo : le spectre de CS2 (holowarp) lu selon l'angle sous lequel on
  // regarde la feuille (`tilt` : direction de l'œil dans le repère de la feuille, mise à jour à chaque image), plus la
  // position sur la feuille et le filigrane du masque ; là où le masque holo est fort, la vinyle devient miroir coloré.
  const sticker = CS3D[cardId] === 'sticker' && !!a.holo;
  const tilt = uniform(new Vector2());
  let stickerMats: Material[] = [];
  let inst: Group | Mesh;
  if (sticker) {
    const o = texture(a.orm);
    const base = texture(a.color).rgb;
    const holo = o.r as unknown as N;
    const phase = tilt.x.mul(1.7).add(tilt.y.mul(1.2)).add(uv().x.mul(0.9)).sub(uv().y.mul(0.6)).add(o.b.mul(0.35));
    const spec = texture(a.holo!, vec2(fract(phase), 0.5)).rgb;
    const holoCol = spec.mul(luminance(base).mul(0.7).add(0.45));
    const face = quality === 'high' ? new MeshPhysicalNodeMaterial({ normalMap: a.normal }) : new MeshStandardNodeMaterial({ normalMap: a.normal });
    face.colorNode = mix(base, holoCol, holo.mul(0.62));
    face.roughnessNode = mix(o.g, float(0.16), holo);
    face.metalnessNode = holo.mul(0.5);
    face.emissiveNode = spec.mul(holo).mul(0.1); // le holo garde son éclat dans la pénombre de la boîte
    if (face instanceof MeshPhysicalNodeMaterial) face.clearcoatNode = float(0.5); // vinyle laminée (ordinateur)
    const paper = new MeshStandardNodeMaterial({ color: 0xd6d6d2, roughness: 0.85, metalness: 0 });
    stickerMats = [face, paper];
    // (ordre des faces de BoxGeometry : +x, −x, +y, −y, +z (devant), −z)
    const geo = new BoxGeometry(1, 1, 0.008);
    // textures cuites à la mode glTF (flipY = false, origine en haut) : v retourné sur la boîte
    const uvA = geo.getAttribute('uv');
    for (let i = 0; i < uvA.count; i++) uvA.setY(i, 1 - uvA.getY(i));
    inst = new Mesh(geo, [paper, paper, paper, paper, face, paper]);
  } else {
    inst = a.model.clone(true);
    inst.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.material = m.material && (m.material as Material).name === 'shared_scope' ? plainMat : skinMat;
    });
  }
  inst.rotation.set(...pose.side);
  inst.scale.setScalar(pose.s * SCALE);
  diag.add(inst);
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

  const inspect = { yaw: 0, pitch: 0, idle: 1 };
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
    // le geste du joueur, plus un balancement lent quand personne ne touche
    spin.rotation.y = inspect.yaw + Math.sin(t * 0.45) * 0.42 * inspect.idle;
    spin.rotation.x = inspect.pitch + Math.sin(t * 0.31) * 0.06 * inspect.idle;
    if (sticker) {
      // l'œil dans le repère de la feuille → le holo glisse quand on l'incline
      inst.updateMatrixWorld(true);
      inst.worldToLocal(tmp.copy(camera.position)).normalize();
      tilt.value.set(tmp.x, tmp.y);
    }
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
    for (const m of stickerMats) m.dispose();
    if (sticker) (inst as Mesh).geometry.dispose();
    wallMat.dispose();
    wall.geometry.dispose();
    // maillage du modèle et textures : partagés (cache), libérés par preloadCs3d
  };
  return { cardMesh, inspect, update, dispose };
}
