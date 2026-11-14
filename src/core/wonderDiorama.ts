/**
 * Les 14 Merveilles du Monde — cartes secrètes du World Pack.
 *
 * La fenêtre de la carte est un vrai portail (technique de l'exp 010) : un diorama low-poly vit derrière la vitre,
 * rendu par `pass(scene, camera)` avec la même caméra → parallaxe exacte quand on incline.
 *
 * Immersion sans bord, même en rotation complète :
 * - **jamais de dessous** : un « gimbal » d'horizon — tant que la caméra (dans le repère de la carte) est au-dessus du sol,
 *   le monde est rigidement solidaire de la carte ; au-delà, il pivote autour du centre de la fenêtre juste assez pour
 *   garder l'œil au-dessus du sol. Le sol est posé au bas de la fenêtre et reste plat autour de la caméra.
 * - **jamais de limite** : sol en disque (rayons remappés, dense près de la vitre), fermé par une **ligne de crêtes**
 *   cylindrique avec sa propre brume (≈512 triangles) ; le brouillard de scène sature avant la crête, le ciel est
 *   couleur brume sous l'horizon. Nuages en anneau tout autour.
 * - le monument seul est coupé au plan de la vitre (`ClippingGroup`), le sol continue « sous le cadre ».
 * - **perf** : la passe portail est limitée par scissor au rectangle écran de la carte (au lieu de tout l'écran),
 *   résolution 0,8 en mobile ; aucune passe en plus par rapport à 010.
 */
