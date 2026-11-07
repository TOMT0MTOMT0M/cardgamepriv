import './style.css';
import { mountCanalBadge } from './core/canal';
mountCanalBadge(); // (V2) badge « V2 — test » sur le lien admin
// labo : catalogue complet installé d'office, avant toute expérience (le jeu, lui, le charge en deux temps)
import './core/sets/catalogFull';
import { Timer, type WebGPURenderer } from 'three/webgpu';
import GUI from 'lil-gui';
import Stats from 'stats-gl';
import gsap from 'gsap';
import { registry } from './core/registry';
import { CATEGORY_LABELS, type Category, type Experiment, type LabContext, type Quality, type RegistryEntry } from './core/Experiment';
import { Bag } from './core/bag';
import { Input } from './core/input';
import { Sfx } from './core/audio';
import { RARITIES, isRarityId, type RarityId } from './core/rarity';
import {
  applyRendererDefaults,
  backendName,
  createRenderer,
  isTouch,
  preferredBackend,
  preferredDpr,
  preferredQuality,
  resolveDpr,
  savePref,
  setPreferredBackend,
  type DprMode,
} from './core/renderer';
import { exportFeedback, feedbackSynced, loadFeedback, pushFeedback, setFeedback } from './core/feedback';
import { mountNetHud } from './core/net/hud';
import { net } from './core/net/client';

// ─────────────────────────────────────────── DOM
const app = document.getElementById('app')!;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const sidebar = h('aside', 'sidebar');
sidebar.innerHTML = `<header><h1>CARD LAB</h1><div class="sub">three.js WebGPU · TSL</div></header><nav class="list"></nav><footer></footer>`;
const list = sidebar.querySelector('.list') as HTMLElement;
const sideFooter = sidebar.querySelector('footer') as HTMLElement;
const stage = h('main', 'stage');
const canvasHost = h('div');
const overlay = h('div', 'overlay');
const toolbar = h('div', 'toolbar');
const info = h('div', 'info');
const fb = h('div', 'fb');
const loading = h('div', 'loading', 'chargement…');
stage.append(canvasHost, overlay, toolbar, info, fb, loading);
app.append(sidebar, stage);

// ─────────────────────────────────────────── état
const LS_RARITY = 'cardlab.rarity';
let rarityId: RarityId = (() => {
  const q = new URLSearchParams(location.search).get('rarity');
  if (isRarityId(q)) return q;
  try {
    const v = localStorage.getItem(LS_RARITY);
    if (isRarityId(v)) return v;
  } catch {
    /* ignore */
  }
  return 'legendary';
})();
let dprMode: DprMode = preferredDpr();
let quality: Quality = preferredQuality();
const backend = preferredBackend();

let renderer!: WebGPURenderer;
let input!: Input;
const sfx = new Sfx();
// temps réel strict : les timelines ne ralentissent pas quand le framerate chute
gsap.ticker.lagSmoothing(0);
const timer = new Timer();
timer.connect(document);
let current: { entry: RegistryEntry; exp: Experiment; ctx: LabContext; ready: boolean } | null = null;
let loadToken = 0;
let captureRequested = false;
let gui!: GUI;
let stats: Stats | null = null;
let fps = 0;
let fpsAcc = 0;
let fpsN = 0;

// ─────────────────────────────────────────── sidebar
function renderList() {
  const fbAll = loadFeedback();
  list.innerHTML = '';
  (['A', 'B', 'C', 'D'] as Category[]).forEach((cat) => {
    const entries = registry.filter((e) => e.category === cat);
    if (!entries.length) return;
    list.append(h('div', 'cat', CATEGORY_LABELS[cat]));
    for (const e of entries) {
      const a = h('a', 'item') as HTMLAnchorElement;
      a.href = `#/exp/${e.id}`;
      a.dataset.id = e.id;
      const v = fbAll[e.id]?.vote;
      a.innerHTML = `<div class="row"><span class="id">${e.id.slice(0, 3)}</span><span class="t">${e.title}</span><span class="v">${v === 1 ? '👍' : v === -1 ? '👎' : fbAll[e.id]?.note ? '✎' : ''}</span></div><div class="tags">${e.tags
        .map((t) => `<span class="tag">${t}</span>`)
        .join('')}</div>`;
      a.addEventListener('click', () => sidebar.classList.remove('open'));
      list.append(a);
    }
  });
  markActive();
  sideFooter.textContent = `${registry.length} expériences · ← → pour naviguer`;
}
function markActive() {
  list.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.id === current?.entry.id));
}

