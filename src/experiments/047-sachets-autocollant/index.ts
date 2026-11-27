import { DirectionalLight, Group, RenderTarget, Scene, type Mesh } from 'three/webgpu';
import type { Experiment, LabContext } from '../../core/Experiment';
import { applyPose, createStage } from '../../core/stage';
import { createPackMesh, generatePackArt, PACK, type PackArt } from '../../core/pack';
import { createStickerPackMesh, SACHET_IDS, SACHETS, stickerPackArt, type SachetId, type StickerLang, type StickerPackArt, type StickerVariant } from '../../core/packSticker';

/**
 * 047 — SACHETS « AUTOCOLLANT » SUR ALU (27/11, brief de Tom) : la piste retenue du 046, refaite sur la vraie matière
 * du jeu. Le film alu teinté, ses plis et le nom thermoformé ne changent pas ; les thèmes se reconnaissent aux
 * autocollants collés dessus (src/core/packSticker.ts). Deux variantes par sachet.
 *  - la PLANCHE (en haut) : vignettes de 80 px de large, la taille du téléphone — ligne « actuel », ligne A, ligne B.
 *    Toucher une vignette la met en 3D ;
 *  - en 3D : à gauche le sachet ACTUEL du jeu, à droite la variante choisie, sur le même maillage ; les deux tournent.
 * `?s=monde&v=b&l=en&a=20&g=3&planche=0` : sachet, variante, langue, angle figé (degrés), graine, planche masquée.
 */
/** le sachet du jeu aujourd'hui (opening.ts : SACHET / SACHET_LABEL) ; Télé et Noël : la teinte de l'événement */
const ACTUEL: Record<SachetId, { ground: string; label: string }> = {
  gaming: { ground: '#6a4fc4', label: 'Gaming' },
  pop: { ground: '#d8742e', label: 'Popculture' },
  sport: { ground: '#3a9a66', label: 'Sport' },
  monde: { ground: '#3c73c8', label: 'World' },
  bebou: { ground: '#9ea2aa', label: 'Bebou' },
  tele: { ground: '#c026d3', label: 'Télé' },
  noel: { ground: '#0e7490', label: 'Noël' },
};
const currentArt = (id: SachetId) => generatePackArt({ name: ACTUEL[id].label, ground: ACTUEL[id].ground, ground2: ACTUEL[id].ground, ink: '#141016', foil: '#ffffff', accent: ACTUEL[id].ground, simple: true, label: ACTUEL[id].label });

const disposeMesh = (m: Mesh | null) => m && (m.material as Array<{ dispose(): void }>).forEach((x) => x.dispose());

