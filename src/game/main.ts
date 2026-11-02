import './style.css';
import { createShell, soundOn, soundVolume, type Shell } from './shell';
import { createOpeningScene } from './scenes/opening';
import { createViewerScene, type ViewerScene } from './scenes/viewer';
import { createShopView } from './views/shop';
import { createCollectionView } from './views/collection';
import { createTradesView } from './views/trades';
import { createContractsView } from './views/contracts';
import { createProfileView } from './views/profile';
import { createMissions, MISSION_ICON } from './views/missions';
import { createStatus, PITY_ICON, STREAK_ICON } from './views/status';
import { createLocalBackend } from './localBackend';
import { createOnlineBackend, onlineConfigured } from './onlineBackend';
import { collectionSig, liveRegen, type GameBackend } from './backend';
import { PACK_CAP, PACK_REGEN_MS, fmtCountdown } from '../core/packRegen';
import { esc, h, loadSeen, toast } from './ui';
import { preloadOwned } from './preload';

/**
 * LE JEU (page /jeu/) : boutique + ouverture 3D, collection, échanges.
 * Serveur : Convex + Discord si `VITE_CONVEX_URL` est configuré, sinon (ou avec `?demo`) mode démo hors-ligne.
 */
const params = new URLSearchParams(location.search);
const backend: GameBackend = onlineConfigured() && !params.has('demo') ? createOnlineBackend() : createLocalBackend();

const app = document.getElementById('app')!;
const glHost = h('div', 'gl-host');
const sceneOverlays = h('div', 'scene-overlays');
const top = h('header', 'topbar');
const viewHost = h('main', 'views');
// l'écran de chargement est déjà dans la page (jeu/index.html) : on le reprend tel quel, sans le recréer
const loader =
  app.querySelector<HTMLElement>('.loader') ??
  h('div', 'loader', '<div class="l-logo">BÉBOU</div><div class="l-bar"><i></i></div><div class="l-txt">préparation des effets…</div><div class="l-tip"></div>');
// chargement un peu long (téléphone modeste, première visite) : une astuce s'affiche, puis une autre
const TIPS = [
  'Astuce : maintiens le doigt sur le booster pour brûler l’emballage.',
  'Une carte secrète se cache peut-être dans le Bebou Pack…',
  'Tes doublons valent de l’or : brûle-les en contrat ou échange-les.',
  'Un nouveau booster toutes les 5 minutes, jusqu’à 15 en réserve.',
  'Touche une carte de ta collection pour la voir en grand et la faire tourner.',
  'La lumière qui fuit de l’emballage annonce la meilleure carte du paquet.',
];
{
  const tip = loader.querySelector<HTMLElement>('.l-tip')!;
  let i = Math.floor(Math.random() * TIPS.length);
  const next = () => {
    if (!loader.isConnected || loader.classList.contains('done')) return;
    tip.classList.remove('on');
    setTimeout(() => {
      tip.textContent = TIPS[i++ % TIPS.length];
      tip.classList.add('on');
    }, 250);
    setTimeout(next, 4200);
  };
  setTimeout(next, 1400);
}
// (l'écran de chargement reste en place et au-dessus : déplacé, son reflet animé repartirait de zéro)
if (loader.parentElement === app) app.prepend(glHost, sceneOverlays, viewHost, top);
else app.append(glHost, sceneOverlays, viewHost, top, loader);

top.innerHTML = `
  <a class="logo" href="#/">BÉBOU<span>cartes</span></a>
  <nav>
    <a href="#/" data-r="">Boutique</a>
    <a href="#/collection" data-r="collection">Collection</a>
    <a href="#/contrats" data-r="contrats">Contrats</a>
    <a href="#/echanges" data-r="echanges">Échanges<b class="badge" hidden></b></a>
    <i class="nav-pill" aria-hidden="true"></i>
  </nav>
  <div class="me"></div>`;
const meEl = top.querySelector<HTMLElement>('.me')!;
const tradeBadge = top.querySelector<HTMLElement>('.badge')!;
// cartes obtenues depuis la dernière visite de la collection : pastille dorée sur l'onglet
const freshBadge = h('b', 'badge fresh-badge');
freshBadge.hidden = true;
freshBadge.title = 'Nouvelles cartes depuis ta dernière visite';
top.querySelector('nav a[data-r="collection"]')!.append(freshBadge);