/** Téléphone : le panneau des réglages se place sous la barre d'outils (qui tient sur 2 ou 3 lignes selon l'écran). */
function placeGui() {
  if (!gui) return;
  const el = gui.domElement;
  if (window.innerWidth > 760) return void el.style.removeProperty('top');
  el.style.setProperty('top', `${Math.round(toolbar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 8)}px`, 'important');
}

// ─────────────────────────────────────────── toolbar
const btn = (label: string, title: string, onClick: () => void, cls = '') => {
  const b = h('button', `btn ${cls}`, label) as HTMLButtonElement;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
};
const menuBtn = btn('☰', 'Liste des expériences', () => sidebar.classList.toggle('open'), 'menu-btn');
const replayBtn = btn('⟲ Replay', 'Rejouer (R)', () => replay());
const rarBox = h('div', 'rar');
const rarButtons = RARITIES.map((r, i) => {
  const b = h('button', '', `<i style="background:${r.hex}"></i>`) as HTMLButtonElement;
  b.title = `${r.label} (${i + 1})`;
  b.addEventListener('click', () => setRarity(r.id));
  rarBox.append(b);
  return b;
});
const backendBtn = btn(backend === 'webgl' ? '⇄ WebGPU' : '⇄ WebGL2', 'Forcer l’autre backend (recharge la page)', () => {
  setPreferredBackend(backend === 'webgl' ? 'webgpu' : 'webgl');
  const u = new URL(location.href);
  u.searchParams.delete('backend');
  location.href = u.toString();
});
const dprSel = h('select', 'btn desk') as HTMLSelectElement;
dprSel.title = 'Device pixel ratio';
(['auto', '1', '1.5', '2', 'native'] as DprMode[]).forEach((m) => dprSel.append(new Option(m === 'auto' ? 'DPR auto' : `DPR ${m}`, m)));
dprSel.value = dprMode;
dprSel.addEventListener('change', () => {
  dprMode = dprSel.value as DprMode;
  savePref('dpr', dprMode);
  resize();
});
const mobileBtn = btn('📱 Mobile', 'Preset mobile : DPR ≤ 1.5, moins de particules, effets allégés', () => {
  quality = quality === 'mobile' ? 'high' : 'mobile';
  savePref('quality', quality);
  mobileBtn.classList.toggle('on', quality === 'mobile');
  resize();
  void reload();
});
mobileBtn.classList.toggle('on', quality === 'mobile');
const capBtn = btn('📷', 'Capture PNG (P)', () => (captureRequested = true));
const gyroBtn = btn('🧭 Gyro', 'Activer le gyroscope', async () => {
  const ok = await input.enableGyro();
  gyroBtn.classList.toggle('on', ok);
  if (!ok) gyroBtn.textContent = '🧭 refusé';
});
if (!isTouch()) gyroBtn.style.display = 'none';
const sndBtn = btn('🔈', 'Son (Web Audio généré)', async () => {
  if (sfx.enabled) sfx.disable();
  else await sfx.enable();
  sndBtn.textContent = sfx.enabled ? '🔊' : '🔈';
  sndBtn.classList.toggle('on', sfx.enabled);
});
const statsHost = h('div', 'stats-host desk');
const backendLabel = h('span', 'btn desk', '');
backendLabel.style.pointerEvents = 'none';
// téléphone : masquer le panneau d'infos (bas gauche) et la pile de boutons (haut gauche) pour voir la scène en entier
const LS_MIN = 'cardlab.mobileMin';
const minBtn = btn('', 'Masquer / afficher les panneaux', () => setMin(!document.body.classList.contains('mobile-min')), 'min-btn');
function setMin(on: boolean) {
  document.body.classList.toggle('mobile-min', on);
  minBtn.textContent = on ? '▸ Infos' : '◂ Masquer';
  if (on) gui?.close();
  try {
    localStorage.setItem(LS_MIN, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
setMin((() => {
  try {
    return localStorage.getItem(LS_MIN) === '1';
  } catch {
    return false;
  }
})());
const gameLink = h('a', 'btn', '▶ Le jeu') as HTMLAnchorElement;
gameLink.href = './jeu/';
gameLink.title = 'La page de jeu : boutique, ouverture, collection, échanges';
toolbar.append(menuBtn, minBtn, replayBtn, gameLink, rarBox, backendBtn, dprSel, mobileBtn, capBtn, gyroBtn, sndBtn, h('span', 'spacer'), backendLabel, statsHost);
mountNetHud(toolbar, stage);

function syncRarityButtons() {
  rarButtons.forEach((b, i) => b.classList.toggle('on', RARITIES[i].id === rarityId));
}

// ─────────────────────────────────────────── feedback
fb.innerHTML = `<div class="row"><button class="btn vote up" title="J'aime">👍</button><button class="btn vote down" title="Bof">👎</button><button class="btn exp" title="Exporter tous les retours dans un fichier">Export JSON</button><button class="btn push" title="Envoyer tous tes retours à Tom (en ligne). Ensuite, chaque modification part toute seule.">☁ Envoyer</button><span class="count"></span></div><textarea placeholder="Ton avis…"></textarea><div class="sync"></div>`;
const upB = fb.querySelector('.up') as HTMLButtonElement;
const downB = fb.querySelector('.down') as HTMLButtonElement;
const noteT = fb.querySelector('textarea') as HTMLTextAreaElement;
const countS = fb.querySelector('.count') as HTMLElement;
if (isTouch()) fb.classList.add('collapsed');
fb.querySelector('.count')!.addEventListener('click', () => fb.classList.toggle('collapsed'));
function syncFeedback() {
  if (!current) return;
  const all = loadFeedback();
  const e = all[current.entry.id];
  upB.classList.toggle('on', e?.vote === 1);
  downB.classList.toggle('on', e?.vote === -1);
  noteT.value = e?.note ?? '';
  const rated = Object.values(all).filter((x) => x.vote !== 0 || x.note).length;
  countS.textContent = `${rated}/${registry.length} ✎`;
}
const vote = (v: 1 | -1) => {
  if (!current) return;
  const prev = loadFeedback()[current.entry.id]?.vote ?? 0;
  setFeedback(current.entry.id, { vote: prev === v ? 0 : v });
  syncFeedback();
  renderList();
  autoPush();
};
upB.addEventListener('click', () => vote(1));
downB.addEventListener('click', () => vote(-1));
let noteTimer = 0;
noteT.addEventListener('input', () => {
  clearTimeout(noteTimer);
  const id = current?.entry.id;
  noteTimer = window.setTimeout(() => {
    if (id) setFeedback(id, { note: noteT.value });
    renderList();
    syncFeedback();
    autoPush();
  }, 350);
});
noteT.addEventListener('keydown', (e) => e.stopPropagation());
// ── envoi en ligne des retours (serveur Convex) : bouton, puis synchro automatique après chaque modification
const pushB = fb.querySelector('.push') as HTMLButtonElement;
const syncS = fb.querySelector('.sync') as HTMLElement;
let pushTimer = 0;
async function pushNow(manual: boolean) {
  if (!net.state.configured) {
    syncS.textContent = 'serveur non configuré : utilise Export JSON';
    return;
  }
  pushB.disabled = true;
  syncS.textContent = 'envoi…';
  try {
    const r = await pushFeedback(
      registry,
      { backend: backendName(renderer), userAgent: navigator.userAgent, quality, dpr: renderer.getPixelRatio() },
      (a) => net.pushLabFeedback(a),
      net.state.user?.displayName ?? '',
    );
    syncS.textContent = `✓ envoyé à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (${r.kept} retour${r.kept > 1 ? 's' : ''})`;
    syncS.className = 'sync ok';
    pushB.textContent = '☁ Envoyé';
  } catch (e) {
    syncS.textContent = `échec de l’envoi${manual ? ' : ' + ((e as Error)?.message ?? e) : ', nouvel essai à la prochaine modification'}`;
    syncS.className = 'sync err';
  } finally {
    pushB.disabled = false;
  }
}
pushB.addEventListener('click', () => void pushNow(true));
/** Après le premier envoi, chaque vote / note repart tout seul (3 s après la dernière frappe). */
function autoPush() {
  if (!feedbackSynced()) return;
  clearTimeout(pushTimer);
  syncS.textContent = 'modifié…';
  syncS.className = 'sync';
  pushTimer = window.setTimeout(() => void pushNow(false), 3000);
}
if (feedbackSynced()) {
  pushB.textContent = '☁ Envoyé';
  syncS.textContent = 'synchronisé automatiquement';
}
fb.querySelector('.exp')!.addEventListener('click', () =>
  exportFeedback(registry, { backend: backendName(renderer), userAgent: navigator.userAgent, quality, dpr: renderer.getPixelRatio() }),
);

// ─────────────────────────────────────────── cycle de vie des expériences
function currentId(): string {
  const q = new URLSearchParams(location.search).get('exp');
  if (q) {
    const found = registry.find((e) => e.id === q || e.id.startsWith(q));
    if (found) return found.id;
  }
  const m = location.hash.match(/#\/exp\/([\w-]+)/);
  const id = m?.[1];
  return registry.find((e) => e.id === id || (id && e.id.startsWith(id)))?.id ?? registry[0].id;
}

function size() {
  const r = stage.getBoundingClientRect();
  return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
}

function resize() {
  if (!renderer) return;
  const { w, h: hh } = size();
  renderer.setPixelRatio(resolveDpr(dprMode, quality));
  renderer.setSize(w, hh, false);
  if (current) {
    current.ctx.width = w;
    current.ctx.height = hh;
    current.exp.resize?.(w, hh);
  }
}

function teardown() {
  if (!current) return;
  const { exp, ctx } = current;
  try {
    exp.dispose();
  } catch (e) {
    console.error('[lab] dispose', e);
  }
  ctx.bag.disposeAll();
  ctx.gui.destroy();
  overlay.innerHTML = '';
  current = null;
}

async function load(id: string) {
  const token = ++loadToken;
  const entry = registry.find((e) => e.id === id);
  if (!entry) return;
  if (location.hash !== `#/exp/${entry.id}`) {
    history.replaceState(null, '', `#/exp/${entry.id}`);
  }
  teardown();
  input.reset();
  applyRendererDefaults(renderer);
  stage.querySelector('.error')?.remove();
  loading.style.display = 'grid';
  info.innerHTML = `<div class="id">${entry.id.toUpperCase()} · ${entry.tech.join(' · ')}</div><div class="title">${entry.title}</div><div class="blurb">${entry.blurb}</div>${entry.hint ? `<div class="hint">${entry.hint}</div>` : ''}`;
  markActive();
  try {
    const mod = await entry.load();
    if (token !== loadToken) return;
    const exp = mod.default();
    const { w, h: hh } = size();
    const ctx: LabContext = {
      renderer,
      canvas: renderer.domElement,
      gui: gui.addFolder(entry.title),
      rarity: rarityId,
      quality,
      input,
      bag: new Bag(),
      overlay,
      isWebGPU: backendName(renderer) === 'WebGPU',
      width: w,
      height: hh,
      sfx,
    };
    current = { entry, exp, ctx, ready: false };
    markActive();
    syncFeedback();
    await exp.setup(ctx);
    if (token !== loadToken) return;
    current.ready = true;
    if (isTouch()) gui.close();
    // expérience sans réglage : pas de dossier « Empty » ni de panneau vide
    const hasCtl = ctx.gui.controllersRecursive().length > 0;
    if (!hasCtl) ctx.gui.hide();
    gui.domElement.style.display = hasCtl ? '' : 'none';
    placeGui();
    loading.style.display = 'none';
  } catch (err) {
    console.error('[lab] setup failed', err);
    loading.style.display = 'none';
    const e = h('div', 'error', `Erreur dans ${entry.id}\n\n${(err as Error)?.stack ?? err}`);
    stage.append(e);
  }
}

async function reload() {
  if (current) await load(current.entry.id);
}

function replay() {
  if (!current?.ready) return;
  if (current.exp.replay) current.exp.replay();
  else void reload();
}

function setRarity(r: RarityId) {
  rarityId = r;
  try {
    localStorage.setItem(LS_RARITY, r);
  } catch {
    /* ignore */
  }
  syncRarityButtons();
  if (!current) return;
  current.ctx.rarity = r;
  if (current.exp.setRarity && current.ready) current.exp.setRarity(r);
  else void reload();
}

function go(delta: number) {
  const i = registry.findIndex((e) => e.id === current?.entry.id);
  const n = registry[(i + delta + registry.length) % registry.length];
  location.hash = `#/exp/${n.id}`;
}

// ─────────────────────────────────────────── boucle
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();
  input.update(dt);
  fpsAcc += timer.getDelta();
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  if (current?.ready) {
    try {
      current.exp.update(dt, t);
    } catch (e) {
      console.error('[lab] update', e);
      current.ready = false;
    }
    if (captureRequested) {
      captureRequested = false;
      const id = current.entry.id;
      renderer.domElement.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${id}-${rarityId}-${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    }
  }
  stats?.update();
}

// ─────────────────────────────────────────── démarrage
async function boot() {
  if (new URLSearchParams(location.search).has('clean')) document.body.classList.add('clean');
  renderer = await createRenderer(backend, { timestamps: true }); // (labo : 043 lit les temps GPU)
  const canvas = renderer.domElement;
  canvas.className = 'gl';
  canvasHost.append(canvas);
  backendLabel.textContent = backendName(renderer);
  if (backend === 'webgpu' && backendName(renderer) !== 'WebGPU') backendLabel.textContent = 'WebGL2 (fallback)';
  input = new Input(canvas);
  gui = new GUI({ title: 'Réglages' });
  try {
    if (new URLSearchParams(location.search).has('nostats')) throw new Error('désactivé (?nostats)');
    stats = new Stats({ trackGPU: true, trackCPT: true, horizontal: true, minimal: false });
    await stats.init(renderer);
    statsHost.append(stats.dom);
  } catch (e) {
    console.warn('[lab] stats-gl indisponible', e);
    stats = null;
  }
  resize();
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(placeGui).observe(toolbar);
  syncRarityButtons();
  renderList();
  window.addEventListener('hashchange', () => void load(currentId()));
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R') replay();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'p' || e.key === 'P') captureRequested = true;
    else if (/^[1-9]$/.test(e.key) && RARITIES[+e.key - 1]) setRarity(RARITIES[+e.key - 1].id);
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
  });
  renderer.setAnimationLoop(frame);
  await load(currentId());

  // crochet d'automatisation (tests Playwright)
  (window as unknown as { __lab: unknown }).__lab = {
    get ready() {
      return !!current?.ready;
    },
    get id() {
      return current?.entry.id;
    },
    get fps() {
      return fps;
    },
    backend: () => backendName(renderer),
    ids: () => registry.map((e) => e.id),
    goto: (id: string) => load(id),
    replay,
    setRarity,
    tap: (x = 0, y = 0) => (input as unknown as { taps: Set<(x: number, y: number, e: unknown) => void> }).taps.forEach((f) => f(x, y, {})),
    memory: () => ({ ...renderer.info.memory }),
    info: () => ({ render: { ...renderer.info.render }, memory: { ...renderer.info.memory } }),
    net,
  };
}

boot().catch((e) => {
  console.error(e);
  loading.textContent = `Impossible d'initialiser le renderer : ${e}`;
});
