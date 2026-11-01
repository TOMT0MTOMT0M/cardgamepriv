import { Color, PerspectiveCamera, Scene, type Object3D } from 'three/webgpu';
import { color, float, mix, rand, screenCoordinate, screenSize, screenUV, smoothstep, time, vec2 } from 'three/tsl';
import type { LabContext } from './Experiment';
import { CARD } from './cardModel';
import { studioEnv, type EnvKind } from './env';
import { createCardMesh } from './cardModel';
import { createBackMaterial, createEdgeMaterial, createFrontMaterial, type LayerDepths } from './cardMaterial';
import type { CardArt, BackArt } from './art';

export interface StageOptions {
  fov?: number;
  /** part de la hauteur d'écran occupée par la carte (paysage) */
  fill?: number;
  /** part de la largeur d'écran occupée par la carte (portrait) */
  fillPortrait?: number;
  bg?: [string, string];
  env?: EnvKind | null;
  envIntensity?: number;
  /** hauteur/largeur de l'objet à cadrer (défaut : la carte) */
  frameW?: number;
  frameH?: number;
}

/** Fond : dégradé radial sobre + vignette + grain anti-banding. */
export function backdropNode(inner: string, outer: string, grain = 0.018) {
  const p = screenUV.sub(0.5).mul(vec2(screenSize.x.div(screenSize.y), 1));
  const d = p.length();
  const c = mix(color(new Color(inner)), color(new Color(outer)), smoothstep(float(0.05), float(0.95), d));
  const n = rand(screenCoordinate.xy.add(time.mul(37.0).fract().mul(100))).sub(0.5).mul(grain);
  return c.add(n);
}

export function createStage(ctx: LabContext, o: StageOptions = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(o.fov ?? 30, ctx.width / ctx.height, 0.05, 60);
  const bg = o.bg ?? ['#2a2724', '#0e0d0c'];
  scene.backgroundNode = backdropNode(bg[0], bg[1]);
  if (o.env !== null) {
    scene.environment = studioEnv(ctx.renderer, o.env ?? 'studio');
    scene.environmentIntensity = o.envIntensity ?? 1;
  }
  const fw = o.frameW ?? CARD.w;
  const fh = o.frameH ?? CARD.h;
  const fit = (w: number, h: number) => {
    camera.aspect = w / h;
    const t = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const dH = fh / (o.fill ?? 0.72) / (2 * t);
    const dW = fw / (o.fillPortrait ?? 0.78) / (2 * t * camera.aspect);
    camera.position.set(0, 0, Math.max(dH, dW));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  fit(ctx.width, ctx.height);
  ctx.bag.scene(scene);
  return { scene, camera, fit };
}

/** Carte standard complète (face calquée + dos + tranche). */
export function createStandardCard(art: CardArt, back: BackArt, depths?: LayerDepths) {
  const front = createFrontMaterial(art, depths);
  const mesh = createCardMesh(front.material, createBackMaterial(back), createEdgeMaterial());
  return { mesh, layers: front.layers, front: front.material };
}

/** Applique la pose (tilt + drag) d'Input à un objet. */
export function applyPose(obj: Object3D, ctx: LabContext, maxTilt = 0.32) {
  const p = ctx.input.pose(maxTilt);
  obj.rotation.set(p.x, p.y, 0);
}
