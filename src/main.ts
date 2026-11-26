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
sidebar.innerHTML = `<header><div class="brand"><h1>CARD LAB</h1><span class="sub">three.js WebGPU · TSL</span></div><input class="search" type="search" placeholder="Chercher (/)…" spellcheck="false" /><div class="tabs"><button data-tab="actives">Actives <b></b></button><button data-tab="archives">Archives <b></b></button></div></header><nav class="list"></nav><footer></footer>`;
const list = sidebar.querySelector('.list') as HTMLElement;
const sideFooter = sidebar.querySelector('footer') as HTMLElement;
const searchIn = sidebar.querySelector('.search') as HTMLInputElement;
const tabBtns = [...sidebar.querySelectorAll<HTMLButtonElement>('.tabs button')];
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

// ─────────────────────────────────────────── archives (choix par navigateur, par-dessus le défaut du registre)
type Tab = 'actives' | 'archives';
const LS_ARCH = 'cardlab.archive';
const LS_TAB = 'cardlab.tab';
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const archOverrides: Record<string, boolean> = (() => {
  try {
    return JSON.parse(lsGet(LS_ARCH) || '{}') ?? {};
  } catch {
    return {};
  }
})();
const isArchived = (e: RegistryEntry) => archOverrides[e.id] ?? !!e.archived;
function toggleArchive(id: string) {
  const e = registry.find((x) => x.id === id);
  if (!e) return;
  const next = !isArchived(e);
  if (next === !!e.archived) delete archOverrides[id];
  else archOverrides[id] = next;
  lsSet(LS_ARCH, JSON.stringify(archOverrides));
  renderList();
  syncInfoArchive();
}
let tab: Tab = lsGet(LS_TAB) === 'archives' ? 'archives' : 'actives';
function setTab(t: Tab) {
  tab = t;
  lsSet(LS_TAB, t);
  renderList();
  list.scrollTop = 0;
}
tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab as Tab)));
searchIn.addEventListener('input', () => renderList());
searchIn.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') {
    searchIn.value = '';
    searchIn.blur();
    renderList();
  } else if (e.key === 'Enter') {
    const first = list.querySelector<HTMLAnchorElement>('.item');
    if (first) location.hash = first.getAttribute('href')!;
  }
});
/** Actives : la plus récente en haut. Archives : par catégorie, ordre de création. */
const activeEntries = () => registry.filter((e) => !isArchived(e)).reverse();
const archivedEntries = () => registry.filter(isArchived);
/** Ordre de parcours ← → : l'onglet où se trouve l'expérience affichée. */
function navOrder(): RegistryEntry[] {
  const cur = current?.entry;
  const inArch = cur ? isArchived(cur) : tab === 'archives';
  return inArch ? (['A', 'B', 'C', 'D'] as Category[]).flatMap((c) => archivedEntries().filter((e) => e.category === c)) : activeEntries();
}
const nextNumber = () => String(Math.max(...registry.map((e) => parseInt(e.id, 10) || 0)) + 1).padStart(3, '0');
const SLOTS = 3;