// l'indicateur d'onglet glisse d'une page à l'autre (au lieu de sauter)
const navEl = top.querySelector<HTMLElement>('nav')!;
const pill = top.querySelector<HTMLElement>('.nav-pill')!;
function placePill(animate = true) {
  const a = navEl.querySelector<HTMLElement>('a.on');
  if (!a) return void pill.classList.remove('on'); // profil : aucun onglet
  if (!animate) pill.style.transition = 'none';
  pill.style.width = `${a.offsetWidth}px`;
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
  pill.classList.add('on');
  if (!animate) {
    void pill.offsetWidth;
    pill.style.transition = '';
  }
}
// largeur des onglets : change avec la police (chargée après coup), une pastille, la taille de l'écran
new ResizeObserver(() => placePill(false)).observe(navEl);
void document.fonts?.ready.then(() => placePill(false));

let freshSig = '';
function updateFresh(force = false) {
  const sig = collectionSig(backend.state);
  if (!force && sig === freshSig) return;
  freshSig = sig;
  const seen = loadSeen();
  let n = 0;
  if (seen && currentRoute !== 'collection') for (const id of new Set(backend.state.collection.map((c) => c.cardId))) if (!seen.has(id)) n++;
  const was = freshBadge.hidden ? 0 : Number(freshBadge.dataset.n);
  freshBadge.hidden = n === 0;
  freshBadge.dataset.n = String(n);
  freshBadge.textContent = n > 99 ? '99+' : String(n);
  if (n !== was) placePill(false);
}

/**
 * Icônes de l'en-tête dessinées (et non des émojis, qui changent d'allure d'un téléphone à l'autre) : un haut-parleur
 * dont les ondes laissent place à une croix quand on coupe le son, et un petit booster pour la réserve.
 */
const SND_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.4h3.3L12 5.6v12.8l-4.7-3.8H4z" fill="currentColor" fill-opacity=".16"/><path class="w1" d="M15.4 9.3a3.9 3.9 0 0 1 0 5.4"/><path class="w2" d="M18 6.8a7.4 7.4 0 0 1 0 10.4"/><path class="x" d="M16 9.6l4.8 4.8M20.8 9.6 16 14.4"/></svg>`;
const PACK_ICON = `<svg class="p-ico" viewBox="0 0 16 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M3 4h10v12H3z" fill="currentColor" fill-opacity=".16" stroke-width="1.2"/><path d="M3 4l1.25-2L5.5 4l1.25-2L8 4l1.25-2L10.5 4l1.25-2L13 4M3 16l1.25 2 1.25-2 1.25 2L8 16l1.25 2 1.25-2 1.25 2L13 16" stroke-width="1.05"/><circle cx="8" cy="10" r="2.1" fill="currentColor" stroke="none"/></svg>`;

