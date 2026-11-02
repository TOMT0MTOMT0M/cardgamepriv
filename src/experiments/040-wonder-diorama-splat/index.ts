import { DirectionalLight, Group } from 'three/webgpu';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { cardArtFor, ensureCardImages } from '../../core/art';
import { cardById } from '../../core/cardData';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardGeometry } from '../../core/cardModel';
import { createWonderCardInstance, preloadWonderModel, type WonderVisualInstance } from '../../core/wonderDiorama';

const WONDERS = [
  { id: 'mrv-grande-pyramide-de-kheops', label: '1. Pyramide de Khéops' },
  { id: 'mrv-jardins-suspendus-de-babylone', label: '2. Jardins de Babylone' },
  { id: 'mrv-statue-de-zeus-a-olympie', label: '3. Statue de Zeus' },
  { id: 'mrv-temple-d-artemis-a-ephese', label: '4. Temple d’Artémis' },
  { id: 'mrv-mausolee-d-halicarnasse', label: '5. Mausolée d’Halicarnasse' },
  { id: 'mrv-colosse-de-rhodes', label: '6. Colosse de Rhodes' },
  { id: 'mrv-phare-d-alexandrie', label: '7. Phare d’Alexandrie' },
  { id: 'mrv-grande-muraille-de-chine', label: '8. Grande Muraille de Chine' },
  { id: 'mrv-petra-khazneh', label: '9. Pétra (Khazneh)' },
  { id: 'mrv-christ-redempteur-rio', label: '10. Christ Rédempteur' },
  { id: 'mrv-machu-picchu', label: '11. Machu Picchu' },
  { id: 'mrv-chichen-itza', label: '12. Chichén Itzá' },
  { id: 'mrv-colisee-de-rome', label: '13. Colisée de Rome' },
  { id: 'mrv-taj-mahal', label: '14. Taj Mahal' },
];

/**
 * 040 — Les 14 Merveilles du Monde : diorama-fenêtre (010), monde sans bord (voir core/wonderDiorama).
 * Deep-link de test : `?wonder=<id|num>`.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  let wonder: WonderVisualInstance | null = null;
  let geo: ReturnType<typeof createCardGeometry>;

  const q = new URLSearchParams(location.search);
  const qw = q.get('wonder');
  const fromQuery = qw ? WONDERS.find((w) => w.id === qw || w.id === `mrv-${qw}` || w.label.startsWith(`${qw}.`))?.id : undefined;

  const params = {
    merveille: fromQuery ?? WONDERS[0].id,
    depth: 1.15,
    spin: true,
  };

  async function loadWonder(cardId: string) {
    if (wonder) {
      rig.remove(wonder.cardMesh);
      wonder.dispose();
      wonder = null;
    }
    const cd = cardById(cardId);
    await Promise.all([ensureCardImages([cd]), preloadWonderModel(cardId)]);
    const { art, back } = await cardArtFor(cd, 'secret', ctx.bag);
    wonder = createWonderCardInstance(cardId, art, createBackMaterial(back), createEdgeMaterial('#ffd27a', '#2a1a12'), geo, stage.camera, ctx.quality, params.depth, ctx.renderer);
    rig.add(wonder.cardMesh);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#1c1714', '#090807'], env: 'studio', fill: 0.65 });
      const key = new DirectionalLight(0xfff3e4, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);

      geo = createCardGeometry();
      c.bag.add(geo);

      await loadWonder(params.merveille);
      await stage.compile();

      const wonderOptions = Object.fromEntries(WONDERS.map((w) => [w.label, w.id]));
      c.gui
        .add(params, 'merveille', wonderOptions)
        .name('Merveille')
        .onChange(async (v: string) => {
          c.sfx.whoosh(0.3, 0.1, true);
          c.sfx.chime(5, 0.1);
          await loadWonder(v);
        });
      c.gui
        .add(params, 'depth', 0.5, 2.5, 0.05)
        .name('Profondeur du monde')
        .onChange((d: number) => wonder?.setDepth(d));
      c.gui.add(params, 'spin').name('Rotation idle');
    },
    update(dt, t) {
      if (!wonder) return;
      const card = wonder.cardMesh;
      applyPose(card, ctx, 0.5);
      const idle = ctx.input.inside || ctx.input.gyroEnabled || !params.spin ? 0 : 1;
      card.rotation.y += Math.sin(t * 0.5) * 0.18 * idle;
      card.rotation.x += Math.sin(t * 0.37) * 0.06 * idle;
      wonder.update(dt, t);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {
      wonder?.dispose();
      wonder = null;
    },
  };
}
