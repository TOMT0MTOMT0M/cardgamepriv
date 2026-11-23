import { DirectionalLight, Group, type Mesh } from 'three/webgpu';
import type { Experiment, LabContext } from '../../core/Experiment';
import { applyPose, createStage } from '../../core/stage';
import { createPackMesh, PACK, type PackArt } from '../../core/pack';
import { CARTOON_DESIGNS, CARTOON_THEMES, cartoonPackArt, cartoonPackFront, type CartoonDesign, type CartoonTheme } from '../../core/packCartoon';

/**
 * 046 — SACHETS CARTOON PAR THÈME (23/11, retours Tom) : un logo par thème + la mention « Bébou Cartes », trois
 * pistes (autocollant, case de BD, écusson) à comparer avant d'en brancher une sur le jeu.
 *  - au centre, le vrai sachet 3D (même maillage et même aluminium que le jeu), le visuel imprimé dessus ;
 * *  - la PLANCHE (en haut) : les 6 thèmes de la piste choisie côte à côte ; toucher une vignette la met au centre.
 * `?piste=bd&theme=tele` pour arriver directement sur un sachet.
 */
const THEMES = Object.keys(CARTOON_THEMES) as CartoonTheme[];

export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  let mesh: Mesh | null = null;
  let art: PackArt | null = null;
  let token = 0;
  const qs = new URLSearchParams(location.search);
  const params = {
    piste: (CARTOON_DESIGNS.some((d) => d.id === qs.get('piste')) ? qs.get('piste') : 'sticker') as CartoonDesign,
    theme: (THEMES.includes(qs.get('theme') as CartoonTheme) ? qs.get('theme') : 'sport') as CartoonTheme,
    planche: true,
  };
  let board: HTMLElement;

  async function showPack() {
    const my = ++token;
    const a = await cartoonPackArt(params.piste, params.theme);
    if (my !== token) return void a.dispose();
    if (mesh) {
      rig.remove(mesh);
      (mesh.material as Array<{ dispose(): void }>).forEach((m) => m.dispose());
    }
    art?.dispose();
    art = a;
    mesh = createPackMesh(a);
    rig.add(mesh);
  }

  async function drawBoard() {
    if (!board) return;
    board.hidden = !params.planche;
    if (!params.planche) return;
    const my = token;
    const fronts = await Promise.all(THEMES.map((t) => cartoonPackFront(params.piste, t)));
    if (my !== token) return;
    board.replaceChildren(
      ...fronts.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sc46-t${THEMES[i] === params.theme ? ' on' : ''}`;
        b.title = CARTOON_THEMES[THEMES[i]].name;
        // (une image, pas la toile : le CSS du labo place toutes les <canvas> en plein écran)
        const img = new Image();
        img.src = c.toDataURL('image/jpeg', 0.85);
        img.alt = CARTOON_THEMES[THEMES[i]].name;
        b.append(img);
        b.addEventListener('click', () => {
          params.theme = THEMES[i];
          ctx.gui.controllersRecursive().forEach((k) => k.updateDisplay());
          void refresh();
        });
        return b;
      }),
    );
  }

  async function refresh() {
    await showPack();
    await drawBoard();
  }

  return {
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#2b2a33', '#0c0b10'], env: 'studio', frameW: PACK.w, frameH: PACK.h, fill: 0.62, fillPortrait: 0.55 });
      const key = new DirectionalLight(0xffffff, 1.4);
      key.position.set(-1.2, 2.2, 3);
      stage.scene.add(key, rig);
      const style = document.createElement('style');
      style.textContent = `.sc46 { position: absolute; left: 0; right: 0; top: 64px; display: flex; justify-content: center; gap: 8px; padding: 0 10px; pointer-events: auto; overflow-x: auto; }
        .sc46-t { flex: none; width: 70px; padding: 0; border: 2px solid transparent; border-radius: 8px; background: none; cursor: pointer; transition: transform .2s, border-color .2s; }
        .sc46-t img { display: block; width: 100%; height: auto; border-radius: 6px; }
        .sc46-t.on { border-color: #fff; transform: translateY(-6px); }
        @media (min-width: 700px) { .sc46-t { width: 96px; } }`;
      board = document.createElement('div');
      board.className = 'sc46';
      c.overlay.append(style, board);
      await refresh();
      await stage.compile();
      c.gui.add(params, 'piste', Object.fromEntries(CARTOON_DESIGNS.map((d) => [d.label, d.id]))).name('piste').onChange(() => void refresh());
      c.gui.add(params, 'theme', Object.fromEntries(THEMES.map((t) => [CARTOON_THEMES[t].name, t]))).name('thème').onChange(() => void refresh());
      c.gui.add(params, 'planche').name('planche des 6 thèmes').onChange(() => void drawBoard());
      c.bag.fn(c.input.onTap(() => {
        params.theme = THEMES[(THEMES.indexOf(params.theme) + 1) % THEMES.length];
        c.gui.controllersRecursive().forEach((k) => k.updateDisplay());
        void refresh();
      }));
      c.bag.fn(() => {
        token++;
        art?.dispose();
        if (mesh) (mesh.material as Array<{ dispose(): void }>).forEach((m) => m.dispose());
      });
    },
    update(_dt, t) {
      applyPose(rig, ctx, 0.42);
      rig.rotation.y += Math.sin(t * 0.6) * 0.12;
      rig.position.y = Math.sin(t * 0.9) * 0.01 - (params.planche ? 0.1 : 0);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