let meSig = '';
let lastIncoming = -1;
let volT = 0;
function renderMe() {
  const s = backend.state;
  const u = s.user;
  // l'en-tête n'est refait que si ce qu'il affiche change (pas à chaque présence d'ami ou ligne du fil)
  const sig = JSON.stringify([s.mode, s.authError, u?.id, u?.name, u?.avatarUrl, u?.packStored, u?.packRegenAt, s.trades.incoming.length]);
  if (sig === meSig) return;
  meSig = sig;
  const demo = s.mode === 'demo' ? `<span class="demo" title="Pas de serveur configuré (ou ?demo) : la collection est stockée dans ce navigateur, les amis sont des robots.">démo hors-ligne</span>` : '';
  // son : le bouton coupe / remet, le curseur à côté règle le volume (il se déplie au survol ou au toucher du bouton)
  const snd = `<span class="snd-wrap"><button class="icon snd${soundOn() ? '' : ' off'}" title="${soundOn() ? 'Couper le son' : 'Activer le son'}" aria-label="Son" aria-pressed="${soundOn()}">${SND_ICON}</button><span class="vol-pop"><input class="vol" type="range" min="0" max="100" step="5" value="${Math.round(soundVolume() * 100)}" aria-label="Volume"><b class="vol-n">${Math.round(soundVolume() * 100)}</b></span></span>`;
  if (!u) {
    meEl.innerHTML = `${demo}${snd}${s.mode === 'online' ? `<button class="btn-primary login">Connexion Discord</button>` : ''}${s.authError ? `<span class="err">${esc(s.authError)}</span>` : ''}`;
  } else {
    const ava = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : `<span class="ava">${esc(u.name.slice(0, 1))}</span>`;
    meEl.innerHTML = `${demo}<a class="packs" href="#/" title="1 booster toutes les ${PACK_REGEN_MS / 60000} minutes, jusqu'à ${PACK_CAP} en réserve · ouvrir à la boutique">${PACK_ICON}<span class="p-txt"><span class="p-n"><b></b>/${PACK_CAP}</span><span class="p-next"></span></span><i class="p-bar"><i></i></i></a><button class="icon msn-btn" title="Missions du jour" aria-label="Missions du jour">${MISSION_ICON}<b class="msn-n" hidden></b></button><button class="icon st-btn" title="Série de connexion" aria-label="Série de connexion">${STREAK_ICON}<b class="st-n"></b></button><button class="icon pt-btn" title="Pity 6★ : boosters avant un 6★ garanti" aria-label="Pity 6★">${PITY_ICON}<b class="pt-n"></b></button>${snd}<button class="user${currentRoute === 'profil' ? ' on' : ''}" title="Mon profil · ${esc(u.name)}" aria-label="Mon profil">${ava}</button>`;
    tickPacks();
  }
  meEl.querySelector('.login')?.addEventListener('click', () => backend.login());
  meEl.querySelector('.snd')?.addEventListener('click', (e) => {
    const on = !soundOn();
    (shell as Shell & { setSound(on: boolean): void }).setSound(on);
    const b = e.currentTarget as HTMLElement;
    b.classList.toggle('off', !on); // les ondes s'effacent, la croix apparaît (et l'inverse)
    b.title = on ? 'Couper le son' : 'Activer le son';
    b.setAttribute('aria-pressed', String(on));
    // téléphone : un toucher ouvre aussi le curseur un instant
    const w = b.closest<HTMLElement>('.snd-wrap');
    w?.classList.add('open');
    clearTimeout(volT);
    volT = window.setTimeout(() => w?.classList.remove('open'), 2600);
  });
  const vol = meEl.querySelector<HTMLInputElement>('.vol');
  vol?.style.setProperty('--v', vol.value);
  vol?.addEventListener('input', () => {
    vol.style.setProperty('--v', vol.value);
    const v = Number(vol.value) / 100;
    (shell as Shell & { setVolume(v: number): void }).setVolume(v);
    meEl.querySelector('.vol-n')!.textContent = String(Math.round(v * 100));
    const b = meEl.querySelector<HTMLElement>('.snd')!;
    // volume remonté alors que le son était coupé : on le remet
    if (v > 0 && !soundOn()) b.click();
    clearTimeout(volT);
    volT = window.setTimeout(() => b.closest('.snd-wrap')?.classList.remove('open'), 2600);
  });
  vol?.addEventListener('change', () => shell?.sfx.tick(1.2, 0.08));
  meEl.querySelector('.user')?.addEventListener('click', () => (location.hash = '#/profil'));
  meEl.querySelector('.msn-btn')?.addEventListener('click', () => missions?.toggle());
  meEl.querySelector('.st-btn')?.addEventListener('click', () => status?.toggle('streak'));
  meEl.querySelector('.pt-btn')?.addEventListener('click', () => status?.toggle('pity'));
  syncMissionBadge();
  syncStatus();
  const n = s.trades.incoming.length;
  const badgeChanged = tradeBadge.hidden !== (n === 0) || tradeBadge.textContent !== String(n);
  tradeBadge.hidden = n === 0;
  tradeBadge.textContent = String(n);
  if (badgeChanged) placePill(false);
  // un ami vient de proposer un échange (et on n'est pas déjà sur la page des échanges) : petit message
  if (lastIncoming >= 0 && n > lastIncoming && currentRoute !== 'echanges') {
    const t = s.trades.incoming[s.trades.incoming.length - 1];
    toast(`${t?.fromName ?? 'Un ami'} te propose un échange → Échanges`, 'info');
  }
  lastIncoming = n;
}
/** Missions du jour (panneau sous la cible de l'en-tête) ; créées une fois la 3D prête (sons). */
let missions: ReturnType<typeof createMissions> | null = null;
function syncMissionBadge() {
  const b = meEl.querySelector<HTMLElement>('.msn-n');
  if (!b) return;
  const n = missions?.ready() ?? 0;
  b.hidden = n === 0;
  b.textContent = String(n);
  meEl.querySelector('.msn-btn')?.classList.toggle('ready', n > 0);
}
backend.onChange(syncMissionBadge);
/** Série de connexion + pity (status.ts) ; créés une fois la 3D prête (sons). */
let status: ReturnType<typeof createStatus> | null = null;
function syncStatus() {
  const st = meEl.querySelector<HTMLElement>('.st-btn');
  const pt = meEl.querySelector<HTMLElement>('.pt-btn');
  if (!st || !pt || !status) return;
  const sk = status.streak();
  st.querySelector('.st-n')!.textContent = `${sk.day}/7`;
  st.classList.toggle('ready', sk.claimable);
  st.title = sk.claimable ? 'Série de 7 jours : récompense à réclamer !' : `Série de connexion · jour ${sk.day}/7`;
  const left = status.pityLeft();
  pt.querySelector('.pt-n')!.textContent = String(left);
  pt.classList.toggle('ready', left === 0);
  pt.title = left === 0 ? 'Ton prochain booster contient un 6★ sûr !' : `Pity 6★ : encore ${left} booster${left > 1 ? 's' : ''} avant un 6★ garanti`;
}
backend.onChange(syncStatus);
/** N'écrit dans le DOM que si le texte change (le compteur tourne chaque seconde). */
const setText = (e: Element, t: string) => {
  if (e.textContent !== t) e.textContent = t;
};
/** Réserve de boosters + compte à rebours du prochain (1 / 5 min, 15 max), mis à jour chaque seconde sans tout redessiner. */
let lastBalance = -1;
function tickPacks() {
  const u = backend.state.user;
  const el = meEl.querySelector<HTMLElement>('.packs');
  if (!u || !el) return;
  const now = Date.now();
  const r = liveRegen(u, now);
  setText(el.querySelector('b')!, String(r.balance));
  // au-dessus du plafond (cadeau, ancien solde) : « 40 » tout court, pas « 40/15 »
  el.classList.toggle('over', r.balance > PACK_CAP);
  el.classList.toggle('full', r.nextAt === null);
  el.classList.toggle('empty', r.balance <= 0);
  setText(el.querySelector<HTMLElement>('.p-next')!, r.nextAt === null ? 'réserve pleine' : `+1 dans ${fmtCountdown(r.nextAt - now)}`);
  const fill = el.querySelector<HTMLElement>('.p-bar > i')!;
  const gained = lastBalance >= 0 && r.balance > lastBalance;
  // un booster vient d'arriver (ou l'en-tête vient d'être refait) : la barre se place d'un coup, sans animation
  const snap = gained || !fill.style.transform;
  if (snap) fill.style.transition = 'none';
  // échelle plutôt que largeur : animation composée, pas de recalcul de mise en page chaque seconde
  fill.style.transform = `scaleX(${r.nextAt === null ? 1 : Math.min(1, (now - r.regenAt) / PACK_REGEN_MS).toFixed(4)})`;
  if (snap) {
    void fill.offsetWidth;
    fill.style.transition = '';
  }
  if (gained) {
    el.classList.remove('gain');
    void el.offsetWidth;
    el.classList.add('gain'); // petit pop quand un booster arrive
    // on attendait (réserve vide) : on le dit, même depuis une autre page
    if (lastBalance === 0 && document.visibilityState === 'visible') toast('Un booster vient d’arriver : il t’attend à la boutique !', 'ok');
  }
  if (r.balance !== lastBalance) {
    lastBalance = r.balance;
    updateTitle();
    // la boutique (bouton « Ouvrir », réserve) se met à jour quand un booster arrive
    window.dispatchEvent(new CustomEvent('bebou:packs', { detail: r.balance }));
  }
}
setInterval(tickPacks, 1000);

