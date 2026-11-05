import { Group, MeshBasicNodeMaterial, NoBlending, Raycaster, RenderTarget, Vector2, type Mesh, type Object3D } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { ensureCardImages, ensureFonts, generateBackArt, generateCardArt, type CardArt } from '../../core/art';
import { KCDQ_CARDS, cardForRarity, type CardData, type CardPalette } from '../../core/cardData';
import { rarity, type RarityId } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { CARD, createCardMesh } from '../../core/cardModel';
import { createPipeline } from '../../core/post';
import { fxReduced } from '../../core/fxPref';
import type { N } from '../../core/tsl';
import { createFxTextures, type FxTextures } from './textures';
import { composeLayers, createCtx, createInputs, type Inputs, type Q } from './kit';
import { EFFECTS, TEXREF, TIER_LABEL, effectsOf, type FxDef, type FxEnv } from './effects';

/** Heures du jour pour les vues lenticulaires (même carte, autre lumière). */
const TIMES: Array<Partial<CardPalette>> = [
  { sky: '#7e9bb5', haze: '#f2d9a8', glow: '#fff4d6' },
  { sky: '#3b2a26', haze: '#c4572f', glow: '#ffb35c' },
  { sky: '#0f1422', haze: '#2c3a5c', glow: '#cfe0ff' },
];

/** Paramètres de rendu par niveau (rapport §5 : « quality ladder »). */
const LADDER: Record<Q, { scale: number; bloomRes: number; art: number; label: string }> = {
  low: { scale: 0.7, bloomRes: 0, art: 0.6, label: 'Low · téléphones modestes, WebGL2 iOS, effets réduits' },
  mid: { scale: 0.85, bloomRes: 0.3, art: 0.75, label: 'Mid · téléphones récents (WebGPU iOS 26, Android milieu de gamme)' },
  high: { scale: 1, bloomRes: 0.5, art: 1, label: 'High · PC, tablettes haut de gamme' },
};
/** Budget de temps d'image (ms) au-delà duquel le mode auto descend d'un niveau (p95 pendant 3 s). */
const BUDGET_MS = 22;