export default function create(): Experiment {
  let ctx!: LabContext;
  let stage!: ReturnType<typeof createStage>;
  const rigNew = new Group(), rigCur = new Group();
  let meshNew: Mesh | null = null, meshCur: Mesh | null = null;
  let artNew: StickerPackArt | null = null, artCur: PackArt | null = null;
  let curId: SachetId | null = null;
  let token = 0, boardToken = 0;
  const qs = new URLSearchParams(location.search || location.hash.split('?')[1] || '');
  const pick = <T extends string>(v: string | null, all: readonly T[], d: T) => (all.includes(v as T) ? (v as T) : d);
  const params = {
    sachet: pick(qs.get('s'), SACHET_IDS, 'gaming'),
    variante: pick(qs.get('v'), ['a', 'b'] as const, 'a') as StickerVariant,
    langue: pick(qs.get('l'), ['fr', 'en'] as const, 'fr') as StickerLang,
    graine: Math.max(1, Math.min(6, Number(qs.get('g')) || 1)),
    tourne: !qs.has('a'),
    angle: Number(qs.get('a')) || 0,
    planche: qs.get('planche') !== '0',
    // essai de teinte du film (`?tint=ff2d8f&mix=0.5`) : vide = la teinte de la fiche
    essaiTeinte: /^[0-9a-f]{6}$/i.test(qs.get('tint') ?? ''),
    teinte: `#${/^[0-9a-f]{6}$/i.test(qs.get('tint') ?? '') ? qs.get('tint') : '888888'}`,
    alu: Number(qs.get('mix')) || 0.66,
  };
  // (passe 2) habillage imprimé : `auto` = A en bandeau, B en cartouche ; `nu` = la passe 1 (stickers sur l'alu nu).
  // matière : `legere` (passe 2, 3 lectures de texture, un reflet) ou `origine` (celle du jeu).
  const hab = pick(qs.get('h'), ['auto', 'bandeau', 'cartouche', 'nu'] as const, 'auto');
  const more = { habillage: hab as 'auto' | 'bandeau' | 'cartouche' | 'nu', matiere: pick(qs.get('m'), ['legere', 'origine'] as const, 'legere') as 'legere' | 'origine' };
  const film = () => ({
    ...(params.essaiTeinte ? { tint: params.teinte, alloyMix: params.alu } : {}),
    ...(more.habillage !== 'auto' ? { habillage: more.habillage } : {}),
  });
  let measuring = false;
  let board!: HTMLElement, caption!: HTMLElement;
  let baseY = 0;
  const flag = window as unknown as { __sachets?: { planche: boolean; pack: boolean; mesure?: (n?: number, w?: number) => Promise<Record<string, number | string> | null> } };
  flag.__sachets = { planche: false, pack: false, mesure: (n, w) => mesure(n, w) };

  /**
   * MESURE (règle du projet : mesurer avant / après). Dessine le sachet plein cadre dans une cible 1080 × 1920, `n`
   * images d'affilée, et attend que le GPU ait fini : millisecondes par image pour le sachet actuel du jeu, la matière
   * d'origine avec autocollants (passe 1) et la matière allégée (passe 2). WebGPU seulement. Le chiffre dépend de la
   * machine : il compare les trois matières entre elles, il ne dit pas les i/s d'un téléphone.
   */
  async function mesure(n = 120, w = 1080): Promise<Record<string, number | string> | null> {
    const dev = (ctx.renderer as unknown as { backend?: { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } } }).backend?.device;
    if (!dev || !artNew || !artCur) return null;
    measuring = true;
    const r = ctx.renderer;
    // (`w` plus grand = la part du calcul par pixel domine celle de l'envoi des commandes)
    const rt = new RenderTarget(w, Math.round((w * 16) / 9));
    const cam = stage.camera.clone();
    cam.aspect = 1080 / 1920;
    cam.position.set(0, 0, PACK.h / 0.98 / (2 * Math.tan(((cam.fov * Math.PI) / 180) / 2)));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const sc = new Scene();
    sc.environment = stage.scene.environment;
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(-1.2, 2.2, 3);
    sc.add(key);
    const cand: Array<[string, Mesh]> = [
      ['actuel', createPackMesh(artCur)],
      ['origine', createStickerPackMesh(artNew, { matiere: 'origine' })],
      ['legere', createStickerPackMesh(artNew, { matiere: 'legere' })],
    ];
    const out: Record<string, number | string> = {};
    const burst = async (k: number) => {
      const t0 = performance.now();
      r.setRenderTarget(rt);
      for (let i = 0; i < k; i++) r.render(sc, cam);
      r.setRenderTarget(null);
      await dev.queue.onSubmittedWorkDone();
      return (performance.now() - t0) / k;
    };
    try {
      for (const [name, mesh] of cand) {
        sc.add(mesh);
        await r.compileAsync(sc, cam);
        await burst(8);
        let best = Infinity;
        for (let pass = 0; pass < 3; pass++) best = Math.min(best, await burst(n));
        out[name] = Math.round(best * 1000) / 1000;
        sc.remove(mesh);
        disposeMesh(mesh);
      }
      const ad = await (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> } }).gpu?.requestAdapter();
      out.gpu = `${ad?.info?.vendor ?? '?'} ${ad?.info?.architecture ?? ''} ${ad?.info?.description ?? ''}`.trim();
    } finally {
      r.setRenderTarget(null);
      rt.dispose();
      measuring = false;
    }
    return out;
  }

  async function showPacks() {
    const my = ++token;
    flag.__sachets!.pack = false;
    const a = await stickerPackArt(params.sachet, params.variante, params.langue, params.graine, film());
    if (my !== token) return void a.dispose();
    if (meshNew) rigNew.remove(meshNew);
    disposeMesh(meshNew);
    artNew?.dispose();
    artNew = a;
    meshNew = createStickerPackMesh(a, { matiere: more.matiere });
    rigNew.add(meshNew);
    if (curId !== params.sachet) {
      const c = await currentArt(params.sachet);
      if (my !== token) return void c.dispose();
      if (meshCur) rigCur.remove(meshCur);
      disposeMesh(meshCur);
      artCur?.dispose();
      artCur = c;
      curId = params.sachet;
      meshCur = createPackMesh(c);
      rigCur.add(meshCur);
    }
    const k = SACHETS[params.sachet], v = k.variants[params.variante];
    caption.innerHTML = '';
    const cell = (title: string, sub: string) => {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = title;
      const s = document.createElement('span');
      s.textContent = sub;
      d.append(b, s);
      return d;
    };
    caption.append(
      cell('Actuel', `${ACTUEL[params.sachet].label} · alu teinté, nom moulé`), // i18n-ok (labo)
      cell(`${k.title.fr} · ${params.variante.toUpperCase()} « ${v.name} »`, `${v.by} — ${k.mots}`),
    );
    flag.__sachets!.pack = true;
    markBoard();
  }

  function markBoard() {
    board.querySelectorAll<HTMLElement>('.sa47-t').forEach((b) => b.classList.toggle('on', b.dataset.s === params.sachet && b.dataset.v === params.variante));
  }

  /** vignette 2D d'une face, réduite à 160 px de large (affichée à 80 px : écran ×2 du téléphone) */
  function shot(src: HTMLCanvasElement): string {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = Math.round((160 * src.height) / src.width);
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.9);
    c.width = c.height = 0;
    return url;
  }

  async function drawBoard() {
    const my = ++boardToken;
    flag.__sachets!.planche = false;
    board.hidden = !params.planche;
    layout();
    if (!params.planche) return;
    board.replaceChildren();
    const rows: Array<{ key: 'cur' | StickerVariant; name: string }> = [{ key: 'cur', name: 'Actuel' }, { key: 'a', name: 'A' }, { key: 'b', name: 'B' }]; // i18n-ok (labo)
    const imgs = new Map<string, HTMLImageElement>();
    for (const r of rows) {
      const line = document.createElement('div');
      line.className = 'sa47-row';
      const h = document.createElement('span');
      h.className = 'sa47-h';
      h.textContent = r.name;
      line.append(h);
      for (const id of SACHET_IDS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sa47-t';
        b.dataset.s = id;
        b.dataset.v = r.key;
        b.title = `${SACHETS[id].title.fr}${r.key === 'cur' ? ' (actuel)' : ` · ${SACHETS[id].variants[r.key].name}`}`; // i18n-ok (labo)
        const img = new Image();
        img.alt = b.title;
        imgs.set(`${r.key}:${id}`, img);
        b.append(img);
        b.addEventListener('click', () => {
          params.sachet = id;
          if (r.key !== 'cur') params.variante = r.key;
          ctx.gui.controllersRecursive().forEach((k) => k.updateDisplay());
          void showPacks();
        });
        line.append(b);
      }
      board.append(line);
    }
    markBoard();
    layout();
    // l'une après l'autre : une seule série de toiles vivante à la fois (mémoire du téléphone)
    for (const r of rows)
      for (const id of SACHET_IDS) {
        if (r.key === 'cur') {
          const a = await currentArt(id);
          if (my !== boardToken) return void a.dispose();
          imgs.get(`cur:${id}`)!.src = shot(a.thumbFront ?? (a.front.image as HTMLCanvasElement));
          a.dispose();
        } else {
          const a = await stickerPackArt(id, r.key, params.langue, 1);
          if (my !== boardToken) return void a.dispose();
          imgs.get(`${r.key}:${id}`)!.src = shot(a.thumb);
          a.dispose();
        }
      }
    flag.__sachets!.planche = true;
  }

  /** cadre les deux sachets dans la place laissée sous la planche */
  function layout() {
    if (!stage) return;
    const W = ctx.width, H = ctx.height;
    const top = board && !board.hidden ? Math.min(H * 0.62, board.getBoundingClientRect().bottom - ctx.canvas.getBoundingClientRect().top + 6) : 56;
    const bottom = H - 74;
    const cam = stage.camera;
    cam.aspect = W / H;
    const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const fracH = Math.max(0.2, (bottom - top) / H);
    const d = Math.max(PACK.h / (0.86 * fracH) / (2 * t), (PACK.w * 2.3) / 0.96 / (2 * t * cam.aspect));
    cam.position.set(0, 0, d);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    baseY = (0.5 - (top + bottom) / 2 / H) * 2 * t * d;
  }

  return {
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#34323a', '#101014'], env: 'studio', frameW: PACK.w * 2.3, frameH: PACK.h, fill: 0.5, fillPortrait: 0.96 });
      const key = new DirectionalLight(0xffffff, 1.4);
      key.position.set(-1.2, 2.2, 3);
      stage.scene.add(key, rigNew, rigCur);
      const style = document.createElement('style');
      style.textContent = `.sa47 { position: absolute; left: 0; right: 0; top: 58px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 8px; pointer-events: auto; }
        .sa47-row { display: flex; gap: 6px; align-items: center; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
        .sa47-h { flex: none; width: 44px; font: 600 11px/1.2 Inter, system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #b9b6c2; text-align: right; padding-right: 4px; }
        .sa47-t { flex: none; width: 80px; aspect-ratio: 640 / 968; padding: 0; border: 0; outline: 2px solid transparent; outline-offset: 1px; border-radius: 4px; background: #24222a; cursor: pointer; overflow: hidden; }
        .sa47-t img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .sa47-t img:not([src]) { visibility: hidden; }
        .sa47-t.on { outline-color: #fff; }
        .sa47-cap { position: absolute; left: 0; right: 0; bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 10px; text-align: center; font: 500 11px/1.35 Inter, system-ui, sans-serif; color: #b9b6c2; pointer-events: none; }
        .sa47-cap b { display: block; font-weight: 700; font-size: 13px; color: #fff; }
        .sa47-cap span { display: block; }
        @media (max-width: 620px) { .sa47 { gap: 4px; align-items: flex-start; } .sa47-h { width: 30px; font-size: 9px; } }`;
      board = document.createElement('div');
      board.className = 'sa47';
      caption = document.createElement('div');
      caption.className = 'sa47-cap';
      c.overlay.append(style, board, caption);
      board.hidden = !params.planche;
      layout();
      await showPacks();
      await stage.compile();
      c.gui.add(params, 'sachet', Object.fromEntries(SACHET_IDS.map((id) => [SACHETS[id].title.fr, id]))).name('sachet').onChange(() => void showPacks());
      c.gui.add(params, 'variante', { 'A': 'a', 'B': 'b' }).name('variante').onChange(() => void showPacks());
      c.gui.add(params, 'langue', { 'Français': 'fr', 'English': 'en' }).name('langue').onChange(() => void Promise.all([showPacks(), drawBoard()])); // i18n-ok (labo)
      c.gui.add(params, 'graine', 1, 6, 1).name('booster n° (plis + pose)').onChange(() => void showPacks()); // i18n-ok (labo)
      const essai = c.gui.addFolder('essai de teinte du film'); // i18n-ok (labo)
      essai.add(params, 'essaiTeinte').name('activer').onChange(() => void showPacks()); // i18n-ok (labo)
      essai.addColor(params, 'teinte').name('teinte').onFinishChange(() => params.essaiTeinte && void showPacks()); // i18n-ok (labo)
      essai.add(params, 'alu', 0.1, 0.8, 0.02).name('part d’alu clair').onFinishChange(() => params.essaiTeinte && void showPacks()); // i18n-ok (labo)
      essai.close();
      c.gui.add(params, 'tourne').name('tourne'); // i18n-ok (labo)
      c.gui.add(params, 'angle', -180, 180, 1).name('angle si figé (°)'); // i18n-ok (labo)
      c.gui.add(params, 'planche').name('planche 80 px').onChange(() => void drawBoard()); // i18n-ok (labo)
      c.gui.add(more, 'habillage', { 'auto (A bandeau · B cartouche)': 'auto', 'bandeau': 'bandeau', 'cartouche': 'cartouche', 'aucun (passe 1 : alu nu)': 'nu' }).name('habillage').onChange(() => void showPacks()); // i18n-ok (labo)
      c.gui.add(more, 'matiere', { 'allégée (passe 2)': 'legere', 'd’origine (jeu)': 'origine' }).name('matière').onChange(() => void showPacks()); // i18n-ok (labo)
      const res = { 'ms / image': '—' };
      c.gui.add({ mesurer: () => void mesure().then((m) => {
        res['ms / image'] = m ? `actuel ${m.actuel} · origine ${m.origine} · allégée ${m.legere}` : 'WebGPU requis'; // i18n-ok (labo)
        c.gui.controllersRecursive().forEach((k) => k.updateDisplay());
      }) }, 'mesurer').name('mesurer les 3 matières'); // i18n-ok (labo)
      c.gui.add(res, 'ms / image').disable();
      c.bag.fn(c.input.onTap(() => {
        params.variante = params.variante === 'a' ? 'b' : 'a';
        c.gui.controllersRecursive().forEach((k) => k.updateDisplay());
        void showPacks();
      }));
      c.bag.fn(() => {
        token++;
        boardToken++;
        artNew?.dispose();
        artCur?.dispose();
        disposeMesh(meshNew);
        disposeMesh(meshCur);
        delete flag.__sachets;
      });
      void drawBoard();
    },
    update(_dt, t) {
      // tour complet qui s'attarde sur la face et sur le dos
      const w = t * 0.5;
      const turn = params.tourne ? w - 0.42 * Math.sin(2 * w) : (params.angle * Math.PI) / 180;
      for (const [rig, x] of [[rigNew, 1], [rigCur, -1]] as const) {
        applyPose(rig, ctx, 0.3);
        rig.rotation.y += turn;
        rig.position.set(x * PACK.w * 0.6, baseY + Math.sin(t * 0.9 + x) * 0.008, 0);
      }
      if (!measuring) ctx.renderer.render(stage.scene, stage.camera);
    },
    resize() {
      layout();
    },
    dispose() {},
  };
}