let shell: Shell;

// plus de réseau (métro, avion…) : un bandeau discret le dit, au lieu d'erreurs incompréhensibles
const offlinePill = h('div', 'offline-pill', 'Pas de réseau · on reprend dès que ça revient');
offlinePill.setAttribute('role', 'status');
document.body.append(offlinePill);
const syncOnline = () => document.body.classList.toggle('offline', !navigator.onLine);
window.addEventListener('online', () => (syncOnline(), toast('Réseau retrouvé', 'ok')));
window.addEventListener('offline', syncOnline);
syncOnline();

let currentRoute = '';
/** Titre de l'onglet : la page, précédée du nombre de boosters prêts (« (3) Bébou — boutique »). */
function updateTitle() {
  const u = backend.state.user;
  const n = u ? liveRegen(u).balance : 0;
  const t = `${n > 0 ? `(${n}) ` : ''}${TITLES[currentRoute] ?? TITLES['']}`;
  if (document.title !== t) document.title = t;
}
/** Titre de l'onglet du navigateur selon la page. */
const TITLES: Record<string, string> = {
  '': 'Bébou — boutique',
  collection: 'Bébou — collection',
  contrats: 'Bébou — contrats',
  echanges: 'Bébou — échanges',
  profil: 'Bébou — profil',
};

