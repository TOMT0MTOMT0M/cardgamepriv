import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { color, float, mix, normalize, positionLocal, smoothstep } from 'three/tsl';

export type EnvKind = 'studio' | 'warm' | 'night' | 'gallery';

interface Box {
  pos: [number, number, number];
  size: [number, number];
  color: string;
  intensity: number;
  lookAt?: [number, number, number];
}

const PRESETS: Record<EnvKind, { top: string; bottom: string; boxes: Box[] }> = {
  // Softbox principale haute-gauche + bande de contre-jour : les reflets "balayent" la carte au tilt.
  studio: {
    top: '#1b1a19',
    bottom: '#0b0a09',
    boxes: [
      { pos: [-3.2, 3.6, 2.6], size: [3.4, 1.6], color: '#fff6ea', intensity: 6 },
      { pos: [3.6, 0.6, 1.5], size: [0.5, 4.5], color: '#e9f0ff', intensity: 4 },
      { pos: [0, -2.4, 3.2], size: [5, 0.8], color: '#ffe3c2', intensity: 0.9 },
      { pos: [1.2, 3.8, -3], size: [2.2, 0.4], color: '#ffffff', intensity: 3 },
      // grand réflecteur frontal (derrière la caméra) : les foils vus de face restent lisibles
      { pos: [0.4, 0.6, 5.2], size: [4.2, 2.6], color: '#fff8f0', intensity: 0.75 },
    ],
  },
  warm: {
    top: '#24170f',
    bottom: '#0a0605',
    boxes: [
      { pos: [-2.6, 2.6, 3.2], size: [2.4, 2.4], color: '#ffc58a', intensity: 6 },
      { pos: [3.4, 1.2, 0.4], size: [0.4, 4], color: '#ffe9cc', intensity: 3 },
      { pos: [0, -3, 2], size: [4, 1], color: '#ff9a5a', intensity: 0.6 },
      { pos: [0.3, 0.4, 5.2], size: [4, 2.6], color: '#ffe8d0', intensity: 0.6 },
    ],
  },
  night: {
    top: '#0d1016',
    bottom: '#050506',
    boxes: [
      { pos: [-3.4, 2.4, 2], size: [0.6, 4.4], color: '#cfdcff', intensity: 4 },
      { pos: [3, 3, 2.4], size: [1.6, 1.6], color: '#ffe6c4', intensity: 2.2 },
    ],
  },
  gallery: {
    top: '#2a2724',
    bottom: '#121110',
    boxes: [
      { pos: [0, 4.2, 1.5], size: [6, 1.2], color: '#ffffff', intensity: 5 },
      { pos: [-4, 1, 1], size: [0.4, 3], color: '#fff2e0', intensity: 2.5 },
      { pos: [4, 1, 1], size: [0.4, 3], color: '#fff2e0', intensity: 2.5 },
    ],
  },
};

const cache = new WeakMap<WebGPURenderer, Map<EnvKind, Texture>>();

/**
 * Environnement studio procédural (softboxes émissives → PMREM).
 * Partagé et mis en cache pour toute la session (non libéré entre expériences).
 */
export function studioEnv(renderer: WebGPURenderer, kind: EnvKind = 'studio'): Texture {
  let m = cache.get(renderer);
  if (!m) cache.set(renderer, (m = new Map()));
  const hit = m.get(kind);
  if (hit) return hit;

  const p = PRESETS[kind];
  const scene = new Scene();
  const roomMat = new MeshBasicNodeMaterial({ side: BackSide });
  const dirY = normalize(positionLocal).y;
  roomMat.colorNode = mix(color(new Color(p.bottom)), color(new Color(p.top)), smoothstep(float(-0.6), float(0.8), dirY));
  const room = new Mesh(new BoxGeometry(12, 12, 12), roomMat);
  scene.add(room);
  for (const b of p.boxes) {
    const mat = new MeshBasicNodeMaterial({ side: 2 });
    mat.colorNode = color(new Color(b.color).multiplyScalar(b.intensity));
    const box = new Mesh(new PlaneGeometry(b.size[0], b.size[1]), mat);
    box.position.set(...b.pos);
    box.lookAt(0, 0, 0);
    scene.add(box);
  }
  const gen = new PMREMGenerator(renderer);
  const rt = gen.fromScene(scene, 0.02);
  gen.dispose();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicNodeMaterial).dispose();
    }
  });
  m.set(kind, rt.texture);
  return rt.texture;
}