import { tData } from './i18n';
import {
  BoxGeometry,
  ClippingGroup,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  Plane,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Material,
} from 'three/webgpu';
import {
  abs,
  color,
  float,
  floor,
  fog,
  hash,
  instanceIndex,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  normalize,
  pass,
  positionWorldDirection,
  pow,
  rangeFogFactor,
  screenUV,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { CardArt } from './art';
import { WINDOW_UV, windowSDF } from './cardMaterial';
import { CARD } from './cardModel';
import { hasWonderModel, preloadWonderModel as preloadModel, wonderModelIfReady } from './wonderModels';
import { buildEnvironment, preloadEnv } from './wonderEnv';

/** Précharge le modèle 3D et les accessoires du décor d'une merveille (à attendre avant de créer la carte). */
export function preloadWonderModel(cardId: string): Promise<unknown> {
  return Promise.all([preloadModel(cardId), preloadEnv(cardId)]);
}
import type { N } from './tsl';
import { compilePassAsync, isWebGPURenderer } from './post';

/** Vérifie si une carte fait partie des 14 Merveilles du Monde (Secrets du World Pack). */
export function isWonderCard(cardId: string): boolean {
  return cardId.startsWith('mrv-');
}

export interface WonderAtmosphere {
  name: string;
  coords: string;
  top: string;
  horizon: string;
  fog: string;
  sun: string;
  ground: string;
  accent: string;
  sunY: number;
  light: number;
  stars: boolean;
  terrainType: 'dunes' | 'marble' | 'mountains' | 'water' | 'canyon';
}

// i18n-data:début
export const WONDER_ATMOSPHERES: Record<string, WonderAtmosphere> = {
  // 1. Grande Pyramide de Khéops
  'mrv-grande-pyramide-de-kheops': {
    get name() {
      return tData('wonder.mrv-grande-pyramide-de-kheops', 'Khéops (Gizeh)');
    }, coords: '29°58′45″N 31°08′03″E',
    top: '#181008', horizon: '#e69a38', fog: '#9c5a1a', sun: '#fff3d1', ground: '#d99a4c', accent: '#ffe494',
    sunY: 0.35, light: 2.2, stars: false, terrainType: 'dunes',
  },
  // 2. Jardins suspendus de Babylone
  'mrv-jardins-suspendus-de-babylone': {
    get name() {
      return tData('wonder.mrv-jardins-suspendus-de-babylone', 'Jardins de Babylone');
    }, coords: '32°32′11″N 44°25′15″E',
    top: '#0a1a12', horizon: '#3d784a', fog: '#204d2e', sun: '#ffdfa0', ground: '#2e4a36', accent: '#72e098',
    sunY: 0.28, light: 1.8, stars: false, terrainType: 'marble',
  },
  // 3. Statue de Zeus à Olympie
  'mrv-statue-de-zeus-a-olympie': {
    get name() {
      return tData('wonder.mrv-statue-de-zeus-a-olympie', 'Statue de Zeus');
    }, coords: '37°38′16″N 21°37′48″E',
    top: '#0d0f24', horizon: '#3b2f5c', fog: '#22193b', sun: '#f7d070', ground: '#3e3852', accent: '#ffd269',
    sunY: 0.45, light: 2.0, stars: true, terrainType: 'marble',
  },
  // 4. Temple d'Artémis à Éphèse
  'mrv-temple-d-artemis-a-ephese': {
    get name() {
      return tData('wonder.mrv-temple-d-artemis-a-ephese', 'Temple d’Artémis');
    }, coords: '37°56′59″N 27°21′50″E',
    top: '#081424', horizon: '#254a6e', fog: '#152d47', sun: '#d6ecff', ground: '#344657', accent: '#a6d8ff',
    sunY: 0.22, light: 1.5, stars: true, terrainType: 'marble',
  },
  // 5. Mausolée d'Halicarnasse
  'mrv-mausolee-d-halicarnasse': {
    get name() {
      return tData('wonder.mrv-mausolee-d-halicarnasse', 'Mausolée d’Halicarnasse');
    }, coords: '37°02′16″N 27°25′27″E',
    top: '#101c2e', horizon: '#466c8a', fog: '#2c4b63', sun: '#ffeed6', ground: '#4a5b6d', accent: '#ffd9aa',
    sunY: 0.3, light: 1.7, stars: false, terrainType: 'marble',
  },
  // 6. Colosse de Rhodes
  'mrv-colosse-de-rhodes': {
    get name() {
      return tData('wonder.mrv-colosse-de-rhodes', 'Colosse de Rhodes');
    }, coords: '36°27′04″N 28°13′40″E',
    top: '#0b1629', horizon: '#c4662d', fog: '#63301a', sun: '#ffb26b', ground: '#1a334d', accent: '#ff974d',
    sunY: 0.12, light: 2.0, stars: false, terrainType: 'water',
  },
  // 7. Phare d'Alexandrie
  'mrv-phare-d-alexandrie': {
    get name() {
      return tData('wonder.mrv-phare-d-alexandrie', 'Phare d’Alexandrie');
    }, coords: '31°12′50″N 29°53′08″E',
    top: '#060e1a', horizon: '#162e4a', fog: '#0d1e33', sun: '#fff4cc', ground: '#162e45', accent: '#ffe680',
    sunY: 0.4, light: 2.5, stars: true, terrainType: 'water',
  },
  // 8. Grande Muraille de Chine
  'mrv-grande-muraille-de-chine': {
    get name() {
      return tData('wonder.mrv-grande-muraille-de-chine', 'Grande Muraille');
    }, coords: '40°25′00″N 116°34′00″E',
    top: '#240f13', horizon: '#a8432a', fog: '#5c2217', sun: '#ffd185', ground: '#453832', accent: '#ff8a5c',
    sunY: 0.18, light: 1.9, stars: false, terrainType: 'mountains',
  },
  // 9. Pétra (Khazneh)
  'mrv-petra-khazneh': {
    get name() {
      return tData('wonder.mrv-petra-khazneh', 'Pétra (Khazneh)');
    }, coords: '30°19′21″N 35°27′06″E',
    top: '#240b09', horizon: '#a83c27', fog: '#691e10', sun: '#ffd59e', ground: '#853e31', accent: '#ffa07a',
    sunY: 0.25, light: 2.1, stars: false, terrainType: 'canyon',
  },
  // 10. Christ Rédempteur (Rio)
  'mrv-christ-redempteur-rio': {
    get name() {
      return tData('wonder.mrv-christ-redempteur-rio', 'Christ Rédempteur');
    }, coords: '22°57′06″S 43°12′39″W',
    top: '#091c36', horizon: '#3a72a8', fog: '#1e4873', sun: '#ffffff', ground: '#264832', accent: '#c2e4ff',
    sunY: 0.55, light: 2.2, stars: false, terrainType: 'mountains',
  },
  // 11. Machu Picchu
  'mrv-machu-picchu': {
    get name() {
      return tData('wonder.mrv-machu-picchu', 'Machu Picchu');
    }, coords: '13°09′48″S 72°32′44″W',
    top: '#0c211e', horizon: '#447d71', fog: '#25544b', sun: '#fff4cf', ground: '#2b4d3d', accent: '#9de8d4',
    sunY: 0.32, light: 1.9, stars: false, terrainType: 'mountains',
  },
  // 12. Chichén Itzá
  'mrv-chichen-itza': {
    get name() {
      return tData('wonder.mrv-chichen-itza', 'Chichén Itzá');
    }, coords: '20°40′58″N 88°34′07″W',
    top: '#0a1c10', horizon: '#36693a', fog: '#1c4220', sun: '#ffedb3', ground: '#384f33', accent: '#a5e070',
    sunY: 0.38, light: 2.0, stars: false, terrainType: 'marble',
  },
  // 13. Colisée de Rome
  'mrv-colisee-de-rome': {
    get name() {
      return tData('wonder.mrv-colisee-de-rome', 'Colisée de Rome');
    }, coords: '41°53′25″N 12°29′32″E',
    top: '#211018', horizon: '#ad582e', fog: '#6e301b', sun: '#ffd07a', ground: '#5e4c45', accent: '#ffae61',
    sunY: 0.15, light: 1.8, stars: false, terrainType: 'marble',
  },
  // 14. Taj Mahal
  'mrv-taj-mahal': {
    get name() {
      return tData('wonder.mrv-taj-mahal', 'Taj Mahal');
    }, coords: '27°10′30″N 78°02′31″E',
    top: '#18172e', horizon: '#8f5c75', fog: '#523041', sun: '#fff0e0', ground: '#4a4254', accent: '#ffd9eb',
    sunY: 0.2, light: 1.9, stars: true, terrainType: 'water',
  },
};
// i18n-data:fin

const DEFAULT_ATMOSPHERE: WonderAtmosphere = {
  get name() {
    return tData('wonder.default', 'Merveille du Monde'); // i18n-ok
  },
  coords: '00°00′00″N 00°00′00″E',
  top: '#0f0f24', horizon: '#573d75', fog: '#2e1e45', sun: '#ffd980', ground: '#3a344d', accent: '#f5c662',
  sunY: 0.3, light: 1.8, stars: true, terrainType: 'marble',
};

export function getWonderAtmosphere(cardId: string): WonderAtmosphere {
  return WONDER_ATMOSPHERES[cardId] ?? DEFAULT_ATMOSPHERE;
}

// ───────────────────────────────────────────── 0. KIT DE MATÉRIAUX
/** Niveau du sol (repère diorama), niveau de l'eau, rayon du monde. */
import { Y0 } from './wonderEnv';

export interface MatKit {
  stoneMat: MeshStandardNodeMaterial;
  marbleMat: MeshStandardNodeMaterial;
  goldMat: MeshStandardNodeMaterial;
  darkMat: MeshStandardNodeMaterial;
  std(col: string | N, rough: number, metal: number, flat?: boolean): MeshStandardNodeMaterial;
  /** matériau émissif (fanal, torche) */
  glow(col: string, k: number): MeshBasicNodeMaterial;
  all: Material[];
}

export function createMatKit(atm: WonderAtmosphere): MatKit {
  const all: Material[] = [];
  const std = (col: string | N, rough: number, metal: number, flat = false) => {
    const m = new MeshStandardNodeMaterial({ flatShading: flat });
    m.colorNode = typeof col === 'string' ? color(col) : col;
    m.roughnessNode = float(rough);
    m.metalnessNode = float(metal);
    all.push(m);
    return m;
  };
  const glow = (col: string, k: number) => {
    const m = new MeshBasicNodeMaterial();
    m.colorNode = color(col).mul(k);
    all.push(m);
    return m;
  };
  return {
    stoneMat: std(atm.ground, 0.8, 0.04),
    marbleMat: std(mix(color(atm.ground), color('#ffffff'), 0.78), 0.28, 0.08),
    goldMat: std('#f5c662', 0.2, 0.92),
    darkMat: std(mix(color(atm.ground), color('#101216'), 0.65), 0.85, 0),
    std,
    glow,
    all,
  };
}

// ───────────────────────────────────────────── 1. MONUMENTS
/** Monuments low-poly (proportions d’ensemble) — tous les matériaux passent par le kit (révélation par balayage). */
export function buildMonumentMesh(cardId: string, atm: WonderAtmosphere, kit: MatKit): Group {
  const group = new Group();

  const { stoneMat, marbleMat, goldMat, darkMat } = kit;

  switch (cardId) {
    case 'mrv-grande-pyramide-de-kheops': {
      // 14 degrés étagés pour Khéops + pyramidion d'or
      const tiers = 14;
      for (let i = 0; i < tiers; i++) {
        const w = 4.2 * (1 - i / tiers);
        const h = 0.22;
        const tier = new Mesh(new BoxGeometry(w, h, w), stoneMat);
        tier.position.set(0, -0.6 + i * h, -3.8);
        group.add(tier);
      }
      const cap = new Mesh(new ConeGeometry(0.35, 0.45, 4), goldMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(0, -0.6 + tiers * 0.22 + 0.2, -3.8);
      group.add(cap);

      // Petite pyramide satellite au loin
      const small = new Mesh(new ConeGeometry(1.0, 1.3, 4), stoneMat);
      small.rotation.y = Math.PI / 4;
      small.position.set(2.4, -0.15, -5.5);
      group.add(small);
      break;
    }

    case 'mrv-colisee-de-rome': {
      // 3 rangées concentriques d'arcades pour le Colisée
      for (let tier = 0; tier < 3; tier++) {
        const rad = 2.4 - tier * 0.15;
        const y = -0.5 + tier * 0.55;
        const arches = 24;
        for (let a = 0; a < arches; a++) {
          const ang = (a / arches) * Math.PI * 1.5 - 0.75 * Math.PI;
          const px = Math.sin(ang) * rad;
          const pz = -3.8 + Math.cos(ang) * (rad * 0.7);
          const pillar = new Mesh(new BoxGeometry(0.18, 0.5, 0.25), stoneMat);
          pillar.position.set(px, y, pz);
          pillar.rotation.y = -ang;
          group.add(pillar);
        }
        const ring = new Mesh(new CylinderGeometry(rad, rad, 0.12, 32, 1, true), marbleMat);
        ring.position.set(0, y + 0.28, -3.8);
        ring.scale.set(1, 1, 0.7);
        group.add(ring);
      }
      const arena = new Mesh(new CylinderGeometry(1.6, 1.6, 0.1, 32), stoneMat);
      arena.position.set(0, -0.65, -3.8);
      arena.scale.set(1, 1, 0.7);
      group.add(arena);
      break;
    }

    case 'mrv-taj-mahal': {
      // Plinthe marbre blanc
      const plinth = new Mesh(new BoxGeometry(3.6, 0.35, 3.2), marbleMat);
      plinth.position.set(0, -0.6, -3.8);
      group.add(plinth);

      // Mausolée central avec alcôves
      const mausoleum = new Mesh(new BoxGeometry(2.1, 1.6, 2.1), marbleMat);
      mausoleum.position.set(0, 0.3, -3.8);
      group.add(mausoleum);

      // Coupole centrale bulbeuse
      const dome = new Mesh(new SphereGeometry(0.85, 24, 18), marbleMat);
      dome.scale.set(1, 1.35, 1);
      dome.position.set(0, 1.7, -3.8);
      group.add(dome);

      const finial = new Mesh(new ConeGeometry(0.12, 0.5, 12), goldMat);
      finial.position.set(0, 2.8, -3.8);
      group.add(finial);

      // 4 minarets d'angle
      const corners = [
        [-1.6, -2.4], [1.6, -2.4],
        [-1.6, -5.2], [1.6, -5.2],
      ];
      for (const [cx, cz] of corners) {
        const minaret = new Mesh(new CylinderGeometry(0.12, 0.16, 2.9, 16), marbleMat);
        minaret.position.set(cx, 0.85, cz);
        group.add(minaret);
        const top = new Mesh(new ConeGeometry(0.15, 0.35, 12), goldMat);
        top.position.set(cx, 2.45, cz);
        group.add(top);
      }

      break;
    }

    case 'mrv-petra-khazneh': {
      // Deux immenses parois rocheuses du canyon (Siq)
      const leftCliff = new Mesh(new BoxGeometry(2.4, 5.0, 6.0), stoneMat);
      leftCliff.position.set(-2.5, 0.6, -3.0);
      leftCliff.rotation.y = 0.15;
      group.add(leftCliff);

      const rightCliff = new Mesh(new BoxGeometry(2.4, 5.0, 6.0), stoneMat);
      rightCliff.position.set(2.5, 0.6, -3.0);
      rightCliff.rotation.y = -0.15;
      group.add(rightCliff);

      // Façade sculptée du Khazneh
      const facade = new Group();
      facade.position.set(0, 0, -4.8);
      for (let i = -2; i <= 2; i++) {
        const col = new Mesh(new CylinderGeometry(0.09, 0.09, 1.8, 12), stoneMat);
        col.position.set(i * 0.45, 0, 0);
        facade.add(col);
      }
      const pediment = new Mesh(new ConeGeometry(1.3, 0.6, 3), stoneMat);
      pediment.rotation.z = Math.PI;
      pediment.position.set(0, 1.1, 0);
      facade.add(pediment);

      const tholos = new Mesh(new CylinderGeometry(0.35, 0.35, 0.9, 16), stoneMat);
      tholos.position.set(0, 1.7, -0.15);
      facade.add(tholos);
      const urn = new Mesh(new SphereGeometry(0.18, 12, 12), goldMat);
      urn.position.set(0, 2.3, -0.15);
      facade.add(urn);

      group.add(facade);
      break;
    }

    case 'mrv-phare-d-alexandrie': {

      const pier = new Mesh(new BoxGeometry(2.4, 0.5, 3.2), stoneMat);
      pier.position.set(0, -0.55, -4.2);
      group.add(pier);

      // 3 étages du phare (carré, octogonal, cylindrique)
      const base = new Mesh(new BoxGeometry(1.5, 1.2, 1.5), stoneMat);
      base.position.set(0, 0.1, -4.2);
      group.add(base);

      const mid = new Mesh(new CylinderGeometry(0.5, 0.65, 1.4, 8), stoneMat);
      mid.position.set(0, 1.3, -4.2);
      group.add(mid);

      const lantern = new Mesh(new CylinderGeometry(0.32, 0.32, 0.6, 16), marbleMat);
      lantern.position.set(0, 2.2, -4.2);
      group.add(lantern);

      // Fanal lumineux émissif
      const beaconMat = kit.glow('#fff5b8', 4.0);
      const beacon = new Mesh(new SphereGeometry(0.38, 16, 16), beaconMat); // déborde de la lanterne : on voit le fanal
      beacon.position.set(0, 2.2, -4.2);
      group.add(beacon);
      break;
    }

    case 'mrv-colosse-de-rhodes': {

      // Deux piliers de chaque côté du port
      const p1 = new Mesh(new BoxGeometry(0.9, 0.8, 1.2), stoneMat);
      p1.position.set(-1.3, -0.4, -4.0);
      const p2 = new Mesh(new BoxGeometry(0.9, 0.8, 1.2), stoneMat);
      p2.position.set(1.3, -0.4, -4.0);
      group.add(p1, p2);

      // Statue colossale en bronze doré
      const leg1 = new Mesh(new CylinderGeometry(0.18, 0.22, 1.4, 12), goldMat);
      leg1.position.set(-0.8, 0.4, -4.0);
      leg1.rotation.z = -0.15;
      const leg2 = new Mesh(new CylinderGeometry(0.18, 0.22, 1.4, 12), goldMat);
      leg2.position.set(0.8, 0.4, -4.0);
      leg2.rotation.z = 0.15;
      group.add(leg1, leg2);

      const torso = new Mesh(new BoxGeometry(0.9, 1.1, 0.55), goldMat);
      torso.position.set(0, 1.4, -4.0);
      group.add(torso);

      const head = new Mesh(new SphereGeometry(0.3, 16, 16), goldMat);
      head.position.set(0, 2.15, -4.0);
      group.add(head);

      const torch = new Mesh(new ConeGeometry(0.16, 0.55, 12), kit.glow('#ff7700', 2.5));
      torch.position.set(0.85, 2.6, -3.9);
      group.add(torch);
      break;
    }

    case 'mrv-jardins-suspendus-de-babylone': {
      // 4 terrasses étagées en ziggourat avec balustrades et végétation
      for (let t = 0; t < 4; t++) {
        const w = 3.8 - t * 0.75;
        const d = 3.0 - t * 0.55;
        const y = -0.6 + t * 0.6;
        const slab = new Mesh(new BoxGeometry(w, 0.22, d), stoneMat);
        slab.position.set(0, y, -4.0 + t * 0.35);
        group.add(slab);

        // Végétation luxuriante
        const foliageMat = kit.std(t % 2 === 0 ? '#34663a' : '#4d8050', 0.85, 0);
        const count = 7;
        for (let b = 0; b < count; b++) {
          const bush = new Mesh(new SphereGeometry(0.22 + (b % 2) * 0.08, 12, 10), foliageMat);
          bush.scale.set(1.4, 0.85, 1.2);
          bush.position.set(-w / 2 + 0.35 + (b / (count - 1)) * (w - 0.7), y + 0.2, -4.0 + t * 0.35 + d / 2 - 0.18);
          group.add(bush);
        }
      }
      break;
    }

    case 'mrv-grande-muraille-de-chine': {
      // Montagnes escarpées
      const mountainMat = kit.std(atm.ground, 0.9, 0);
      const m1 = new Mesh(new ConeGeometry(2.8, 3.2, 5), mountainMat);
      m1.position.set(-1.8, 0.4, -4.5);
      const m2 = new Mesh(new ConeGeometry(3.2, 3.8, 5), mountainMat);
      m2.position.set(1.8, 0.6, -5.2);
      group.add(m1, m2);

      // Muraille serpentine sinueuse
      const segments = 12;
      for (let s = 0; s < segments; s++) {
        const tNorm = s / (segments - 1);
        const px = -2.4 + tNorm * 4.8;
        const pz = -3.2 - Math.sin(tNorm * Math.PI) * 1.5;
        const py = -0.3 + Math.sin(tNorm * Math.PI * 1.5) * 0.4;
        const wall = new Mesh(new BoxGeometry(0.55, 0.65, 0.35), stoneMat);
        wall.position.set(px, py, pz);
        wall.rotation.y = Math.cos(tNorm * Math.PI) * 0.5;
        group.add(wall);
      }

      // 2 tours de garde fortifiées
      const tower1 = new Mesh(new BoxGeometry(0.7, 1.2, 0.7), stoneMat);
      tower1.position.set(-1.5, 0.3, -3.9);
      const tower2 = new Mesh(new BoxGeometry(0.7, 1.2, 0.7), stoneMat);
      tower2.position.set(1.5, 0.5, -4.3);
      group.add(tower1, tower2);
      break;
    }

    case 'mrv-christ-redempteur-rio': {
      // Montagne Corcovado en pain de sucre
      const mountain = new Mesh(new ConeGeometry(2.4, 2.8, 8), darkMat);
      mountain.position.set(0, -0.8, -4.2);
      group.add(mountain);

      // Piédestal octogonal
      const pedestal = new Mesh(new CylinderGeometry(0.45, 0.55, 0.8, 8), stoneMat);
      pedestal.position.set(0, 0.6, -4.2);
      group.add(pedestal);

      // Statue monumentale du Christ
      const body = new Mesh(new CylinderGeometry(0.24, 0.32, 1.4, 12), marbleMat);
      body.position.set(0, 1.6, -4.2);
      group.add(body);

      // Bras grands ouverts en croix (envergure 2.4)
      const arms = new Mesh(new BoxGeometry(2.5, 0.22, 0.22), marbleMat);
      arms.position.set(0, 2.1, -4.2);
      group.add(arms);

      const head = new Mesh(new SphereGeometry(0.2, 16, 16), marbleMat);
      head.position.set(0, 2.45, -4.2);
      group.add(head);
      break;
    }

    case 'mrv-machu-picchu': {
      // Pic Huayna Picchu au fond
      const huayna = new Mesh(new ConeGeometry(1.8, 3.2, 6), darkMat);
      huayna.position.set(0.6, 0.8, -5.6);
      group.add(huayna);

      // Terrasses agricoles incas en escalier
      for (let t = 0; t < 5; t++) {
        const y = -0.7 + t * 0.32;
        const z = -2.8 - t * 0.55;
        const terrace = new Mesh(new BoxGeometry(3.6, 0.25, 0.7), stoneMat);
        terrace.position.set(-0.2, y, z);
        group.add(terrace);

        // Petites maisons incas en granit
        const house = new Mesh(new BoxGeometry(0.45, 0.35, 0.4), marbleMat);
        house.position.set(-1.1 + t * 0.5, y + 0.25, z);
        group.add(house);
      }
      break;
    }

    case 'mrv-chichen-itza': {
      // Pyramide El Castillo à 9 degrés
      const tiers = 9;
      for (let i = 0; i < tiers; i++) {
        const w = 3.6 * (1 - i / (tiers + 2));
        const h = 0.24;
        const tier = new Mesh(new BoxGeometry(w, h, w), stoneMat);
        tier.position.set(0, -0.6 + i * h, -3.8);
        group.add(tier);
      }
      // Temple sommital de Kukulcán
      const temple = new Mesh(new BoxGeometry(1.0, 0.55, 1.0), marbleMat);
      temple.position.set(0, -0.6 + tiers * 0.24 + 0.25, -3.8);
      group.add(temple);

      // Grand escalier axial frontal
      // rampe fine posée sur la face avant (z −2.0 → −3.3, y −0.6 → +1.56)
      const stair = new Mesh(new BoxGeometry(0.5, 0.08, 2.55), marbleMat);
      stair.rotation.x = Math.atan2(2.16, 1.3); // avant (z+) en bas, arrière en haut
      stair.position.set(0, 0.5, -2.65);
      group.add(stair);
      break;
    }

    case 'mrv-mausolee-d-halicarnasse': {
      // Podium élevé
      const podium = new Mesh(new BoxGeometry(3.2, 1.0, 2.6), stoneMat);
      podium.position.set(0, -0.4, -3.8);
      group.add(podium);

      // Péristyle de 36 colonnes
      for (let x = -1.2; x <= 1.2; x += 0.6) {
        for (let z = -0.9; z <= 0.9; z += 0.6) {
          if (Math.abs(x) < 1.0 && Math.abs(z) < 0.8) continue;
          const col = new Mesh(new CylinderGeometry(0.08, 0.08, 1.2, 12), marbleMat);
          col.position.set(x, 0.7, -3.8 + z);
          group.add(col);
        }
      }

      // Toit pyramidal à 24 degrés
      const roof = new Mesh(new ConeGeometry(1.9, 0.9, 4), marbleMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(0, 1.75, -3.8);
      group.add(roof);

      // Quadrige d'or au sommet
      const chariot = new Mesh(new BoxGeometry(0.5, 0.3, 0.4), goldMat);
      chariot.position.set(0, 2.3, -3.8);
      group.add(chariot);
      break;
    }

    case 'mrv-statue-de-zeus-a-olympie': {
      // Temple péristyle
      const base = new Mesh(new BoxGeometry(3.6, 0.3, 4.4), stoneMat);
      base.position.set(0, -0.65, -4.0);
      group.add(base);

      for (let ix = -1.4; ix <= 1.4; ix += 0.9) {
        for (let iz = -1.6; iz <= 1.6; iz += 0.8) {
          const col = new Mesh(new CylinderGeometry(0.1, 0.1, 1.8, 12), marbleMat);
          col.position.set(ix, 0.35, -4.0 + iz);
          group.add(col);
        }
      }

      // Trône d'or de Zeus au centre
      const throne = new Mesh(new BoxGeometry(0.9, 1.4, 0.8), goldMat);
      throne.position.set(0, 0.4, -4.0);
      group.add(throne);

      const zeus = new Mesh(new SphereGeometry(0.28, 16, 16), marbleMat);
      zeus.position.set(0, 1.35, -3.9);
      group.add(zeus);
      break;
    }

    default: {
      // Temple classique d'Artémis (Éphèse)
      const base = new Mesh(new BoxGeometry(3.6, 0.3, 4.4), stoneMat);
      base.position.set(0, -0.65, -4.0);
      group.add(base);

      const colsX = 4, colsZ = 6;
      for (let ix = 0; ix < colsX; ix++) {
        for (let iz = 0; iz < colsZ; iz++) {
          if (ix > 0 && ix < colsX - 1 && iz > 0 && iz < colsZ - 1) continue;
          const col = new Mesh(new CylinderGeometry(0.1, 0.1, 1.8, 12), marbleMat);
          col.position.set(-1.4 + (ix / (colsX - 1)) * 2.8, 0.35, -2.4 - iz * 0.6);
          group.add(col);
        }
      }

      const roof = new Mesh(new BoxGeometry(3.4, 0.22, 4.2), marbleMat);
      roof.position.set(0, 1.35, -3.9);
      group.add(roof);

      const pediment = new Mesh(new ConeGeometry(1.9, 0.65, 4), marbleMat);
      pediment.rotation.y = Math.PI / 4;
      pediment.scale.set(1, 1, 0.3);
      pediment.position.set(0, 1.75, -2.1);
      group.add(pediment);
      break;
    }
  }

  return group;
}

// ───────────────────────────────────────────── 2. LE MONDE : relief, sol, eau, crête, végétation → wonderEnv.ts ; ici le ciel

/** Ciel analytique : dégradé, soleil (disque + halo), étoiles et aurore pour les nuits ; brume sous l'horizon. */
function skyNode(atm: WonderAtmosphere): N {
  const d = positionWorldDirection;
  const h = d.y;
  let bg: N = mix(color(atm.horizon), color(atm.top), smoothstep(0.0, 0.32, h));
  const sunDir = normalize(vec3(-0.45, atm.sunY, -0.8));
  const c = max(d.dot(sunDir), 0);
  bg = bg.add(color(atm.sun).mul(pow(c, 260).mul(3.5).add(pow(c, 12).mul(0.3))));
  if (atm.stars) {
    const curtain = mx_fractal_noise_float(vec3(d.x.mul(3), time.mul(0.04), d.z.mul(3)), 3).mul(0.5).add(0.5);
    const band = smoothstep(0.05, 0.35, h).mul(smoothstep(0.75, 0.3, h));
    bg = bg.add(color(atm.accent).mul(curtain.pow(2.5).mul(band).mul(0.7)));
    const st = smoothstep(0.996, 1.0, hash(floor(d.xy.mul(850)).dot(vec2(1, 157)))).mul(smoothstep(0.0, 0.2, h)).mul(0.9);
    bg = bg.add(vec3(st));
  }
  // sous l'horizon : couleur du brouillard (filet de sécurité — normalement la crête et le sol couvrent tout)
  const haze: N = smoothstep(0.06, -0.04, h as unknown as N);
  return mix(bg, color(atm.fog), haze);
}

function buildClouds(atm: WonderAtmosphere): Sprite {
  const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const ci = instanceIndex;
  const c1 = hash(ci), c2 = hash(ci.add(31)), c3 = hash(ci.add(67));
  // nuages tout autour (anneau, entre la caméra et la crête) : la carte peut tourner
  const ang = c1.mul(6.2832).add(time.mul(0.006));
  const rad = c3.mul(18).add(14);
  mat.positionNode = vec3(sin(ang).mul(rad), c2.mul(5).add(3.5), sin(ang.add(1.5708)).mul(rad));
  const soft = smoothstep(0.5, 0.0, length(uv().sub(0.5).mul(vec2(1, 2.4))));
  mat.colorNode = vec4(mix(color(atm.fog), color('#ffffff'), 0.35), soft.mul(0.2));
  mat.scaleNode = vec2(c3.mul(6).add(4), c3.mul(1.6).add(1));
  const s = new Sprite(mat);
  s.count = 40;
  s.frustumCulled = false;
  return s;
}

function buildBirds(): Sprite {
  const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const bi = instanceIndex;
  const b1 = hash(bi.add(500)), b2 = hash(bi.add(900));
  const ang = time.mul(b1.mul(0.3).add(0.25)).add(b2.mul(6.28));
  mat.positionNode = vec3(sin(ang).mul(b1.mul(0.8).add(0.6)).add(0.3), b2.mul(0.5).add(1.4), sin(ang.add(1.57)).mul(0.6).sub(3.4));
  const bu = uv().sub(0.5);
  const flap = sin(time.mul(9).add(b2.mul(20))).mul(0.18);
  const vshape = smoothstep(0.06, 0.0, abs(bu.y.sub(abs(bu.x).mul(0.6).add(flap.mul(abs(bu.x).mul(2)))))).mul(smoothstep(0.5, 0.3, abs(bu.x)));
  mat.colorNode = vec4(color('#141214'), vshape);
  mat.scaleNode = float(0.09);
  const s = new Sprite(mat);
  s.count = 7;
  s.frustumCulled = false;
  return s;
}

// ───────────────────────────────────────────── 3. L'INSTANCE : carte + diorama
export interface WonderVisualInstance {
  cardMesh: Mesh;
  dioramaRoot: Group;
  /** profondeur du monde derrière la vitre (1 = normale) */
  setDepth: (depth: number) => void;
  update: (dt: number, t: number) => void;
  dispose: () => void;
}

/** Échelle du monde (repère diorama → carte). */
const WORLD_SCALE = 0.15;
/** Emplacement des modèles 3D (centre de la base) en repère diorama : même place que les monuments procéduraux. */
const MONUMENT_POS = new Vector3(0, Y0 - 0.02, -3.8);
/** Fenêtre d'illustration en repère carte : centre (pivot du « gimbal ») et bas (le sol y est posé). */
const WIN_CY = (WINDOW_UV.cy - 0.5) * CARD.h;
const WIN_BOTTOM = (WINDOW_UV.cy - WINDOW_UV.hy - 0.5) * CARD.h;
/** Hauteur minimale de l'œil au-dessus du sol (repère carte). */
const EYE_MARGIN = 0.05;
/**
 * Plage d'élévation de l'œil (vers le centre de la fenêtre, dans le plan vertical de la carte), en radians.
 * Zone linéaire [−1°, +4°] : le monde est rigidement solidaire de la carte, parallaxe exacte. Au-delà, compression douce
 * (tanh) vers [−4°, +9°] : on ne regarde jamais par en dessous, ni à la verticale — l'horizon reste toujours à portée.
 */
const DEG = Math.PI / 180;
const ELEV = { lo: -4 * DEG, loLin: -1 * DEG, hiLin: 4 * DEG, hi: 9 * DEG };
function softElevation(a: number): number {
  if (a > ELEV.hiLin) return ELEV.hiLin + (ELEV.hi - ELEV.hiLin) * Math.tanh((a - ELEV.hiLin) / (ELEV.hi - ELEV.hiLin));
  if (a < ELEV.loLin) return ELEV.loLin - (ELEV.loLin - ELEV.lo) * Math.tanh((ELEV.loLin - a) / (ELEV.loLin - ELEV.lo));
  return a;
}

export function createWonderCardInstance(
  cardId: string,
  art: CardArt,
  backMaterial: Material,
  edgeMaterial: Material,
  cardGeometry: ReturnType<typeof import('./cardModel').createCardGeometry>,
  camera: Camera,
  quality: 'high' | 'mobile',
  depthScale = 1.15,
  /** si fourni : la passe portail est limitée (scissor) au rectangle écran de la carte */
  renderer?: { getDrawingBufferSize(v: Vector2): Vector2 },
): WonderVisualInstance {
  const atm = getWonderAtmosphere(cardId);
  const kit = createMatKit(atm);

  // 1. Le monde
  const dioScene = new Scene();
  const dioRoot = new Group();
  dioRoot.matrixAutoUpdate = false;
  dioScene.add(dioRoot);
  dioScene.backgroundNode = skyNode(atm);
  const fogNear = uniform(1);
  const fogFar = uniform(10);
  dioScene.fogNode = fog(color(atm.fog), rangeFogFactor(fogNear, fogFar));
  dioScene.add(new HemisphereLight(new Color(atm.horizon), new Color(atm.ground), 0.9));
  const sun = new DirectionalLight(new Color(atm.sun), atm.light);
  sun.position.set(-3, 2 + atm.sunY * 5, -6);
  // lumière de face (côté vitre) : le soleil est derrière le monument, sans elle les façades sont noires
  const fill = new DirectionalLight(new Color(atm.sun), atm.light * 0.55);
  fill.position.set(2.5, 3, 5);
  dioRoot.add(sun, sun.target, fill, fill.target);

  // le monument seul est coupé au plan de la vitre (rien ne dépasse devant le verre) ; le sol, lui, continue « sous le cadre »
  const glassPlane = new Plane(new Vector3(0, 0, -1), 0);
  const clip = new ClippingGroup();
  clip.clippingPlanes = [glassPlane];
  // monument : modèle 3D réel s'il est déjà chargé (préchargé par le viewer / l'expérience), sinon le procédural en
  // attendant — remplacé dès que le modèle arrive
  let disposed = false;
  const placeModel = (g: Group) => {
    const inst = g.clone(true);
    inst.position.add(MONUMENT_POS);
    return inst;
  };
  const ready = wonderModelIfReady(cardId);
  let monument: Group = ready ? placeModel(ready) : buildMonumentMesh(cardId, atm, kit);
  clip.add(monument);
  if (!ready && hasWonderModel(cardId)) {
    void preloadModel(cardId).then((g) => {
      if (!g || disposed) return;
      clip.remove(monument);
      // (audit 12/11, A10-08) le monument procédural remplacé sort du groupe : `dispose` ne le parcourra plus, ses
      // géométries sont donc libérées ici (ses matériaux viennent du kit, libéré à la fin)
      monument.traverse((c) => c instanceof Mesh && c.geometry?.dispose?.());
      monument = placeModel(g);
      clip.add(monument);
    });
  }
  const envi = buildEnvironment(cardId, atm, quality);
  dioRoot.add(clip, envi.group, buildClouds(atm), buildBirds());
  dioRoot.traverse((o) => (o.frustumCulled = false));

  // 2. Portail dans la fenêtre (vitre clearcoat, ombre intérieure du cadre)
  // téléphone : échantillons MSAA résolus sur la puce puis jetés (couleur ET profondeur) au lieu d'être écrits en mémoire
  // à chaque image — l'anticrénelage du monument est conservé (rien ne relit ces cibles)
  const portalPass = pass(
    dioScene,
    camera,
    quality === 'mobile' ? { storeMultisampledColorBuffer: false, storeMultisampledDepthBuffer: false, storeMultisampledStencilBuffer: false, resolveDepthBuffer: false, resolveStencilBuffer: false } : undefined,
  );
  if (quality === 'mobile') portalPass.setResolutionScale(0.8);
  const portal = portalPass.context({ getUV: () => screenUV }) as unknown as N;
  const fr = texture(art.frame);
  const win = fr.a.oneMinus();
  const sd = windowSDF(uv());
  const innerShadow = mix(float(0.32), float(1), smoothstep(0.0, 0.035, sd.negate()));

  const frontMat = new MeshPhysicalNodeMaterial();
  frontMat.colorNode = fr.rgb.mul(fr.a);
  frontMat.emissiveNode = portal.rgb.mul(win).mul(innerShadow);
  frontMat.roughnessNode = mix(float(0.55), float(0.02), win);
  frontMat.metalnessNode = float(0);
  frontMat.clearcoatNode = win;
  frontMat.clearcoatRoughnessNode = float(0.02);

  const cardMesh = new Mesh(cardGeometry, [frontMat, backMaterial, edgeMaterial]);
  // pipelines du monde (sol, crête, ciel, monument) compilés tout de suite pour la vraie cible de la passe portail, en
  // tâche de fond, au lieu de la 1re image du diorama
  // (audit 12/11, S08 / E4-01) WebGPU : compilation dans la VRAIE configuration de la passe portail (3e argument).
  // Sans lui, three compilait une « variante canvas » : des pipelines jamais utilisés, et sa cible interne plein écran
  // (demi-flottant ×4, 79 à 178 Mo sur téléphone) allouée pour toujours à la 1re Merveille / au 1er skin CS.
  if (renderer && 'compileAsync' in renderer) void compilePassAsync(renderer as never, portalPass, isWebGPURenderer(renderer));

  let depth = depthScale;
  const M = new Matrix4();
  const camL = new Vector3();
  const tmp = new Vector3();
  const cardPos = new Vector3();
  const cardZ = new Vector3();
  const buf = new Vector2();
  const CORNERS = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => new Vector3((sx * CARD.w) / 2, (sy * CARD.h) / 2, 0)));

  const update = (_dt: number, _t: number) => {
    cardMesh.updateMatrixWorld();
    camera.updateMatrixWorld();

    // a) « gimbal » de l'horizon : la caméra, exprimée dans le repère de la carte, doit rester au-dessus du sol.
    //    Tant que c'est le cas le monde est rigidement solidaire de la carte (parallaxe exacte) ; au-delà, on pivote le monde
    //    autour du centre de la fenêtre juste ce qu'il faut (rotation X minimale). Inclinaison latérale : rien à faire.
    camL.setFromMatrixPosition(camera.matrixWorld);
    M.copy(cardMesh.matrixWorld).invert();
    camL.applyMatrix4(M);
    const vy = camL.y - WIN_CY, vz = camL.z;
    const r = Math.hypot(vy, vz);
    let phi = 0;
    if (r > 1e-5) {
      // Rx(−φ) appliquée à l'œil ajoute exactement φ à son élévation α (plan yz) → φ = f(α) − α
      const alpha = Math.atan2(vy, vz);
      // garde-fou sol : l'œil reste au moins EYE_MARGIN au-dessus du sol posé au bas de la fenêtre
      const groundMin = Math.asin(Math.max(-1, Math.min(1, (WIN_BOTTOM + EYE_MARGIN - WIN_CY) / r)));
      phi = Math.max(groundMin, softElevation(alpha)) - alpha;
      // carte vue par la tranche latérale (gros lacet) : l'œil sort du plan yz, α n'a plus de sens → on relâche en douceur
      const inPlane = r / Math.max(1e-6, Math.hypot(camL.x, vy, vz));
      phi *= Math.min(1, Math.max(0, (inPlane - 0.25) / 0.3));
    }

    // b) matrice du diorama : carte · pivot · Rx(φ) · sol posé au bas de la fenêtre · échelle
    dioRoot.matrix
      .copy(cardMesh.matrixWorld)
      .multiply(M.makeTranslation(0, WIN_CY, 0))
      .multiply(M.makeRotationX(phi))
      .multiply(M.makeTranslation(0, WIN_BOTTOM - WIN_CY - Y0 * WORLD_SCALE, 0))
      .multiply(M.makeScale(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE * depth));
    dioRoot.matrixWorldNeedsUpdate = true;
    dioRoot.updateMatrixWorld(true);

    // c) plan de la vitre en espace monde (normale vers l'intérieur du monde)
    cardPos.setFromMatrixPosition(cardMesh.matrixWorld);
    cardZ.setFromMatrixColumn(cardMesh.matrixWorld, 2).normalize().negate();
    glassPlane.setFromNormalAndCoplanarPoint(cardZ, cardPos);

    // d) brouillard en unités monde : net jusqu'au monument, saturé bien avant la crête
    const ws = tmp.setFromMatrixColumn(dioRoot.matrixWorld, 0).length();
    const dCam = camera.position.distanceTo(cardPos);
    fogNear.value = dCam + 9 * ws;
    fogFar.value = dCam + 36 * ws;

    // e) perf : la passe portail ne rend que le rectangle écran de la carte (scissor) au lieu de tout l'écran
    if (renderer) {
      renderer.getDrawingBufferSize(buf);
      let x0 = 1, y0 = 1, x1 = -1, y1 = -1;
      for (const c of CORNERS) {
        tmp.copy(c).applyMatrix4(cardMesh.matrixWorld).project(camera);
        x0 = Math.min(x0, tmp.x); x1 = Math.max(x1, tmp.x);
        y0 = Math.min(y0, tmp.y); y1 = Math.max(y1, tmp.y);
      }
      const px = (v: number, s: number) => Math.min(s, Math.max(0, ((v + 1) / 2) * s));
      const X0 = Math.floor(px(x0, buf.x)) - 2, X1 = Math.ceil(px(x1, buf.x)) + 2;
      const Ytop = Math.floor(buf.y - px(y1, buf.y)) - 2, Ybot = Math.ceil(buf.y - px(y0, buf.y)) + 2; // origine en haut
      portalPass.setScissor(Math.max(0, X0), Math.max(0, Ytop), Math.max(1, X1 - X0), Math.max(1, Ybot - Ytop));
    }
  };

  const setDepth = (d: number) => {
    depth = d;
  };

  const dispose = () => {
    disposed = true;
    envi.dispose();
    portalPass.dispose();
    frontMat.dispose();
    for (const m of kit.all) m.dispose();
    dioRoot.traverse((c) => {
      if (c.userData.sharedModel) return; // modèle 3D partagé entre instances (cache)
      if (c instanceof Mesh || c instanceof Sprite) {
        // (audit 12/11, A10-09) la géométrie des sprites est partagée par three : la libérer forçait son renvoi au GPU
        if (c instanceof Mesh) c.geometry?.dispose?.();
        (c.material as Material)?.dispose?.();
      }
    });
  };

  return { cardMesh, dioramaRoot: dioRoot, setDepth, update, dispose };
}