async function boot() {
  const bar = loader.querySelector<HTMLElement>('.l-bar i')!;
  const step = (pct: number, txt: string) => {
    bar.style.width = `${pct}%`;
    loader.querySelector<HTMLElement>('.l-txt')!.textContent = txt;
  };
  step(15, 'démarrage de la 3D…');
  shell = await createShell(glHost, sceneOverlays);
  step(35, 'impression des boosters…');
  // scène d'ouverture = vitrine de la boutique : montée (et ses shaders compilés pour toutes les raretés) avant tout
  const opening = await shell.mount('opening', createOpeningScene());
  step(85, 'mise en place…');

  let viewerP: Promise<ViewerScene> | null = null;
  const getViewer = () => (viewerP ??= shell.mount('viewer', createViewerScene()));

  const shop = createShopView(backend, shell, opening, (r) => (location.hash = `#/${r}`), getViewer);
  const coll = createCollectionView(backend, shell, getViewer);
  const trades = createTradesView(backend, shell, getViewer);
  const contracts = createContractsView(backend, shell, getViewer);
  const profile = createProfileView(backend, shell, getViewer, () => {
    void backend.logout().then(() => (location.hash = '#/'));
  });
  missions = createMissions(backend, shell);
  status = createStatus(backend, shell);
  syncMissionBadge();
  syncStatus();
  const views: Record<string, { el: HTMLElement; enter(sub?: string): void; leave(): void }> = { '': shop, collection: coll, contrats: contracts, echanges: trades, profil: profile };
  let current = '';

  function route() {
    const [r = '', sub] = location.hash.replace(/^#\/?/, '').split('/');
    const key = r in views ? r : '';
    if (shop.busy() && key !== '') {
      // pas de fuite au milieu d'une ouverture : le pack est déjà tiré, on le finit
      history.replaceState(null, '', '#/');
      toast('Termine d’abord ton booster !', 'info');
      return;
    }
    if (views[current] && current !== key) views[current].leave();
    const changed = current !== key;
    if (changed && shell) shell.sfx.tick(1.15, 0.025); // changement de page : un tic à peine audible
    current = key;
    viewHost.replaceChildren(views[key].el);
    // la page arrive en fondu (pas de saut sec d'un écran à l'autre)
    if (changed) {
      const v = views[key].el;
      v.classList.remove('view-in');
      void v.offsetWidth;
      v.classList.add('view-in');
    }
    document.body.dataset.route = key || 'shop';
    currentRoute = key;
    updateTitle();
    top.querySelectorAll<HTMLElement>('nav a').forEach((a) => {
      a.classList.toggle('on', a.dataset.r === key);
      if (a.dataset.r === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    placePill(changed);
    meEl.querySelector('.user')?.classList.toggle('on', key === 'profil');
    views[key].enter(sub);
    updateFresh(true); // on vient (peut-être) de quitter la collection : ce qu'on y a vu est vu
  }
  window.addEventListener('hashchange', route);
  backend.onChange(renderMe);
  backend.onChange(() => updateFresh());
  route();
  step(100, 'c’est prêt');
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);

  // en tâche de fond : visionneuse (shaders) puis miniatures de la collection
  setTimeout(() => {
    void getViewer();
    preloadOwned(backend.state.collection.map((c) => c.cardId));
  }, 1500);

  // crochet de test (Playwright)
  (window as unknown as { __jeu: unknown }).__jeu = {
    get ready() {
      return true;
    },
    backend,
    shell,
    opening,
    tap: () => (shell.input as unknown as { taps: Set<(x: number, y: number, e: unknown) => void> }).taps.forEach((f) => f(0, 0, {})),
  };
}

boot().catch((e) => {
  console.error(e);
  // message lisible (la cause technique reste dessous, en petit, pour nous aider à comprendre)
  loader.classList.add('failed');
  loader.querySelector<HTMLElement>('.l-txt')!.innerHTML = `Ton navigateur n’arrive pas à démarrer la 3D.<br>Essaie Chrome, Edge ou Safari à jour, puis recharge la page.<small>${esc(String(e)).slice(0, 220)}</small>`;
});