/**
 * 043 — Effets de rareté (rapport « shaders de cartes TCG », 05/11).
 * 35 effets, 5 par palier (1★ → secrète), progression PAR ZONES : bordure → cadre → fond → profondeur → matière et
 * lumière → toute la carte (sujet bridé) → la carte sort d'elle-même. Matériau NON ÉCLAIRÉ (MeshBasicNodeMaterial),
 * textures partagées précalculées, 3 niveaux de qualité avec rétrogradation automatique, mesure du temps GPU, contrôle
 * automatique de la lisibilité (ΔE sur le sujet).
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let tex: FxTextures;
  let I: Inputs;
  let root: Group;
  let cards: Array<{ mesh: Mesh; def: FxDef; art: CardArt; base: MeshBasicNodeMaterial; front: MeshBasicNodeMaterial; extras: Object3D[] }> = [];
  let built: Array<{ dispose(): void }> = [];
  let hud: HTMLElement;
  let building = false;
  let rebuildQueued = false;
  const q0 = new URLSearchParams(location.search);
  const params = {
    effet: Math.max(1, Math.min(5, Number(q0.get('fx') ?? 1))),
    qualité: (q0.get('q') as Q | 'auto' | null) ?? 'auto',
    vue: (q0.get('view') === 'planche' ? 'planche' : 'carte') as 'carte' | 'planche',
    upscale: 'bilinéaire' as 'bilinéaire' | 'FSR1',
    bloom: true,
    carte: Math.max(0, Number(q0.get('card') ?? 0) || 0),
  };
  let autoQ: Q = 'high';
  const frames: number[] = [];
  let overSince = 0;
  let gpuMs: number | null = null;
  let frameNo = 0;
  const ray = new Raycaster();
  const ndc = new Vector2();
  let pointerUV: Vector2 | null = null;
  let lastTouch = -100;
  let holdTimer = 0;
  let immersive = false;
  let fxCtrl: { options(o: Record<string, number>): unknown } | null = null;
  const names = () => Object.fromEntries(tierDefs().map((d, i) => [`${i + 1}. ${d.name}`, i + 1]));

  const now = () => (ctx.renderer as unknown as { _nodes?: { nodeFrame?: { time: number } } })._nodes?.nodeFrame?.time ?? performance.now() / 1000;
  const quality = (): Q => (fxReduced() ? 'low' : params.qualité === 'auto' ? autoQ : params.qualité);
  const tierDefs = () => effectsOf(ctx.rarity as RarityId);

  async function makeArt(cd: CardData, scale: number, flat = false) {
    await ensureCardImages([cd]);
    return ctx.bag.add(generateCardArt(cd, ctx.rarity, { scale, ...(flat ? { flatOnly: true } : {}) }));
  }

  /** Construit (ou reconstruit) les cartes de la vue courante. */
  async function build() {
    if (building) return void (rebuildQueued = true);
    building = true;
    try {
      const q = quality();
      for (const b of built) b.dispose();
      built = [];
      root.clear();
      cards = [];
      const L = LADDER[q];
      // ?src=<rareté> : prévisualiser les effets d'un palier sur une carte d'un autre palier (les secrètes sont des photos)
      // ?src=kcdq : la vraie photo KCDQ (les Bébous n'ont encore que des silhouettes « photo à venir »)
      const src = q0.get('src');
      const cd = src === 'kcdq' ? KCDQ_CARDS[params.carte % KCDQ_CARDS.length] : cardForRarity((src as RarityId | null) ?? ctx.rarity, params.carte);
      /** photo pleine (Bébous, KCDQ) : pas de sujet détouré, c'est la photo entière qu'il faut protéger */
      const photo = !!cd.photo;
      const rar = rarity(ctx.rarity);
      const back = ctx.bag.add(generateBackArt(undefined, L.art));
      const backMat = createBackMaterial(back);
      const edgeMat = createEdgeMaterial();
      built.push(backMat, edgeMat);
      const defs = params.vue === 'planche' ? tierDefs() : [tierDefs()[params.effet - 1]];
      const art = await makeArt(cd, L.art);
      for (const [k, def] of defs.entries()) {
        const env: FxEnv = {
          q,
          tex,
          I,
          art,
          photo,
          bag: { add: <T extends { dispose(): void }>(o: T) => (built.push(o), o) },
          makeViews: (n) => Promise.all(Array.from({ length: n }, (_, i) => makeArt({ ...cd, palette: { ...cd.palette, ...TIMES[i % TIMES.length] } }, L.art * 0.85, true))),
        };
        const extra = def.prepare ? await def.prepare(env) : {};
        const layers = composeLayers(art, def.layers ? def.layers(q, art, I, photo) : {});
        const c = createCtx(q, tex, art, I, rar.hex, rar.accentHex, layers, { ...extra, photo });
        const out = def.build(c);
        const front = new MeshBasicNodeMaterial();
        front.colorNode = vec4(out.color, 1);
        const glowOn = params.bloom && q !== 'low' && (def.bloom ?? 0) > 0;
        if (out.emissive && glowOn) (front as unknown as { emissiveNode: N }).emissiveNode = out.emissive;
        // matériaux du contrôle de lisibilité : carte sans effet, masque du sujet
        const base = new MeshBasicNodeMaterial();
        // le masque du sujet voyage dans l'alpha de la carte témoin (NoBlending : l'alpha n'est pas forcé à 1) —
        // une 3ᵉ relecture par inclinaison ne revenait jamais en WebGL2
        base.blending = NoBlending;
        base.colorNode = vec4(composeLayers(art, def.layers ? def.layers(q, art, I, photo) : {}).color, c.subj);
        built.push(front, base);
        const mesh = createCardMesh(front, backMat, edgeMat);
        const holder = new Group();
        holder.add(mesh);
        holder.position.x = (k - (defs.length - 1) / 2) * CARD.w * 1.16;
        root.add(holder);
        const before = mesh.children.length;
        def.attach?.(env, mesh, extra);
        cards.push({ mesh, def, art, base, front, extras: mesh.children.slice(before) });
      }
      setupPost(q, Math.max(...defs.map((d) => (params.bloom && q !== 'low' ? d.bloom ?? 0 : 0))));
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

  let bloomNode: { setResolutionScale(s: number): void; dispose(): void } | null = null;
  function setupPost(q: Q, bloomK: number) {
    const L = LADDER[q];
    post.scenePass.setResolutionScale(L.scale);
    let col: N = post.color;
    if (bloomK > 0) {
      bloomNode?.dispose();
      const b = bloom(post.emissive!, bloomK, 0.4, 0.0);
      b.setResolutionScale(L.bloomRes);
      bloomNode = b as unknown as typeof bloomNode;
      col = col.add((b as unknown as N).rgb);
    }
    const outN = vec4(col.rgb, 1);
    post.output = params.upscale === 'FSR1' && L.scale < 1 ? (fsr1(outN, 0.2) as unknown as N) : outN;
  }

  function fit() {
    const n = params.vue === 'planche' ? 5 : 1;
    const cam = stage.camera;
    cam.aspect = ctx.width / ctx.height;
    const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const fw = n * CARD.w * 1.16;
    const fill = immersive ? 0.98 : 0.74;
    const dH = CARD.h / fill / (2 * t);
    const dW = fw / (immersive ? 0.98 : 0.86) / (2 * t * cam.aspect);
    cam.position.set(0, 0, Math.max(dH, dW) * (immersive ? 0.92 : 1));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }

  function renderHud() {
    const q = quality();
    const defs = tierDefs();
    const d = defs[params.effet - 1];
    const list = defs.map((e, i) => `<span class="fx-i${i + 1 === params.effet ? ' on' : ''}">${i + 1}. ${e.name}</span>`).join('');
    const one = params.vue === 'planche'
      ? `<div class="fx-why">Planche : les 5 effets du palier, de gauche à droite.</div>`
      : `<div class="fx-name">#${d.num} · ${d.name}</div><div class="fx-why">${d.idea}</div><div class="fx-row"><b>Technique</b> ${d.tech}</div><div class="fx-row"><b>Coût</b> ${d.cost}</div><div class="fx-row"><b>Réduit</b> ${d.reduced}</div><div class="fx-row"><b>Lisibilité</b> ${d.readable}</div>`;
    hud.innerHTML = `<div class="fx-tier">${TIER_LABEL[ctx.rarity as RarityId]} — ${list}</div>${one}<div class="fx-perf" data-perf></div><div class="fx-q">${LADDER[q].label}${params.qualité === 'auto' ? ' (auto)' : ''}${fxReduced() ? ' · effets réduits' : ''} · ${ctx.isWebGPU ? 'WebGPU' : 'WebGL2'}</div><div class="fx-check" data-check></div>`;
  }

  function perfLine() {
    const el = hud.querySelector<HTMLElement>('[data-perf]');
    if (!el || frames.length < 20) return;
    const s = [...frames].sort((a, b) => a - b);
    const p = (k: number) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
    el.textContent = `image p50 ${p(0.5).toFixed(1)} ms · p95 ${p(0.95).toFixed(1)} ms${gpuMs != null ? ` · GPU ${gpuMs.toFixed(2)} ms` : ''}`;
  }

  /** Contrôle de lisibilité : ΔE moyen et p95 sur le SUJET entre la carte sans effet et avec effet, 9 inclinaisons. */
  async function readabilityCheck() {
    const el = hud.querySelector<HTMLElement>('[data-check]');
    if (!el || !cards.length) return;
    el.textContent = 'Contrôle de lisibilité…';
    const w = 240, h = Math.round((240 * CARD.h) / CARD.w);
    const rt = new RenderTarget(w, h);
    const cam = stage.camera.clone();
    const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const rows: string[] = [];
    const rgb2lab = (r: number, g: number, b: number) => {
      const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const R = lin(r), G = lin(g), B = lin(b);
      const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
      const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    for (const card of cards) {
      const holder = card.mesh.parent!;
      const saved = { x: holder.position.x, rot: card.mesh.rotation.clone(), tilt: I.tilt.value.clone() };
      holder.position.x = 0;
      root.children.forEach((o) => (o.visible = o === holder));
      cam.aspect = w / h;
      cam.position.set(0, 0, CARD.h / 0.96 / (2 * t));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      // compiler d'abord les 3 matériaux : un rendu dont le pipeline est encore en compilation est sauté, et la
      // relecture qui suit ne revient jamais (constaté en WebGL2)
      for (const m of [card.front, card.base]) {
        (card.mesh.material as unknown as MeshBasicNodeMaterial[])[0] = m;
        await ctx.renderer.compileAsync(stage.scene, cam);
      }
      const all: number[] = [];
      for (const ty of [-1, 0, 1])
        for (const tx of [-1, 0, 1]) {
          I.tilt.value.set(tx, ty);
          card.mesh.rotation.set(-ty * 0.32, tx * 0.32, 0);
          const shots: Uint8Array[] = [];
          for (const m of [card.front, card.base]) {
            (card.mesh.material as unknown as MeshBasicNodeMaterial[])[0] = m;
            card.extras.forEach((o) => (o.visible = m === card.front));
            ctx.renderer.setRenderTarget(rt);
            ctx.renderer.render(stage.scene, cam);
            // délai de garde : sous un GPU logiciel (SwiftShader) la barrière WebGL2 peut ne jamais se libérer
            const px = await Promise.race([ctx.renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
            if (!px) {
              el.textContent = 'Contrôle de lisibilité : relecture GPU impossible sur cet appareil.';
              (card.mesh.material as unknown as MeshBasicNodeMaterial[])[0] = card.front;
              ctx.renderer.setRenderTarget(null);
              root.children.forEach((o) => (o.visible = true));
              holder.position.x = saved.x;
              card.mesh.rotation.copy(saved.rot);
              I.tilt.value.copy(saved.tilt);
              rt.dispose();
              return;
            }
            shots.push(px as Uint8Array);

          }
          ctx.renderer.setRenderTarget(null);
          const [a, b] = shots;
          for (let i = 0; i < w * h; i++) {
            if (b[i * 4 + 3] < 128) continue;
            const A = rgb2lab(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]);
            const B = rgb2lab(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]);
            all.push(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]));
          }
        }
      (card.mesh.material as unknown as MeshBasicNodeMaterial[])[0] = card.front;
      card.extras.forEach((o) => (o.visible = true));
      holder.position.x = saved.x;
      card.mesh.rotation.copy(saved.rot);
      I.tilt.value.copy(saved.tilt);
      root.children.forEach((o) => (o.visible = true));
      all.sort((x, y) => x - y);
      const mean = all.reduce((s, v) => s + v, 0) / Math.max(1, all.length);
      const p95 = all[Math.floor(all.length * 0.95)] ?? 0;
      // repère : ΔE < 2,3 ≈ imperceptible ; < 10 « même couleur reconnue » ; au-delà, l'effet remplace la couleur
      const verdict = all.length === 0 ? 'pas de sujet détouré' : p95 < 10 ? '✓ lisible' : p95 < 20 ? '≈ limite' : '✗ trop couvrant';
      rows.push(`#${card.def.num} ${card.def.name} : ΔE moyen ${mean.toFixed(1)} · p95 ${p95.toFixed(1)} — ${verdict}`);
      console.info(`[fx] lisibilité #${card.def.num} ${card.def.name} mean=${mean.toFixed(2)} p95=${p95.toFixed(2)} n=${all.length}`);
    }
    rt.dispose();
    el.innerHTML = rows.join('<br>');
  }

  function onPointerMove(e: PointerEvent) {
    const r = ctx.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const hit = ray.intersectObjects(cards.map((c) => c.mesh), false).find((h) => h.uv && h.face?.materialIndex === 0);
    pointerUV = hit?.uv ? hit.uv.clone() : null;
    return hit;
  }
  function onPointerDown(e: PointerEvent) {
    const hit = onPointerMove(e);
    if (!hit?.uv) return;
    // toucher → onde du foil réactif (les 4 plus récentes, la dernière en tête : le niveau Low n'en lit qu'une),
    // trait du « coin lumineux »
    for (let i = I.touches.length - 1; i > 0; i--) I.touches[i].value.copy(I.touches[i - 1].value);
    I.touches[0].value.set(hit.uv.x, hit.uv.y, now(), 1);
    lastTouch = now();
    I.tap.value = now();
    // appui long → carte vivante (effet #31)
    clearTimeout(holdTimer);
    const live = cards.some((c) => c.def.num === 31);
    if (live) holdTimer = window.setTimeout(() => toggleImmersive(), 450);
  }
  function onPointerUp() {
    clearTimeout(holdTimer);
  }
  function toggleImmersive() {
    immersive = !immersive;
    gsap.to(I.immersive, { value: immersive ? 1 : 0, duration: 1.2, ease: 'power2.inOut' });
    const from = stage.camera.position.z;
    fit();
    const to = stage.camera.position.z;
    stage.camera.position.z = from;
    gsap.to(stage.camera.position, { z: to, duration: 1.2, ease: 'power2.inOut' });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      autoQ = c.quality === 'mobile' ? (c.isWebGPU ? 'mid' : 'low') : 'high';
      stage = createStage(c, { bg: ['#1c1a18', '#070606'], env: null, fill: 0.74 });
      tex = createFxTextures();
      tex.list.forEach((t) => c.bag.add(t));
      Object.assign(TEXREF, tex);
      I = createInputs();
      root = new Group();
      stage.scene.add(root);
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      await ensureFonts();
      hud = document.createElement('div');
      hud.className = 'fx043';
      hud.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = `.fx043{position:absolute;left:12px;bottom:12px;max-width:min(560px,calc(100% - 24px));font:12px/1.45 ui-monospace,monospace;color:#e9e2d6;background:rgba(10,9,8,.72);padding:10px 12px;border-radius:8px;pointer-events:none}
.fx043 .fx-tier{color:#bfb5a6;margin-bottom:4px}.fx043 .fx-i{margin-right:8px;opacity:.6}.fx043 .fx-i.on{opacity:1;color:#ffd38a}
.fx043 .fx-name{font-size:14px;color:#fff;margin:2px 0}.fx043 .fx-why{margin-bottom:4px}.fx043 .fx-row b{color:#ffd38a;font-weight:500;margin-right:4px}
.fx043 .fx-perf,.fx043 .fx-q{color:#9fd1a9;margin-top:4px}.fx043 .fx-check{color:#ffd38a;margin-top:4px}`;
      c.overlay.append(style, hud);
      c.canvas.addEventListener('pointermove', onPointerMove);
      c.canvas.addEventListener('pointerdown', onPointerDown);
      c.canvas.addEventListener('pointerup', onPointerUp);
      c.canvas.addEventListener('pointercancel', onPointerUp);
      c.bag.fn(() => {
        c.canvas.removeEventListener('pointermove', onPointerMove);
        c.canvas.removeEventListener('pointerdown', onPointerDown);
        c.canvas.removeEventListener('pointerup', onPointerUp);
        c.canvas.removeEventListener('pointercancel', onPointerUp);
        clearTimeout(holdTimer);
        for (const b of built) b.dispose();
        bloomNode?.dispose();
      });
      fxCtrl = c.gui.add(params, 'effet', names()).name('effet').onChange(() => void build());
      c.gui.add(params, 'vue', ['carte', 'planche']).name('vue').onChange(() => void build());
      c.gui.add(params, 'qualité', ['auto', 'high', 'mid', 'low']).name('qualité').onChange(() => void build());
      c.gui.add(params, 'upscale', ['bilinéaire', 'FSR1']).name('agrandissement (rendu < 100 %)').onChange(() => void build());
      c.gui.add(params, 'bloom').name('bloom').onChange(() => void build());
      c.gui.add(params, 'carte', 0, 12, 1).name('autre carte du palier').onChange(() => void build());
      c.gui.add({ check: () => void readabilityCheck() }, 'check').name('contrôle de lisibilité (ΔE)');
      c.gui.add({ all: () => console.table(EFFECTS.map((e) => ({ n: e.num, palier: e.tier, effet: e.name, coût: e.cost }))) }, 'all').name('liste des 35 (console)');
      await build();
      if (q0.has('check')) void readabilityCheck();
    },
    update(dt, t) {
      frameNo++;
      frames.push(dt * 1000);
      if (frames.length > 180) frames.shift();
      // inclinaison et lumière virtuelle
      I.tilt.value.set(ctx.input.tiltX, ctx.input.tiltY);
      const lx = pointerUV && ctx.input.inside ? pointerUV.x : 0.5 + ctx.input.tiltX * 0.45;
      const ly = pointerUV && ctx.input.inside ? pointerUV.y : 0.55 + ctx.input.tiltY * 0.4;
      I.light.value.lerp(new Vector2(lx, ly), Math.min(1, dt * 8));
      // foil réactif : une onde automatique quand personne ne touche (labo)
      if (cards.some((c) => c.def.num === 35) && now() - lastTouch > 4) {
        lastTouch = now();
        const tp = I.touches[0];
        tp.value.set(0.25 + Math.random() * 0.5, 0.3 + Math.random() * 0.45, now(), 0.8);
      }
      for (const c of cards) {
        applyPose(c.mesh, ctx, immersive ? 0.18 : 0.32);
        if (!ctx.input.inside && !ctx.input.gyroEnabled) c.mesh.rotation.y += Math.sin(t * 0.6) * (immersive ? 0.12 : 0.3);
        c.mesh.traverse((o) => (o.userData.update as ((t: number) => void) | undefined)?.(t));
      }
      post.render();
      // temps GPU (WebGPU : requêtes d'horodatage) ; WebGL2 iOS / Firefox : indisponible (cf. rapport §5)
      const be = (ctx.renderer as unknown as { backend?: { trackTimestamp?: boolean } }).backend;
      if (be?.trackTimestamp && frameNo % 30 === 0)
        void ctx.renderer.resolveTimestampsAsync('render').then((v) => {
          if (typeof v === 'number' && v > 0) gpuMs = v;
        }).catch(() => undefined);
      if (frameNo % 20 === 0) perfLine();
      // mode auto : p95 au-dessus du budget pendant 3 s → un niveau plus bas
      if (params.qualité === 'auto' && !building && frames.length >= 120 && autoQ !== 'low') {
        const s = [...frames].sort((a, b) => a - b);
        const p95 = s[Math.floor(s.length * 0.95)];
        if (p95 > BUDGET_MS) {
          overSince ||= t;
          if (t - overSince > 3) {
            autoQ = autoQ === 'high' ? 'mid' : 'low';
            overSince = 0;
            frames.length = 0;
            console.info(`[fx] p95 ${p95.toFixed(1)} ms > ${BUDGET_MS} ms : qualité auto → ${autoQ}`);
            void build();
          }
        } else overSince = 0;
      }
    },
    resize() {
      fit();
    },
    setRarity() {
      params.effet = Math.min(params.effet, 5);
      // libellés des 5 effets du nouveau palier
      const ctrl = fxCtrl?.options(names()) as { onChange(f: () => void): unknown } | undefined;
      ctrl?.onChange(() => void build());
      fxCtrl = (ctrl as unknown as typeof fxCtrl) ?? fxCtrl;
      immersive = false;
      I.immersive.value = 0;
      void build();
    },
    dispose() {},
  };
}