// ─────────────────────────────────────────── sidebar
function itemEl(e: RegistryEntry, fbAll: ReturnType<typeof loadFeedback>, showCat: boolean) {
  const a = h('a', `item${isArchived(e) ? ' is-arch' : ''}`) as HTMLAnchorElement;
  a.href = `#/exp/${e.id}`;
  a.dataset.id = e.id;
  const v = fbAll[e.id]?.vote;
  const arch = isArchived(e);
  a.innerHTML = `<div class="row"><span class="id">${e.id.slice(0, 3)}</span>${showCat ? `<span class="c c-${e.category}" title="${CATEGORY_LABELS[e.category]}">${e.category}</span>` : ''}<span class="t">${e.title}</span><span class="v">${v === 1 ? '👍' : v === -1 ? '👎' : fbAll[e.id]?.note ? '✎' : ''}</span><button class="arch" title="${arch ? 'Ressortir des archives' : 'Ranger aux archives'} (A)">${arch ? '⤒' : '⤓'}</button></div><div class="tags">${e.tags
    .map((t) => `<span class="tag">${t}</span>`)
    .join('')}</div>`;
  a.querySelector('.arch')!.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleArchive(e.id);
  });
  a.addEventListener('click', () => sidebar.classList.remove('open'));
  return a;
}
function renderList() {
  const fbAll = loadFeedback();
  const act = activeEntries();
  const arc = archivedEntries();
  tabBtns.forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.querySelector('b')!.textContent = String(b.dataset.tab === 'actives' ? act.length : arc.length);
  });
  list.innerHTML = '';
  const q = searchIn.value.trim().toLowerCase();
  if (q) {
    // recherche : dans les deux onglets à la fois
    const hits = registry.filter((e) => [e.id, e.title, e.blurb, ...e.tags, ...e.tech].join(' ').toLowerCase().includes(q));
    list.append(h('div', 'cat', `${hits.length} résultat${hits.length > 1 ? 's' : ''}`));
    for (const e of [...hits.filter((x) => !isArchived(x)).reverse(), ...hits.filter(isArchived)]) list.append(itemEl(e, fbAll, true));
    if (!hits.length) list.append(h('div', 'empty', 'Rien trouvé. Échap pour effacer.'));
  } else if (tab === 'actives') {
    for (const e of act) list.append(itemEl(e, fbAll, true));
    if (!act.length) list.append(h('div', 'empty', 'Aucune expérience active : ressors-en une des archives (⤒).'));
    // de la place pour les prochaines
    const n = parseInt(nextNumber(), 10);
    list.append(h('div', 'cat', 'Prochaines'));
    for (let i = 0; i < SLOTS; i++) {
      list.append(h('div', 'slot', `<span class="id">${String(n + i).padStart(3, '0')}</span><span>emplacement libre</span>`));
    }
  } else {
    (['A', 'B', 'C', 'D'] as Category[]).forEach((cat) => {
      const entries = arc.filter((e) => e.category === cat);
      if (!entries.length) return;
      list.append(h('div', 'cat', `${CATEGORY_LABELS[cat]} <b>${entries.length}</b>`));
      for (const e of entries) list.append(itemEl(e, fbAll, false));
    });
    if (!arc.length) list.append(h('div', 'empty', 'Archives vides.'));
  }
  markActive();
  sideFooter.innerHTML = `<span>${act.length} actives · ${arc.length} archivées</span><span class="keys"><kbd>←</kbd><kbd>→</kbd> naviguer · <kbd>A</kbd> archiver · <kbd>/</kbd> chercher</span>`;
}
function markActive() {
  list.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.id === current?.entry.id));
  list.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
}
/** Bouton archiver / ressortir dans le panneau d'infos de l'expérience affichée. */
function syncInfoArchive() {
  const b = info.querySelector<HTMLButtonElement>('.arch-btn');
  if (!b || !current) return;
  const arch = isArchived(current.entry);
  b.textContent = arch ? '⤒ Ressortir des archives' : '⤓ Ranger aux archives';
  b.classList.toggle('on', arch);
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
  return registry.find((e) => e.id === id || (id && e.id.startsWith(id)))?.id ?? (activeEntries()[0] ?? registry[registry.length - 1]).id;
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
  info.innerHTML = `<div class="id">${entry.id.toUpperCase()} · ${entry.tech.join(' · ')}</div><div class="title">${entry.title}</div><div class="blurb">${entry.blurb}</div>${entry.hint ? `<div class="hint">${entry.hint}</div>` : ''}<button class="btn arch-btn"></button>`;
  info.querySelector('.arch-btn')!.addEventListener('click', () => toggleArchive(entry.id));
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
    // l'onglet suit l'expérience ouverte (lien direct vers une archivée → onglet Archives)
    const want: Tab = isArchived(entry) ? 'archives' : 'actives';
    if (want !== tab && !searchIn.value) setTab(want);
    markActive();
    syncInfoArchive();
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
  const order = navOrder();
  if (!order.length) return;
  const i = order.findIndex((e) => e.id === current?.entry.id);
  const n = order[i < 0 ? 0 : (i + delta + order.length) % order.length];
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
    else if ((e.key === 'a' || e.key === 'A') && current) toggleArchive(current.entry.id);
    else if (e.key === '/') {
      e.preventDefault();
      sidebar.classList.add('open');
      searchIn.focus();
      searchIn.select();
    }
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
