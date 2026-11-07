import { Group, Matrix4, MeshBasicNodeMaterial, Raycaster, Vector2, Vector3, type Mesh } from 'three/webgpu';
import { clamp, float, luminance, max, mix, pow, smoothstep, sqrt, step, texture, time, uniform, vec4 } from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { DESIGN_BY_ID, ensureCardImages, ensureFonts, generateBackArt, generateCardArt, type CardArt } from '../../core/art';
import { KCDQ_CARDS, cardForRarity, isSecretPhotoSet, type CardData } from '../../core/cardData';
import { RARITIES, rarity, starCount, type RarityId } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { CARD, createCardMesh } from '../../core/cardModel';
import { createPipeline } from '../../core/post';
import type { N } from '../../core/tsl';
import { RotationRig, cardGeo, composeLayers, createCtx, createInputs, type DesignKind, type FxCtx } from '../043-rarity-fx/kit';
import type { FxTextures } from '../043-rarity-fx/textures';
import { createPokeTextures, type PokeTextures } from './pokeTex';
import { POKE_BY_ID, POKE_FX, goldSweep, type PokeFxDef, type Zone } from './pokeFx';

/** sRGB ⇄ linéaire (les reflets d'origine sont calculés en espace écran). */
const toS = (c: N): N => mix(c.mul(12.92), pow(max(c, 0.0031308), 1 / 2.4).mul(1.055).sub(0.055), step(0.0031308, c));
const toL = (c: N): N => mix(c.div(12.92), pow(c.add(0.055).div(1.055), 2.4), step(0.04045, c));

const LS_ASSIGN = 'cardlab.pokebox.assign.v1';
const NONE = 'aucun';
type Assign = Partial<Record<RarityId, string>>;

