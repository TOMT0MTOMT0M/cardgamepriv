/**
 * (retours live 04) CAPTURES STATIQUES DES 14 MERVEILLES — outil, pas dans le jeu.
 * Rend chaque carte Merveille avec son vrai design 3D (cadre + diorama derrière la vitre, comme la vue détail) face
 * caméra, et en fait une image : la miniature de la Collection (src/game/cardImages.ts). La vue détail garde la 3D
 * interactive. À relancer si le design 3D d'une Merveille change :
 *   npx vite   →   http://localhost:5173/outils/capture-merveilles.html   (?webgl pour forcer WebGL2)
 * Chaque image se télécharge (<slug>.webp) : les poser dans public/art/merveilles/cartes3d/, puis mettre en ligne.
 * `window.__captures` donne aussi les data URL (automatisation).
 */
import '../src/core/fonts';
import { applyFontVars } from '../src/core/fonts';
import { installCatalog } from '../src/core/sets/themes';
import { NeutralToneMapping, PerspectiveCamera, SRGBColorSpace, Scene, WebGPURenderer } from 'three/webgpu';
import { CARD, createCardGeometry } from '../src/core/cardModel';
import { ensureCardImages, ensureFonts } from '../src/core/art';
import { cardById } from '../src/core/cardData';
import { catalogEntry } from '../src/core/sets/themes';
import { buildEdge, gameCardArt, themedBacks } from '../src/game/scenes/cardFace';
import { studioEnv } from '../src/core/env';
import type { RarityId } from '../src/core/rarity';

const params = new URLSearchParams(location.search);
const WIDTH = Number(params.get('w') ?? 512);
const HEIGHT = Math.round((WIDTH * CARD.h) / CARD.w);
const log = document.getElementById('log')!;
const out = document.getElementById('out')!;
const say = (s: string) => ((log.textContent = s), console.log('[captures]', s));

async function main() {
  applyFontVars();
  installCatalog(await import('../src/core/sets/catalogBig'));
  const [W] = await Promise.all([import('../src/core/wonderDiorama'), import('../src/core/wonderModels')]);
  const ids = Object.keys(W.WONDER_ATMOSPHERES).filter((id) => !params.get('only') || id.includes(params.get('only')!));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: params.has('webgl'), preserveDrawingBuffer: true } as never);
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  say(`rendu : ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2'} · ${WIDTH}×${HEIGHT}`);

  const bag = { add: <T extends { dispose(): void }>(o: T) => o };
  const backs = themedBacks(bag, 1);
  const geo = createCardGeometry();
  // caméra : la carte remplit exactement l'image, vue de face (comme posée devant soi dans la vue détail)
  const camera = new PerspectiveCamera(18, CARD.w / CARD.h, 0.05, 80);
  camera.position.set(0, 0, (CARD.h / 2 / Math.tan((9 * Math.PI) / 180)) * 1.004);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  await ensureFonts();
  const shots: Record<string, string> = {};
  (window as unknown as { __captures: typeof shots }).__captures = shots;

  for (const id of ids) {
    say(`${id}…`);
    await W.preloadWonderModel(id).catch(() => undefined);
    const cd = cardById(id);
    await ensureCardImages([cd]);
    const rar = (catalogEntry(id)?.rarity ?? 'mythic') as RarityId;
    const art = gameCardArt(cd, rar, 1);
    const { edge } = buildEdge('#ffd27a');
    const scene = new Scene();
    scene.environment = studioEnv(renderer, 'studio');
    const inst = W.createWonderCardInstance(id, art, backs.forCard(id), edge, geo, camera, 'high', 1.15);
    scene.add(inst.cardMesh);
    // quelques images : textures envoyées, modèle 3D en place, nuages posés
    for (let k = 0; k < 4; k++) {
      inst.update(1 / 60, k / 60);
      await renderer.renderAsync(scene, camera);
      await new Promise((r) => setTimeout(r, 60));
    }
    const url = canvas.toDataURL('image/webp', 0.9);
    shots[id] = url;
    const img = new Image();
    img.src = url;
    img.title = id;
    out.append(img);
    if (!params.has('nodl')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id.replace(/^mrv-/, '')}.webp`;
      a.click();
    }
    inst.dispose();
    art.dispose();
    edge.dispose();
  }
  say(`terminé : ${Object.keys(shots).length} captures`);
  (window as unknown as { __done: boolean }).__done = true;
}
main().catch((e) => {
  say(`échec : ${(e as Error).message}`);
  console.error(e);
});