/**
 * 044 — Reflets Pokébox (07/11). Les 12 reflets de pokebox.lopatkin.net portés en TSL sur NOS cartes (design du jeu,
 * dos acier, épaisseur), avec la même « lumière » que chez eux : la projection de l'œil sur la carte. But : les
 * regarder en visio avec Hugo et décider quel reflet va sur quelle rareté (panneau « Qui va où ? », sauvegardé et
 * partageable par lien).
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let ptex: PokeTextures;
  let root: Group;
  let hud: HTMLElement;
  let labels: HTMLElement;
  let building = false;
  let rebuildQueued = false;
  let built: Array<{ dispose(): void }> = [];
  type CardU = { ptr: { value: Vector2 }; bgv: { value: Vector2 }; pfc: { value: number }; rotX: { value: number } };
  let cards: Array<{ mesh: Mesh; holder: Group; def: PokeFxDef | null; u: CardU; label?: HTMLElement }> = [];
  const I = createInputs();
  let rig: RotationRig;
  const rot = new Vector2();
  const q0 = new URLSearchParams(location.search);
  const params = {
    effet: POKE_BY_ID[q0.get('fx') ?? ''] || q0.get('fx') === NONE ? (q0.get('fx') as string) : 'regular-holo',
    vue: (q0.get('view') === 'carte' ? 'carte' : 'planche') as 'carte' | 'planche',
    carte: Math.max(0, Number(q0.get('card') ?? 0) || 0),
    zone: 'auto' as 'auto' | Zone,
    gravure: true,
    vitrine: q0.has('vitrine'),
    sensibilité: 1,
  };
  const demo = { on: q0.has('demo') };
  /** réglages partagés par toutes les cartes (uniforms : pas de recompilation) */
  const U = {
    op: uniform(0.82),
    /** AJOUT (pas chez Pokébox) : sous-couche argent sous le foil — leurs cartes sont des scans imprimés sur argent, clairs */
    argent: uniform(Math.max(0, Math.min(1, Number(q0.get('argent') ?? 0) || 0))),
    sujet: uniform(0.35),
    relief: uniform(0.7),
    force: uniform(5),
    prog: uniform(0),
  };
  let assign: Assign = loadAssign();
  let fitDistance = 1;

  function loadAssign(): Assign {
    const fromUrl = q0.get('assign');
    if (fromUrl) {
      const a: Assign = {};
      for (const kv of fromUrl.split(',')) {
        const [k, v] = kv.split(':');
        if (RARITIES.some((r) => r.id === k) && (v === NONE || POKE_BY_ID[v])) a[k as RarityId] = v;
      }
      return a;
    }
    try {
      return JSON.parse(localStorage.getItem(LS_ASSIGN) ?? '{}') as Assign;
    } catch {
      return {};
    }
  }
  function saveAssign() {
    try {
      localStorage.setItem(LS_ASSIGN, JSON.stringify(assign));
    } catch {
      /* stockage indisponible : on garde en mémoire */
    }
  }

  function designFor(cd: CardData): { id: string | undefined; kind: DesignKind } {
    const forced = q0.get('design');
    const id = forced ?? (cd.id.startsWith('mrv-') ? 'classic' : isSecretPhotoSet(cd.set) ? undefined : 'full-art');
    const kind: DesignKind = id === 'classic' ? 'classic' : id === undefined || id === 'bebou' ? 'bebou' : 'full-art';
    return { id, kind };
  }

  /** Zones de la carte où peut vivre le foil (cf. kit 043 : encre, voiles, sujet, fond). */
  function zoneNode(c: FxCtx, z: Zone): N {
    if (z === 'fond') return c.fond;
    if (z === 'sujet') return c.subj;
    if (z === 'cadre') return clamp(c.margin.add(c.veil.mul(0.8)), 0, 1).mul(c.ink.oneMinus());
    return c.ink.mul(0.9).oneMinus().mul(mix(float(1), U.sujet, c.subj));
  }

  function makeMaterial(def: PokeFxDef | null, art: CardArt, cd: CardData, u: CardU): MeshBasicNodeMaterial {
    const d = designFor(cd);
    const dz = d.id ? DESIGN_BY_ID[d.id] : DESIGN_BY_ID.bebou;
    const geo = cardGeo(d.kind, (dz?.art.to as [number, number] | undefined) ?? [384, 470]);
    const L = composeLayers(art, {});
    const fc = createCtx('high', {} as FxTextures, art, I, rarity(ctx.rarity).hex, rarity(ctx.rarity).accentHex, L, geo, { photo: !!cd.photo });
    const base = toS(clamp(L.color, 0, 1));
    let col: N = base;
    if (def) {
      // ── masque « holo » : la zone, modulée par la MATIÈRE de l'illustration (clairs = foil plein, sombres = moins)
      //    → comme leurs masques en niveaux de gris, le reflet semble imprimé dans l'image
      const lumAt = (lvl: number) => {
        const b = texture(art.bg, L.bgUV).level(float(lvl));
        const s = texture(art.subject, L.sjUV).level(float(lvl));
        return sqrt(max(luminance(mix(b.rgb, s.rgb, s.a)), 0));
      };
      const z = zoneNode(fc, params.zone === 'auto' ? def.zone : params.zone);
      const matter = mix(float(0.55), float(1), smoothstep(0.08, 0.8, lumAt(1.5)));
      const mask = z.mul(mix(float(1), matter, U.relief));
      // ── gravure (etch) : le détail fin de l'illustration (passe-haut entre deux niveaux de mip), sur fond clair
      const etch = def.etch && params.gravure;
      const foil = etch ? clamp(lumAt(0).sub(lumAt(3)).mul(U.force).add(0.7), 0, 1).mul(z) : float(0);
      const silvered = mix(base, base.mul(0.75).add(0.3), mask.mul(U.argent));
      const out = def.fn({ uv: fc.uv, base: silvered, mask, foil, hasFoil: etch, pointer: u.ptr, bg: u.bgv, pfc: u.pfc, rotX: u.rotX, time, op: U.op, T: ptex });
      col = mix(base, out.color, smoothstep(0, 0.02, out.area));
      col = mix(col, out.color, U.argent.mul(mask)); // la sous-couche reste visible hors zone de réglage
    }
    col = goldSweep(fc.uv, clamp(col, 0, 1), U.prog, time, ptex);
    const m = new MeshBasicNodeMaterial();
    m.colorNode = vec4(toL(clamp(col, 0, 1)), 1);
    return m;
  }

  /** Zone libre du canvas (px) : sous la barre d'outils, à gauche des réglages, au-dessus de la description du labo. */
  function freeRect() {
    const cr = ctx.canvas.getBoundingClientRect();
    let x0 = 14, x1 = cr.width - 14, y0 = 58, y1 = cr.height - 14;
    const g = (ctx.gui as unknown as { root?: { domElement?: HTMLElement } }).root?.domElement;
    const gr = g?.getBoundingClientRect();
    if (gr && gr.width > 0 && gr.left - cr.left > cr.width * 0.5) x1 = Math.min(x1, gr.left - cr.left - 12);
    const ir = document.querySelector<HTMLElement>('.info')?.getBoundingClientRect();
    if (ir && ir.height > 0) y1 = Math.min(y1, ir.top - cr.top - 20);
    if (x1 - x0 < cr.width * 0.4) [x0, x1] = [0, cr.width];
    if (y1 - y0 < cr.height * 0.4) [y0, y1] = [0, cr.height];
    return { cw: Math.max(1, cr.width), ch: Math.max(1, cr.height), x0, x1, y0, y1 };
  }
  const GX = 1.1, GY = 1.16;
  function layout(n: number) {
    if (n === 1) return { cols: 1, rows: 1 };
    const R = freeRect();
    let best = { cols: 6, rows: 2, s: 0 };
    for (const cols of [6, 4, 3, 2]) {
      const rows = Math.ceil(n / cols);
      const sc = Math.min((R.x1 - R.x0) / (cols * GX * CARD.w), (R.y1 - R.y0) / (rows * GY * CARD.h));
      if (sc > best.s) best = { cols, rows, s: sc };
    }
    return best;
  }
  /** décalage de vue (px) qui centre le contenu dans la zone libre */
  const off = { x: 0, y: 0 };

  async function build() {
    if (building) return void (rebuildQueued = true);
    building = true;
    try {
      for (const b of built) b.dispose();
      built = [];
      root.clear();
      labels.textContent = '';
      cards = [];
      const src = q0.get('src');
      const cd = src === 'kcdq' ? KCDQ_CARDS[params.carte % KCDQ_CARDS.length] : cardForRarity((src as RarityId | null) ?? ctx.rarity, params.carte);
      await ensureCardImages([cd]);
      const d = designFor(cd);
      const art = ctx.bag.add(generateCardArt(cd, ctx.rarity, { scale: params.vue === 'planche' ? 0.75 : 1, ...(d.id ? { design: d.id } : {}) }));
      const back = ctx.bag.add(generateBackArt(undefined, 0.75));
      const backMat = createBackMaterial(back);
      const edgeMat = createEdgeMaterial();
      built.push(backMat, edgeMat);
      const defs: Array<PokeFxDef | null> = params.vue === 'planche' ? POKE_FX : [POKE_BY_ID[params.effet] ?? null];
      const { cols, rows } = layout(defs.length);
      const gx = CARD.w * GX, gy = CARD.h * GY;
      defs.forEach((def, k) => {
        const u: CardU = { ptr: uniform(new Vector2(0.5, 0.5)), bgv: uniform(new Vector2(0.5, 0.5)), pfc: uniform(0), rotX: uniform(0) };
        const front = makeMaterial(def, art, cd, u);
        built.push(front);
        const mesh = createCardMesh(front, backMat, edgeMat);
        const holder = new Group();
        holder.add(mesh);
        const c = k % cols, r = Math.floor(k / cols);
        holder.position.set((c - (cols - 1) / 2) * gx, ((rows - 1) / 2 - r) * gy, 0);
        root.add(holder);
        const entry: (typeof cards)[number] = { mesh, holder, def, u };
        if (defs.length > 1 && def) {
          const el = document.createElement('div');
          el.className = 'pk-lbl';
          el.textContent = `${k + 1}. ${def.name}`;
          labels.append(el);
          entry.label = el;
        }
        cards.push(entry);
      });
      fit();
      await stage.compile();
      renderHud();
    } finally {
      building = false;
      if (rebuildQueued) {
        rebuildQueued = false;
        void build();
      }
    }
  }

  function fit() {
    const n = params.vue === 'planche' ? POKE_FX.length : 1;
    const { cols, rows } = layout(n);
    const R = freeRect();
    const cam = stage.camera;
    cam.aspect = R.cw / R.ch;
    const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const fw = cols * CARD.w * GX, fh = rows * CARD.h * GY;
    const fill = n === 1 ? 0.8 : 0.97;
    const uw = R.x1 - R.x0, uh = R.y1 - R.y0;
    fitDistance = Math.max((fh * R.ch) / (uh * fill * 2 * t), (fw * R.cw) / (uw * fill * 2 * t * cam.aspect));
    off.x = R.cw / 2 - (R.x0 + R.x1) / 2;
    off.y = R.ch / 2 - (R.y0 + R.y1) / 2;
    cam.setViewOffset(R.cw, R.ch, off.x, off.y, R.cw, R.ch);
    cam.position.set(0, 0, fitDistance);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }

  function renderHud() {
    const def = POKE_BY_ID[params.effet];
    hud.style.display = params.vue === 'planche' ? 'none' : '';
    const body = def
        ? `<div class="pk-name">${POKE_FX.indexOf(def) + 1}. ${def.name}</div><div>${def.look}</div><div class="pk-row"><b>Chez Pokémon</b> ${def.pkmn} · <b>zone</b> ${params.zone === 'auto' ? def.zone : params.zone}${def.etch ? ' · gravure' : ''}</div>`
        : `<div class="pk-name">Sans reflet</div><div>La carte telle qu'elle est en jeu aujourd'hui (référence).</div>`;
    hud.innerHTML = `${body}<div class="pk-q">${ctx.isWebGPU ? 'WebGPU' : 'WebGL2'} · intensité ${U.op.value.toFixed(2)}${params.vitrine ? ' · vitrine (œil hors-axe)' : ''}</div>`;
  }

  function assignText() {
    const lines = RARITIES.map((r) => {
      const v = assign[r.id];
      const name = v && v !== NONE ? `${POKE_FX.findIndex((d) => d.id === v) + 1}. ${POKE_BY_ID[v].name} (${POKE_BY_ID[v].pkmn})` : '— aucun —';
      return `${r.secret ? '✷' : '★'.repeat(starCount(r.id))} ${r.label} : ${name}`;
    });
    return `Reflets Pokébox — qui va où (labo 044)\n${lines.join('\n')}`;
  }
  function assignLink() {
    const u = new URL(location.href);
    u.searchParams.set('exp', '044');
    u.searchParams.set('assign', RARITIES.filter((r) => assign[r.id]).map((r) => `${r.id}:${assign[r.id]}`).join(','));
    return u.toString();
  }
  /** Copie dans le presse-papiers ; le libellé du bouton confirme (pas de calque qui masque la carte). */
  async function copy(text: string, ctrl: { name(n: string): unknown }, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      ctrl.name('✓ copié');
    } catch {
      console.info(text);
      ctrl.name('✗ presse-papiers refusé (texte dans la console)');
    }
    setTimeout(() => ctrl.name(label), 1800);
  }
  /** Montre le reflet choisi pour une rareté. */
  function preview(id: string) {
    if (id === NONE || !POKE_BY_ID[id]) return;
    params.effet = id;
    params.vue = 'carte';
    ctx.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    void build();
  }

  // ── clic sur une carte de la planche → vue grande
  const ray = new Raycaster();
  const ndc = new Vector2();
  let downAt: [number, number] | null = null;
  const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!downAt || params.vue !== 'planche') return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 6) return;
    const r = ctx.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const hit = ray.intersectObjects(cards.map((c) => c.mesh), false)[0];
    const card = hit && cards.find((c) => c.mesh === hit.object);
    if (!card?.def) return;
    params.effet = card.def.id;
    params.vue = 'carte';
    ctx.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    void build();
  };

  function demoPose(t: number) {
    const f = t % 5;
    const fl = f < 0.32 ? Math.sin((f / 0.32) * Math.PI) * 1.25 : 0;
    return { x: Math.sin(t * 0.9) * 0.85 + fl, y: Math.sin(t * 1.3) * 0.55 };
  }

  const invM = new Matrix4();
  const eye = new Vector3();
  const tmp = new Vector3();

  return {
    params,
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#1c1a18', '#070606'], env: null, fill: 0.74 });
      ptex = createPokeTextures();
      ptex.list.forEach((t) => c.bag.add(t));
      root = new Group();
      stage.scene.add(root);
      post = createPipeline(c, stage.scene, stage.camera);
      post.output = vec4(post.color.rgb, 1);
      await ensureFonts();
      rig = new RotationRig(I);
      const style = document.createElement('style');
      style.textContent = `.pk044{position:absolute;left:50%;top:58px;transform:translateX(-50%);max-width:min(560px,calc(100% - 340px));font:12px/1.45 ui-monospace,monospace;color:#e9e2d6;background:rgba(10,9,8,.72);padding:10px 12px;border-radius:8px;pointer-events:none}
.pk044 .pk-name{font-size:14px;color:#fff;margin-bottom:2px}.pk044 .pk-row b{color:#ffd38a;font-weight:500}.pk044 .pk-q{color:#9fd1a9;margin-top:4px}
.pk044l .pk-lbl{position:absolute;transform:translate(-50%,0);font:10px/1.2 ui-monospace,monospace;color:#d8d0c2;text-align:center;pointer-events:none;text-shadow:0 1px 2px #000}`;
      hud = document.createElement('div');
      hud.className = 'pk044';
      labels = document.createElement('div');
      labels.className = 'pk044l';
      c.overlay.append(style, labels, hud);
      c.canvas.addEventListener('pointerdown', onDown);
      c.canvas.addEventListener('pointerup', onUp);
      c.bag.fn(() => {
        c.canvas.removeEventListener('pointerdown', onDown);
        c.canvas.removeEventListener('pointerup', onUp);
        for (const b of built) b.dispose();
      });
      const names = Object.fromEntries([['— sans reflet (référence) —', NONE], ...POKE_FX.map((d, i) => [`${i + 1}. ${d.name}`, d.id])]);
      c.gui.add(params, 'effet', names).name('reflet').onChange(() => {
        params.vue = 'carte';
        c.gui.controllersRecursive().forEach((k) => k.updateDisplay());
        void build();
      });
      c.gui.add(params, 'vue', ['planche', 'carte']).name('vue').onChange(() => void build());
      c.gui.add(params, 'carte', 0, 12, 1).name('autre carte de la rareté').onChange(() => void build());
      c.gui.add(U.op, 'value', 0, 1.5, 0.05).name('intensité').onChange(() => renderHud());
      c.gui.add(params, 'zone', { 'auto (comme Pokémon)': 'auto', 'fond de l’illustration': 'fond', 'cadre / décor': 'cadre', 'toute la carte': 'carte', 'sujet seul': 'sujet' }).name('zone du foil').onChange(() => void build());
      c.gui.add(U.argent, 'value', 0, 1, 0.05).name('+ sous-couche argent (ajout)');
      c.gui.add(U.sujet, 'value', 0, 1, 0.05).name('reflet sur le sujet (toute la carte)');
      c.gui.add(U.relief, 'value', 0, 1, 0.05).name('masque suit l’illustration');
      c.gui.add(params, 'gravure').name('gravure (etch)').onChange(() => void build());
      c.gui.add(U.force, 'value', 0, 14, 0.5).name('force de la gravure');
      c.gui.add(params, 'sensibilité', 0.3, 2.5, 0.05).name('sensibilité de la lumière');
      c.gui.add(params, 'vitrine').name('vitrine (l’œil bouge, pas la carte)').onChange(() => fit());
      c.gui.add(demo, 'on').name('démo rotation (partage d’écran)');
      c.gui.add({ go: () => gsap.fromTo(U.prog, { value: 0 }, { value: 1, duration: 2.2, ease: 'power1.inOut' }) }, 'go').name('▶ révélation dorée');
      const fa = c.gui.addFolder('Qui va où ?');
      const choices = Object.fromEntries([['— aucun —', NONE], ...POKE_FX.map((d, i) => [`${i + 1}. ${d.name}`, d.id])]);
      for (const r of RARITIES) {
        const o = { v: assign[r.id] ?? NONE };
        fa.add(o, 'v', choices).name(`${r.secret ? '✷' : '★'.repeat(starCount(r.id))} ${r.label}`).onChange((v: string) => {
          assign[r.id] = v;
          saveAssign();
          preview(v);
        });
      }
      const acts = {
        copier: () => void copy(assignText(), cCopy, '📋 copier le choix (texte)'),
        lien: () => void copy(assignLink(), cLink, '🔗 copier le lien du labo'),
      };
      const cCopy = fa.add(acts, 'copier').name('📋 copier le choix (texte)');
      const cLink = fa.add(acts, 'lien').name('🔗 copier le lien du labo');
      await build();
    },
    update(dt, t) {
      const maxT = 0.32;
      const pose = ctx.input.pose(maxT);
      let rx = pose.x, ry = pose.y;
      if (demo.on) {
        const d = demoPose(t);
        rx = -d.y * maxT;
        ry = d.x * maxT;
      } else if (!ctx.input.inside && !ctx.input.gyroEnabled) ry += Math.sin(t * 0.6) * 0.22;
      rot.set(ry / maxT, -rx / maxT);
      rig.update(dt, rot, t);
      const cam = stage.camera;
      if (params.vitrine) {
        // l'œil se déplace devant la carte immobile (frustum asymétrique : la carte reste cadrée) — c'est leur
        // « head tracking » sans webcam
        const tf = Math.tan(((cam.fov * Math.PI) / 180) / 2);
        const hh = fitDistance * tf, hw = hh * cam.aspect;
        const R = freeRect();
        const sx = (off.x / R.cw) * 2 * hw, sy = (off.y / R.ch) * 2 * hh;
        const ex = rot.x * fitDistance * Math.tan(maxT) * 1.6, ey = rot.y * fitDistance * Math.tan(maxT) * 1.6;
        cam.position.set(ex, ey, fitDistance);
        cam.rotation.set(0, 0, 0);
        const n = cam.near, f = cam.far;
        cam.projectionMatrix.makePerspective(((-hw - ex + sx) * n) / fitDistance, ((hw - ex + sx) * n) / fitDistance, ((hh - ey - sy) * n) / fitDistance, ((-hh - ey - sy) * n) / fitDistance, n, f, cam.coordinateSystem, cam.reversedDepth);
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        rx = 0;
        ry = 0;
      }
      const r = ctx.canvas.getBoundingClientRect();
      for (const c of cards) {
        c.mesh.rotation.set(rx, ry, 0);
        c.mesh.updateWorldMatrix(true, false);
        // ── la « lumière » de Pokébox : l'œil exprimé dans le repère de la carte → point regardé en UV
        invM.copy(c.mesh.matrixWorld).invert();
        eye.copy(cam.position).applyMatrix4(invM);
        const k = params.sensibilité * 1.5;
        const px = Math.max(0, Math.min(1, 0.5 + (eye.x / Math.max(eye.z, 0.01)) * k));
        const py = Math.max(0, Math.min(1, 0.5 + (eye.y / Math.max(eye.z, 0.01)) * k));
        c.u.ptr.value.set(px, py);
        c.u.bgv.value.set(0.37 + px * 0.26, 0.37 + py * 0.26);
        c.u.pfc.value = Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2);
        c.u.rotX.value = (-Math.atan2(eye.x, eye.z) * 180) / Math.PI;
        if (c.label) {
          tmp.set(CARD.w / 2, -CARD.h / 2 - 0.01, 0).applyMatrix4(c.holder.matrixWorld).project(cam);
          const xr = ((tmp.x + 1) / 2) * r.width;
          tmp.set(-CARD.w / 2, -CARD.h / 2 - 0.01, 0).applyMatrix4(c.holder.matrixWorld).project(cam);
          const xl = ((tmp.x + 1) / 2) * r.width;
          c.label.style.left = `${(xl + xr) / 2}px`;
          c.label.style.width = `${Math.max(60, (xr - xl) * 1.06)}px`;
          c.label.style.top = `${((1 - tmp.y) / 2) * r.height + 2}px`;
        }
      }
      post.render();
    },
    resize() {
      fit();
    },
    setRarity(rid: RarityId) {
      const a = assign[rid];
      if (a && a !== NONE) {
        params.effet = a;
        params.vue = 'carte';
        ctx.gui.controllersRecursive().forEach((k) => k.updateDisplay());
      }
      void build();
    },
    dispose() {},
  };
}
